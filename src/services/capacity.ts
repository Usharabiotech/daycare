import { and, count, eq, inArray } from 'drizzle-orm';
import type { DB, Tx } from '@/db/client';
import { bookings, queueEntries, resources } from '@/db/schema';

export interface Occupancy {
  active: number;
  offered: number;
  waiting: number;
}

/** Live counts per resource: enrolled, spaces held by open offers, and families waiting. */
export async function occupancy(db: DB | Tx, resourceIds: string[]): Promise<Map<string, Occupancy>> {
  const out = new Map<string, Occupancy>(resourceIds.map((id) => [id, { active: 0, offered: 0, waiting: 0 }]));
  if (resourceIds.length === 0) return out;

  const active = await db
    .select({ resourceId: bookings.resourceId, n: count() })
    .from(bookings)
    .where(and(inArray(bookings.resourceId, resourceIds), eq(bookings.status, 'active')))
    .groupBy(bookings.resourceId);
  for (const r of active) out.get(r.resourceId)!.active = Number(r.n);

  const queued = await db
    .select({ resourceId: queueEntries.resourceId, status: queueEntries.status, n: count() })
    .from(queueEntries)
    .where(and(inArray(queueEntries.resourceId, resourceIds), inArray(queueEntries.status, ['waiting', 'offered'])))
    .groupBy(queueEntries.resourceId, queueEntries.status);
  for (const r of queued) {
    const o = out.get(r.resourceId)!;
    if (r.status === 'waiting') o.waiting = Number(r.n);
    else o.offered = Number(r.n);
  }
  return out;
}

export function openSpaces(capacity: number, o: Occupancy): number {
  return Math.max(0, capacity - o.active - o.offered);
}

/** Recompute what families see for these resources. Called after any enrolment or offer change. */
export async function refreshPublished(db: DB | Tx, resourceIds: string[]) {
  if (resourceIds.length === 0) return;
  const rows = await db.select().from(resources).where(inArray(resources.id, resourceIds));
  const occ = await occupancy(db, resourceIds);
  const now = new Date();
  for (const r of rows) {
    await db
      .update(resources)
      .set({ publishedOpen: openSpaces(r.capacity, occ.get(r.id)!), publishedAt: now })
      .where(eq(resources.id, r.id));
  }
}
