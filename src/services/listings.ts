import { and, asc, count, eq, inArray } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { locations, resources } from '@/db/schema';
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
  rooms: ListingRoom[];
  updatedAt: Date | null;
}

function toListing(l: Location, rooms: Resource[], occ: Map<string, Occupancy>): Listing {
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
    directory: l.attrs.directory === true, programType: l.attrs.programType ?? null, rooms: lr, updatedAt,
  };
}

export interface ListingPage {
  listings: Listing[];
  /** Licensed childcare locations matching the city filter, before age/program/open narrowing or the cap. */
  total: number;
}

/** Public, family-facing search. Only shows rooms the centre has made public. */
export async function searchListings(filter: ListingFilter = {}): Promise<ListingPage> {
  const db = getDb();
  const cityWhere = and(eq(locations.vertical, 'childcare'), filter.city ? eq(locations.city, filter.city) : undefined);

  const [{ total }] = await db.select({ total: count() }).from(locations).where(cityWhere);

  const locs = await db.select().from(locations).where(cityWhere).orderBy(asc(locations.city), asc(locations.name));
  if (locs.length === 0) return { listings: [], total: 0 };

  const rooms = await db
    .select()
    .from(resources)
    .where(and(inArray(resources.locationId, locs.map((l) => l.id)), eq(resources.isPublic, true)))
    .orderBy(asc(resources.capacity));
  const roomsByLoc = new Map<string, Resource[]>();
  for (const r of rooms) (roomsByLoc.get(r.locationId) ?? roomsByLoc.set(r.locationId, []).get(r.locationId)!).push(r);

  // Narrow by age/program/open before computing occupancy, so we only count waitlists for what we show.
  const matched: { loc: Location; rooms: Resource[] }[] = [];
  for (const l of locs) {
    if (filter.onlyProgram && (l.attrs.fundingPrograms ?? []).length === 0) continue;
    let lr = roomsByLoc.get(l.id) ?? [];
    if (filter.ageGroup) lr = lr.filter((r) => r.attrs.ageGroup === filter.ageGroup);
    if (lr.length === 0) continue;
    if (filter.onlyOpen && !lr.some((r) => (r.publishedOpen ?? 0) > 0)) continue;
    matched.push({ loc: l, rooms: lr });
  }

  const shown = filter.limit ? matched.slice(0, filter.limit) : matched;
  const occ = await occupancy(db, shown.flatMap((m) => m.rooms.map((r) => r.id)));
  return { listings: shown.map((m) => toListing(m.loc, m.rooms, occ)), total: matched.length };
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
  const occ = await occupancy(db, rooms.map((r) => r.id));
  return toListing(loc, rooms, occ);
}
