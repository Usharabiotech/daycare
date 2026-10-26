import { and, asc, count, eq, exists, gt, inArray, sql } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { interests, locations, resources } from '@/db/schema';
import type { Location, Resource } from '@/db/schema';
import type { AgeGroup } from '@/domain/types';
import { occupancy, type Occupancy } from './capacity';

export interface ListingFilter {
  city?: string;
  ageGroup?: AgeGroup;
  onlyOpen?: boolean;
  onlyProgram?: boolean;
  /** Max locations to return. The registry has thousands of directory centres, so pages cap this. */
  limit?: number;
  /** Locations to skip before the page starts (with `limit`). */
  offset?: number;
}

export interface ListingRoom {
  resourceId: string;
  name: string;
  ageGroup?: AgeGroup;
  capacity: number;
  /** Published open spaces; null if the centre has never published. */
  open: number | null;
  waiting: number;
  publishedAt: Date | null;
}

export interface Listing {
  locationId: string;
  name: string;
  city: string;
  province: string;
  address: string | null;
  hours: string | null;
  baseFeeCents: number | null;
  inProgram: boolean;
  /** A public-registry listing not yet claimed by the centre: no live availability or fees. */
  directory: boolean;
  programType: string | null;
  /** Children registered as interested on NidHub (directory centres only). */
  interested: number;
  rooms: ListingRoom[];
  updatedAt: Date | null;
}

/** Number of children registered as interested, per centre. */
export async function interestCounts(locationIds: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (locationIds.length === 0) return out;
  const rows = await getDb()
    .select({ locationId: interests.locationId, n: count() })
    .from(interests)
    .where(inArray(interests.locationId, locationIds))
    .groupBy(interests.locationId);
  for (const r of rows) out.set(r.locationId, Number(r.n));
  return out;
}

function toListing(l: Location, rooms: Resource[], occ: Map<string, Occupancy>, interested: Map<string, number>): Listing {
  const lr: ListingRoom[] = rooms.map((r) => ({
    resourceId: r.id,
    name: r.name,
    ageGroup: r.attrs.ageGroup,
    capacity: r.capacity,
    open: r.publishedOpen,
    waiting: occ.get(r.id)?.waiting ?? 0,
    publishedAt: r.publishedAt,
  }));
  const updatedAt = lr.reduce<Date | null>((m, r) => (r.publishedAt && (!m || r.publishedAt > m) ? r.publishedAt : m), null);
  return {
    locationId: l.id, name: l.name, city: l.city, province: l.province, address: l.address,
    hours: l.hours, baseFeeCents: l.baseFeeCents, inProgram: (l.attrs.fundingPrograms ?? []).length > 0,
    directory: l.attrs.directory === true, programType: l.attrs.programType ?? null,
    interested: interested.get(l.id) ?? 0, rooms: lr, updatedAt,
  };
}

export interface ListingPage {
  listings: Listing[];
  /** All locations matching the filters, before the `limit` cap. */
  total: number;
}

/**
 * Public, family-facing search. Only shows rooms the centre has made public.
 *
 * Filtering, counting and paging happen in the database: the registry has thousands of
 * centres, and a page shows a few dozen, so only those rows (and their rooms) are fetched.
 */
export async function searchListings(filter: ListingFilter = {}): Promise<ListingPage> {
  const db = getDb();
  // The rooms a family can see for this search: public, and in the age group asked for.
  const visibleRoom = and(
    eq(resources.isPublic, true),
    filter.ageGroup ? sql`${resources.attrs}->>'ageGroup' = ${filter.ageGroup}` : undefined,
  );
  const where = and(
    eq(locations.vertical, 'childcare'),
    filter.city ? eq(locations.city, filter.city) : undefined,
    // `->0` is NULL for a missing or empty array (and never errors on other shapes).
    filter.onlyProgram ? sql`(${locations.attrs}->'fundingPrograms'->0) IS NOT NULL` : undefined,
    // A centre shows only if it has a visible room — with an open space, when that was asked for.
    exists(
      db.select({ one: sql`1` }).from(resources).where(and(
        eq(resources.locationId, locations.id),
        visibleRoom,
        filter.onlyOpen ? gt(resources.publishedOpen, 0) : undefined,
      )),
    ),
  );

  const [{ total }] = await db.select({ total: count() }).from(locations).where(where);
  if (total === 0) return { listings: [], total: 0 };

  // Several real centres share a name in the same city, so `id` breaks ties to keep pages stable.
  const ordered = db.select().from(locations).where(where).orderBy(asc(locations.city), asc(locations.name), asc(locations.id));
  const locs = filter.limit ? await ordered.limit(filter.limit).offset(filter.offset ?? 0) : await ordered;

  const rooms = await db
    .select()
    .from(resources)
    .where(and(inArray(resources.locationId, locs.map((l) => l.id)), visibleRoom))
    .orderBy(asc(resources.capacity));
  const roomsByLoc = new Map<string, Resource[]>();
  for (const r of rooms) (roomsByLoc.get(r.locationId) ?? roomsByLoc.set(r.locationId, []).get(r.locationId)!).push(r);

  const [occ, interested] = await Promise.all([
    occupancy(db, rooms.map((r) => r.id)),
    interestCounts(locs.filter((l) => l.attrs.directory).map((l) => l.id)),
  ]);
  return { listings: locs.map((l) => toListing(l, roomsByLoc.get(l.id) ?? [], occ, interested)), total };
}

export async function listCities(): Promise<string[]> {
  const rows = await getDb()
    .selectDistinct({ city: locations.city })
    .from(locations)
    .where(eq(locations.vertical, 'childcare'))
    .orderBy(asc(locations.city));
  return rows.map((r) => r.city);
}

/** Public availability for one location — used by the embeddable widget and the mobile app. */
export async function locationAvailability(locationId: string): Promise<Listing | null> {
  const db = getDb();
  const [loc] = await db.select().from(locations).where(eq(locations.id, locationId)).limit(1);
  if (!loc) return null;
  const rooms = await db
    .select()
    .from(resources)
    .where(and(eq(resources.locationId, locationId), eq(resources.isPublic, true)))
    .orderBy(asc(resources.capacity));
  const [occ, interested] = await Promise.all([occupancy(db, rooms.map((r) => r.id)), interestCounts([loc.id])]);
  return toListing(loc, rooms, occ, interested);
}
