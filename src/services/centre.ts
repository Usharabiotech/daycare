/** Centre-side ERP services: dashboard, attendance, billing, staffing. */
import { and, asc, eq, inArray } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { attendance, bookings, dependants, invoices, locations, resources, staff } from '@/db/schema';
import { getProvince, parentFeeMonthly, staffRequired } from '@/domain/rules/provinces';
import { DomainError } from '@/domain/types';
import { occupancy, openSpaces, refreshPublished } from './capacity';

export function todayISO(now = new Date()) {
  return now.toISOString().slice(0, 10);
}

export async function getLocation(locationId: string) {
  const [loc] = await getDb().select().from(locations).where(eq(locations.id, locationId));
  if (!loc) throw new DomainError('Centre not found.', 404);
  return loc;
}

export async function orgLocations(orgId: string) {
  return getDb().select().from(locations).where(eq(locations.orgId, orgId)).orderBy(asc(locations.name));
}

export async function dashboard(locationId: string, day = todayISO()) {
  const db = getDb();
  const rooms = await db.select().from(resources).where(eq(resources.locationId, locationId)).orderBy(asc(resources.capacity));
  const occ = await occupancy(db, rooms.map((r) => r.id));
  const present = await presentCountByRoom(locationId, day);
  return rooms.map((r) => {
    const o = occ.get(r.id)!;
    return { room: r, ...o, open: openSpaces(r.capacity, o), present: present.get(r.id) ?? 0 };
  });
}

export async function publishAvailability(locationId: string) {
  const db = getDb();
  const rooms = await db.select({ id: resources.id }).from(resources).where(eq(resources.locationId, locationId));
  await refreshPublished(db, rooms.map((r) => r.id));
}

async function presentCountByRoom(locationId: string, day: string) {
  const rows = await roster(locationId, day);
  const m = new Map<string, number>();
  for (const r of rows) if (r.checkedIn && !r.checkedOut) m.set(r.room.id, (m.get(r.room.id) ?? 0) + 1);
  return m;
}

export async function roster(locationId: string, day = todayISO()) {
  const db = getDb();
  const rows = await db
    .select({ booking: bookings, room: resources, childName: dependants.name })
    .from(bookings)
    .innerJoin(resources, eq(resources.id, bookings.resourceId))
    .innerJoin(dependants, eq(dependants.id, bookings.dependantId))
    .where(and(eq(resources.locationId, locationId), eq(bookings.status, 'active')))
    .orderBy(asc(resources.capacity), asc(dependants.name));
  const att = rows.length
    ? await db.select().from(attendance).where(and(inArray(attendance.bookingId, rows.map((r) => r.booking.id)), eq(attendance.day, day)))
    : [];
  const byBooking = new Map(att.map((a) => [a.bookingId, a]));
  return rows.map((r) => {
    const a = byBooking.get(r.booking.id);
    return { ...r, checkedIn: a?.checkInAt ?? null, checkedOut: a?.checkOutAt ?? null };
  });
}

/** Check in if not in; check out if in; check back in if already out. */
export async function toggleAttendance(bookingId: string, actor: { orgId: string }, now = new Date()) {
  const db = getDb();
  const [row] = await db
    .select({ booking: bookings, orgId: locations.orgId })
    .from(bookings)
    .innerJoin(resources, eq(resources.id, bookings.resourceId))
    .innerJoin(locations, eq(locations.id, resources.locationId))
    .where(eq(bookings.id, bookingId));
  if (!row) throw new DomainError('Enrolment not found.', 404);
  if (row.orgId !== actor.orgId) throw new DomainError('You do not manage this centre.', 403);

  const day = todayISO(now);
  const [existing] = await db.select().from(attendance).where(and(eq(attendance.bookingId, bookingId), eq(attendance.day, day)));
  if (!existing) {
    await db.insert(attendance).values({ bookingId, day, checkInAt: now });
  } else if (existing.checkInAt && !existing.checkOutAt) {
    await db.update(attendance).set({ checkOutAt: now }).where(eq(attendance.id, existing.id));
  } else {
    await db.update(attendance).set({ checkInAt: now, checkOutAt: null }).where(eq(attendance.id, existing.id));
  }
}

export async function ratioStatus(locationId: string, day = todayISO()) {
  const db = getDb();
  const loc = await getLocation(locationId);
  const rules = getProvince(loc.province);
  const rooms = await db.select().from(resources).where(eq(resources.locationId, locationId)).orderBy(asc(resources.capacity));
  const team = await db.select().from(staff).where(eq(staff.locationId, locationId));
  const present = await presentCountByRoom(locationId, day);
  return rooms.map((room) => {
    const ratio = rules && room.attrs.ageGroup ? rules.ratios[room.attrs.ageGroup] : null;
    const children = present.get(room.id) ?? 0;
    const onShift = team.filter((s) => s.resourceId === room.id && s.onShift);
    const needed = ratio ? staffRequired(children, ratio) : 0;
    return { room, ratio, children, staffOnShift: onShift.length, staffNames: onShift.map((s) => s.name), needed, ok: onShift.length >= needed };
  });
}

export async function toggleShift(staffId: string, actor: { orgId: string }) {
  const db = getDb();
  const [row] = await db.select({ s: staff, orgId: locations.orgId }).from(staff).innerJoin(locations, eq(locations.id, staff.locationId)).where(eq(staff.id, staffId));
  if (!row) throw new DomainError('Staff member not found.', 404);
  if (row.orgId !== actor.orgId) throw new DomainError('You do not manage this centre.', 403);
  await db.update(staff).set({ onShift: !row.s.onShift }).where(eq(staff.id, staffId));
}

export async function staffList(locationId: string) {
  return getDb()
    .select({ s: staff, roomName: resources.name })
    .from(staff)
    .leftJoin(resources, eq(resources.id, staff.resourceId))
    .where(eq(staff.locationId, locationId))
    .orderBy(asc(resources.capacity), asc(staff.name));
}

export interface BillingLine {
  bookingId: string;
  childName: string;
  roomName: string;
  feeCents: number;
  parentCents: number;
  subsidyCents: number;
  programCents: number;
  basis: string;
}

/** Splits each enrolment's monthly fee between parent, subsidy office and program funding. */
export async function billingPreview(locationId: string): Promise<BillingLine[]> {
  const loc = await getLocation(locationId);
  const inProgram = (loc.attrs.fundingPrograms ?? []).length > 0;
  const rows = await roster(locationId);
  const fee = loc.baseFeeCents ?? 0;
  return rows.map((r) => {
    const pf = parentFeeMonthly({ province: loc.province, centreFeeMonthly: fee / 100, inProgram });
    const parentBeforeSubsidy = Math.round(pf.amount * 100);
    const subsidy = Math.min(r.booking.subsidyMonthlyCents, parentBeforeSubsidy);
    return {
      bookingId: r.booking.id,
      childName: r.childName,
      roomName: r.room.name,
      feeCents: fee,
      parentCents: parentBeforeSubsidy - subsidy,
      subsidyCents: subsidy,
      programCents: Math.max(0, fee - parentBeforeSubsidy),
      basis: pf.basis,
    };
  });
}

/** Creates draft invoices for a period (YYYY-MM). Safe to run twice: existing ones are kept. */
export async function generateInvoices(locationId: string, period: string, actor: { orgId: string }) {
  if (!/^\d{4}-\d{2}$/.test(period)) throw new DomainError('Period must look like 2026-11.');
  const loc = await getLocation(locationId);
  if (loc.orgId !== actor.orgId) throw new DomainError('You do not manage this centre.', 403);
  const lines = await billingPreview(locationId);
  if (lines.length === 0) return 0;
  const inserted = await getDb()
    .insert(invoices)
    .values(lines.map((l) => ({
      bookingId: l.bookingId, period, feeCents: l.feeCents, parentCents: l.parentCents,
      subsidyCents: l.subsidyCents, programCents: l.programCents,
    })))
    .onConflictDoNothing()
    .returning({ id: invoices.id });
  return inserted.length;
}

export async function invoiceCount(locationId: string, period: string) {
  const db = getDb();
  const rows = await db
    .select({ id: invoices.id })
    .from(invoices)
    .innerJoin(bookings, eq(bookings.id, invoices.bookingId))
    .innerJoin(resources, eq(resources.id, bookings.resourceId))
    .where(and(eq(resources.locationId, locationId), eq(invoices.period, period)));
  return rows.length;
}
