import { and, eq, inArray, lt, ne } from 'drizzle-orm';
import { getDb, type Tx } from '@/db/client';
import { bookings, dependants, locations, queueEntries, resources, type QueueEntry } from '@/db/schema';
import { estimateWaitMonths, offerExpiry, orderQueue } from '@/domain/queue';
import { DomainError, type QueueFlags } from '@/domain/types';
import { occupancy, openSpaces, refreshPublished } from './capacity';

export interface JoinQueueInput {
  customerId: string;
  dependantId: string;
  resourceId: string;
  desiredStart?: string | null;
  flags?: QueueFlags;
}

export async function joinQueue(input: JoinQueueInput) {
  const db = getDb();
  const [dep] = await db.select().from(dependants).where(eq(dependants.id, input.dependantId));
  if (!dep || dep.customerId !== input.customerId) throw new DomainError('That child is not on your account.', 403);
  const [res] = await db.select().from(resources).where(eq(resources.id, input.resourceId));
  if (!res || !res.isPublic) throw new DomainError('That room is not accepting applications.', 404);

  const existing = await db
    .select({ id: queueEntries.id })
    .from(queueEntries)
    .where(and(
      eq(queueEntries.dependantId, input.dependantId),
      eq(queueEntries.resourceId, input.resourceId),
      inArray(queueEntries.status, ['waiting', 'offered']),
    ));
  if (existing.length) throw new DomainError(`${dep.name} is already on this waitlist.`, 409);

  const [entry] = await db.insert(queueEntries).values({
    resourceId: input.resourceId,
    customerId: input.customerId,
    dependantId: input.dependantId,
    desiredStart: input.desiredStart ?? null,
    flags: input.flags ?? {},
  }).returning();
  return entry;
}

/** All waiting/offered entries for a location's rooms, in admission order with positions. */
export async function locationQueue(locationId: string) {
  const db = getDb();
  const rooms = await db.select().from(resources).where(eq(resources.locationId, locationId));
  if (rooms.length === 0) return [];
  const rows = await db
    .select({ entry: queueEntries, childName: dependants.name, birthDate: dependants.birthDate })
    .from(queueEntries)
    .innerJoin(dependants, eq(dependants.id, queueEntries.dependantId))
    .where(and(inArray(queueEntries.resourceId, rooms.map((r) => r.id)), inArray(queueEntries.status, ['waiting', 'offered'])));
  const occ = await occupancy(db, rooms.map((r) => r.id));

  return rooms.map((room) => {
    const ordered = orderQueue(rows.filter((r) => r.entry.resourceId === room.id).map((r) => ({ ...r, appliedAt: r.entry.appliedAt, flags: r.entry.flags })));
    return {
      room,
      open: openSpaces(room.capacity, occ.get(room.id)!),
      entries: ordered.map((r, i) => ({ position: i + 1, ...r })),
    };
  });
}

/** Position and estimated wait for each of a family's active entries. */
export async function familyWaitlists(customerId: string) {
  const db = getDb();
  const mine = await db
    .select({ entry: queueEntries, room: resources, location: locations, childName: dependants.name })
    .from(queueEntries)
    .innerJoin(resources, eq(resources.id, queueEntries.resourceId))
    .innerJoin(locations, eq(locations.id, resources.locationId))
    .innerJoin(dependants, eq(dependants.id, queueEntries.dependantId))
    .where(and(eq(queueEntries.customerId, customerId), inArray(queueEntries.status, ['waiting', 'offered'])));
  if (mine.length === 0) return [];

  const resourceIds = [...new Set(mine.map((m) => m.room.id))];
  const all = await db
    .select({ id: queueEntries.id, resourceId: queueEntries.resourceId, appliedAt: queueEntries.appliedAt, flags: queueEntries.flags })
    .from(queueEntries)
    .where(and(inArray(queueEntries.resourceId, resourceIds), eq(queueEntries.status, 'waiting')));

  return mine.map((m) => {
    const ordered = orderQueue(all.filter((a) => a.resourceId === m.room.id));
    const position = m.entry.status === 'offered' ? 0 : ordered.findIndex((a) => a.id === m.entry.id) + 1;
    const ageGroup = m.room.attrs.ageGroup ?? 'preschool';
    return {
      ...m,
      position,
      total: ordered.length,
      wait: position > 0 ? estimateWaitMonths(ageGroup, m.room.capacity, position) : null,
    };
  });
}

async function loadEntryForUpdate(tx: Tx, entryId: string) {
  const [row] = await tx
    .select({ entry: queueEntries, room: resources, location: locations })
    .from(queueEntries)
    .innerJoin(resources, eq(resources.id, queueEntries.resourceId))
    .innerJoin(locations, eq(locations.id, resources.locationId))
    .where(eq(queueEntries.id, entryId));
  if (!row) throw new DomainError('Waitlist entry not found.', 404);
  return row;
}

/** Centre offers an open space to a family. The space is held until the offer expires. */
export async function offerSpace(entryId: string, actor: { orgId: string }, now = new Date()) {
  return getDb().transaction(async (tx) => {
    const { entry, room, location } = await loadEntryForUpdate(tx, entryId);
    if (location.orgId !== actor.orgId) throw new DomainError('You do not manage this centre.', 403);
    if (entry.status !== 'waiting') throw new DomainError('Only waiting families can receive an offer.', 409);
    const occ = await occupancy(tx, [room.id]);
    if (openSpaces(room.capacity, occ.get(room.id)!) <= 0) throw new DomainError(`${room.name} has no open space to offer.`, 409);

    const [updated] = await tx
      .update(queueEntries)
      .set({ status: 'offered', offeredAt: now, offerExpiresAt: offerExpiry(now) })
      .where(eq(queueEntries.id, entryId))
      .returning();
    await refreshPublished(tx, [room.id]);
    return updated;
  });
}

/**
 * Family accepts an offer: create the enrolment and close the child's other waitlist entries,
 * so other centres' lists shrink to real demand.
 */
export async function acceptOffer(entryId: string, actor: { customerId?: string; orgId?: string }, now = new Date()) {
  return getDb().transaction(async (tx) => {
    const { entry, room, location } = await loadEntryForUpdate(tx, entryId);
    const allowed = (actor.customerId && actor.customerId === entry.customerId) || (actor.orgId && actor.orgId === location.orgId);
    if (!allowed) throw new DomainError('You cannot accept this offer.', 403);
    if (entry.status !== 'offered') throw new DomainError('There is no open offer to accept.', 409);
    if (entry.offerExpiresAt && entry.offerExpiresAt < now) throw new DomainError('This offer has expired.', 410);

    const today = now.toISOString().slice(0, 10);
    const [booking] = await tx.insert(bookings).values({
      resourceId: room.id,
      customerId: entry.customerId,
      dependantId: entry.dependantId,
      queueEntryId: entry.id,
      startDate: entry.desiredStart && entry.desiredStart > today ? entry.desiredStart : today,
    }).returning();

    await tx.update(queueEntries)
      .set({ status: 'accepted', closedAt: now, closedReason: 'accepted' })
      .where(eq(queueEntries.id, entry.id));

    const others = await tx
      .update(queueEntries)
      .set({ status: 'withdrawn', closedAt: now, closedReason: 'accepted_elsewhere' })
      .where(and(
        eq(queueEntries.dependantId, entry.dependantId),
        ne(queueEntries.id, entry.id),
        inArray(queueEntries.status, ['waiting', 'offered']),
      ))
      .returning({ resourceId: queueEntries.resourceId });

    await refreshPublished(tx, [...new Set([room.id, ...others.map((o) => o.resourceId)])]);
    return { booking, closedOtherEntries: others.length };
  });
}

export async function declineOffer(entryId: string, actor: { customerId: string }, now = new Date()) {
  return getDb().transaction(async (tx) => {
    const { entry, room } = await loadEntryForUpdate(tx, entryId);
    if (entry.customerId !== actor.customerId) throw new DomainError('You cannot decline this offer.', 403);
    if (entry.status !== 'offered') throw new DomainError('There is no open offer to decline.', 409);
    await tx.update(queueEntries)
      .set({ status: 'declined', closedAt: now, closedReason: 'declined' })
      .where(eq(queueEntries.id, entryId));
    await refreshPublished(tx, [room.id]);
  });
}

export async function withdrawEntry(entryId: string, actor: { customerId: string }, now = new Date()) {
  const db = getDb();
  const [entry] = await db.select().from(queueEntries).where(eq(queueEntries.id, entryId));
  if (!entry || entry.customerId !== actor.customerId) throw new DomainError('Waitlist entry not found.', 404);
  await db.update(queueEntries)
    .set({ status: 'withdrawn', closedAt: now, closedReason: 'withdrawn_by_family' })
    .where(eq(queueEntries.id, entryId));
  await refreshPublished(db, [entry.resourceId]);
}

/** Scheduled job: release spaces held by offers nobody answered in time. */
export async function expireOffers(now = new Date()) {
  const db = getDb();
  const expired: Pick<QueueEntry, 'resourceId'>[] = await db
    .update(queueEntries)
    .set({ status: 'expired', closedAt: now, closedReason: 'offer_expired' })
    .where(and(eq(queueEntries.status, 'offered'), lt(queueEntries.offerExpiresAt, now)))
    .returning({ resourceId: queueEntries.resourceId });
  await refreshPublished(db, [...new Set(expired.map((e) => e.resourceId))]);
  return expired.length;
}
