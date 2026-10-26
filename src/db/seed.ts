/**
 * Sample data for local development and demos. All centres, families and children are invented.
 * Run `npm run db:seed` (add `-- --reset` to wipe and reseed).
 */
import 'dotenv/config';
import { sql } from 'drizzle-orm';
import { getDb, type DB } from './client';
import {
  attendance, bookings, customers, dependants, locations, organizations, queueEntries, resources, staff, users,
} from './schema';
import type { AgeGroup } from '@/domain/types';
import { getProvince, staffRequired } from '@/domain/rules/provinces';
import { atLocalTime, localDate, timeZoneFor } from '@/domain/time';
import { refreshPublished } from '@/services/capacity';

interface CentreSeed {
  key: string; org: string; name: string; city: string; province: string; hours: string; feeMonthly: number; inProgram: boolean;
  rooms: Record<AgeGroup, { cap: number; enr: number; wait: number }>;
}

const CENTRES: CentreSeed[] = [
  { key: 'maple', org: 'Maple Early Learning Group', name: 'Maple Leaf Early Learning', city: 'Toronto', province: 'ON', hours: '7:00–18:00', feeMonthly: 1950, inProgram: true,
    rooms: { infant: { cap: 10, enr: 10, wait: 142 }, toddler: { cap: 15, enr: 14, wait: 96 }, preschool: { cap: 24, enr: 21, wait: 58 } } },
  { key: 'harbour', org: 'Maple Early Learning Group', name: 'Little Harbour Childcare', city: 'Toronto', province: 'ON', hours: '7:30–18:00', feeMonthly: 1900, inProgram: true,
    rooms: { infant: { cap: 10, enr: 10, wait: 210 }, toddler: { cap: 10, enr: 10, wait: 118 }, preschool: { cap: 16, enr: 16, wait: 73 } } },
  { key: 'rideau', org: 'Rideau Kids Co-operative', name: 'Rideau Kids Centre', city: 'Ottawa', province: 'ON', hours: '7:00–17:30', feeMonthly: 1800, inProgram: true,
    rooms: { infant: { cap: 10, enr: 9, wait: 64 }, toddler: { cap: 15, enr: 15, wait: 81 }, preschool: { cap: 24, enr: 22, wait: 40 } } },
  { key: 'grandriver', org: 'Grand River Discovery Inc.', name: 'Grand River Discovery', city: 'Waterloo', province: 'ON', hours: '7:00–18:00', feeMonthly: 1750, inProgram: true,
    rooms: { infant: { cap: 10, enr: 10, wait: 188 }, toddler: { cap: 15, enr: 15, wait: 140 }, preschool: { cap: 32, enr: 30, wait: 66 } } },
  { key: 'cedar', org: 'Cedar & Sprout Society', name: 'Cedar & Sprout', city: 'Vancouver', province: 'BC', hours: '7:30–17:30', feeMonthly: 1650, inProgram: false,
    rooms: { infant: { cap: 12, enr: 12, wait: 77 }, toddler: { cap: 12, enr: 11, wait: 52 }, preschool: { cap: 25, enr: 22, wait: 31 } } },
  { key: 'bowvalley', org: 'Bow Valley Learning Ltd.', name: 'Bow Valley Learning', city: 'Calgary', province: 'AB', hours: '6:30–18:00', feeMonthly: 1450, inProgram: true,
    rooms: { infant: { cap: 9, enr: 8, wait: 29 }, toddler: { cap: 15, enr: 13, wait: 22 }, preschool: { cap: 24, enr: 20, wait: 14 } } },
  { key: 'bouleaux', org: 'CPE Les Petits Bouleaux', name: 'CPE Les Petits Bouleaux', city: 'Montreal', province: 'QC', hours: '7:00–18:00', feeMonthly: 1100, inProgram: true,
    rooms: { infant: { cap: 10, enr: 10, wait: 163 }, toddler: { cap: 16, enr: 16, wait: 120 }, preschool: { cap: 30, enr: 29, wait: 88 } } },
];

const FIRST = ['Ava', 'Noah', 'Liam', 'Maya', 'Arjun', 'Zoe', 'Ethan', 'Léa', 'Omar', 'Chloe', 'Mila', 'Owen', 'Priya', 'Lucas', 'Aria', 'Kai', 'Nora', 'Elias', 'Isla', 'Theo', 'Amara', 'Felix', 'Hana', 'Jonah'];
const LAST = ['Tremblay', 'Singh', 'Nguyen', 'Martin', 'Roy', 'Chen', 'Patel', 'Gagnon', 'Smith', 'Wong', 'Ali', 'Brown', 'Lee', 'Côté', 'Kaur', 'Okafor', 'Haddad'];
const AGE_MONTHS: Record<AgeGroup, [number, number]> = { infant: [3, 17], toddler: [18, 29], preschool: [30, 46] };

function rng(seed: number) {
  let s = seed;
  return () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
}

function isoDate(d: Date) { return d.toISOString().slice(0, 10); }
function monthsAgo(now: Date, m: number) { const d = new Date(now); d.setUTCMonth(d.getUTCMonth() - m); return d; }

async function chunkedInsert<T>(rows: T[], fn: (batch: T[]) => Promise<unknown>, size = 400) {
  for (let i = 0; i < rows.length; i += size) await fn(rows.slice(i, i + size));
}

export async function seed(db: DB = getDb(), now = new Date()) {
  const r = rng(42);
  const pick = <T,>(a: T[]) => a[Math.floor(r() * a.length)];

  // --- Demo family ---------------------------------------------------------
  const [family] = await db.insert(customers).values({ name: 'Priya Sharma', email: 'priya@example.com', phone: '+1 416 555 0142', province: 'ON' }).returning();
  const [aarav, meera] = await db.insert(dependants).values([
    { customerId: family.id, name: 'Aarav Sharma', birthDate: isoDate(monthsAgo(now, 4)) },
    { customerId: family.id, name: 'Meera Sharma', birthDate: isoDate(monthsAgo(now, 38)) },
  ]).returning();
  await db.insert(users).values({ email: 'priya@example.com', name: 'Priya Sharma (family)', role: 'family', customerId: family.id });

  // --- Organizations, centres, rooms --------------------------------------
  const orgIds = new Map<string, string>();
  const roomIds: Record<string, Record<AgeGroup, string>> = {};
  for (const c of CENTRES) {
    if (!orgIds.has(c.org)) {
      const [o] = await db.insert(organizations).values({ name: c.org }).returning();
      orgIds.set(c.org, o.id);
      const slug = c.org.toLowerCase().replace(/[^a-z]+/g, '.').replace(/^\.|\.$/g, '');
      await db.insert(users).values({ email: `director@${slug}.example`, name: `Director, ${c.org}`, role: 'centre_admin', orgId: o.id });
    }
    const [loc] = await db.insert(locations).values({
      orgId: orgIds.get(c.org)!, vertical: 'childcare', name: c.name, city: c.city, province: c.province, hours: c.hours,
      baseFeeCents: c.feeMonthly * 100, licenceNo: `SAMPLE-${c.key.toUpperCase()}`,
      attrs: { fundingPrograms: c.inProgram ? [c.province === 'AB' ? 'AB_AFFORDABILITY' : 'CWELCC'] : [] },
    }).returning();
    roomIds[c.key] = {} as Record<AgeGroup, string>;
    const rules = getProvince(c.province)!;

    for (const age of ['infant', 'toddler', 'preschool'] as AgeGroup[]) {
      const spec = c.rooms[age];
      const [room] = await db.insert(resources).values({
        locationId: loc.id, vertical: 'childcare', kind: 'room', capacity: spec.cap,
        name: { infant: 'Infant room', toddler: 'Toddler room', preschool: 'Preschool room' }[age],
        attrs: { ageGroup: age },
      }).returning();
      roomIds[c.key][age] = room.id;

      // Enrolled children
      const enrolled = Array.from({ length: spec.enr }, () => ({ name: `${pick(FIRST)} ${pick(LAST)}`, months: AGE_MONTHS[age][0] + Math.floor(r() * (AGE_MONTHS[age][1] - AGE_MONTHS[age][0])) }));
      const custRows = await db.insert(customers).values(enrolled.map((_, i) => ({ name: `Parent ${c.key}-${age}-${i}`, email: `parent.${c.key}.${age}.${i}@example.com`, province: c.province }))).returning({ id: customers.id });
      const depRows = await db.insert(dependants).values(enrolled.map((e, i) => ({ customerId: custRows[i].id, name: e.name, birthDate: isoDate(monthsAgo(now, e.months)) }))).returning({ id: dependants.id });
      const bk = await db.insert(bookings).values(depRows.map((d, i) => ({
        resourceId: room.id, customerId: custRows[i].id, dependantId: d.id,
        startDate: isoDate(monthsAgo(now, 1 + Math.floor(r() * 12))),
        subsidyMonthlyCents: r() < 0.27 ? 15000 + Math.floor(r() * 4) * 5000 : 0,
      }))).returning({ id: bookings.id });
      // Today's attendance: ~88% checked in between 7 and 9 a.m. on the centre's own clock
      const tz = timeZoneFor(c.province);
      const localToday = localDate(tz, now);
      const checkIns = bk.filter(() => r() < 0.88).map((b) => ({
        bookingId: b.id, day: localToday, checkInAt: atLocalTime(tz, localToday, 7 + Math.floor(r() * 2), Math.floor(r() * 60)),
      }));
      if (checkIns.length) await db.insert(attendance).values(checkIns);

      // Staff: enough for full capacity, except Toronto toddler room which is one short (shows a ratio alert)
      let needed = staffRequired(Math.round(spec.enr * 0.88), rules.ratios[age]);
      if (c.key === 'maple' && age === 'toddler') needed = Math.max(1, needed - 1);
      await db.insert(staff).values(Array.from({ length: needed }, (_, i) => ({
        locationId: loc.id, resourceId: room.id, name: `${pick(FIRST)} ${pick(LAST)}`, role: i === 0 ? 'RECE (lead)' : 'RECE',
      })));

      // Waitlist (anonymous families)
      const waiters = Array.from({ length: spec.wait }, (_, i) => i);
      const wc: { id: string }[] = [];
      const wd: { id: string }[] = [];
      await chunkedInsert(waiters, async (batch) => {
        const cs = await db.insert(customers).values(batch.map((i) => ({ name: `Waiting family ${c.key}-${age}-${i}`, email: `wait.${c.key}.${age}.${i}@example.com`, province: c.province }))).returning({ id: customers.id });
        const ds = await db.insert(dependants).values(batch.map((_, j) => ({ customerId: cs[j].id, name: `${pick(FIRST)} ${pick(LAST)}`, birthDate: isoDate(monthsAgo(now, Math.floor(r() * 30))) }))).returning({ id: dependants.id });
        wc.push(...cs); wd.push(...ds);
      });
      await chunkedInsert(waiters, (batch) => db.insert(queueEntries).values(batch.map((i) => ({
        resourceId: room.id, customerId: wc[i].id, dependantId: wd[i].id,
        appliedAt: monthsAgo(now, Math.floor(r() * 28)),
        desiredStart: isoDate(monthsAgo(now, -Math.floor(r() * 6))),
        flags: { sibling: r() < 0.12, needsSubsidy: r() < 0.27 },
      }))));
    }
  }

  // --- Demo family's own waitlist entries ---------------------------------
  await db.insert(queueEntries).values([
    { resourceId: roomIds.maple.infant, customerId: family.id, dependantId: aarav.id, appliedAt: monthsAgo(now, 9), desiredStart: isoDate(monthsAgo(now, -8)) },
    { resourceId: roomIds.rideau.infant, customerId: family.id, dependantId: aarav.id, appliedAt: monthsAgo(now, 9), desiredStart: isoDate(monthsAgo(now, -8)) },
    { resourceId: roomIds.grandriver.infant, customerId: family.id, dependantId: aarav.id, appliedAt: monthsAgo(now, 7), desiredStart: isoDate(monthsAgo(now, -8)) },
    { resourceId: roomIds.harbour.preschool, customerId: family.id, dependantId: meera.id, appliedAt: monthsAgo(now, 14), desiredStart: isoDate(monthsAgo(now, -1)) },
    // An offer waiting for Priya to accept (Maple Leaf preschool has open spaces)
    { resourceId: roomIds.maple.preschool, customerId: family.id, dependantId: meera.id, appliedAt: monthsAgo(now, 16), desiredStart: isoDate(monthsAgo(now, -1)),
      status: 'offered', offeredAt: now, offerExpiresAt: new Date(now.getTime() + 48 * 3600 * 1000) },
  ]);

  // Publish availability for every room so families see counts straight away
  const allRooms = await db.select({ id: resources.id }).from(resources);
  await refreshPublished(db, allRooms.map((x) => x.id));
}

export async function resetDb(db: DB = getDb()) {
  await db.execute(sql`TRUNCATE centre_claims, interests, invoices, attendance, staff, bookings, queue_entries, users, dependants, customers, resources, locations, organizations RESTART IDENTITY CASCADE`);
}

if (process.argv[1]?.endsWith('seed.ts')) {
  (async () => {
    const db = getDb();
    const reset = process.argv.includes('--reset');
    const existing = await db.select({ id: organizations.id }).from(organizations).limit(1);
    if (existing.length && !reset) {
      console.log('Database already has data. Run `npm run db:seed -- --reset` to wipe and reseed.');
      process.exit(0);
    }
    if (reset) await resetDb(db);
    await seed(db);
    console.log('Seeded sample centres, families and waitlists.');
    process.exit(0);
  })().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
