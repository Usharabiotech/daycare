/**
 * Public centre pages, families' interest in centres that haven't joined yet, and operators'
 * requests to claim those listings.
 */
import { and, asc, eq } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { centreClaims, dependants, interests, locations, organizations } from '@/db/schema';
import { DomainError, isAgeGroup, type AgeGroup } from '@/domain/types';
import { locationAvailability } from './listings';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function centreDetail(locationId: string) {
  if (!UUID.test(locationId)) return null;
  const db = getDb();
  const [row] = await db
    .select({ location: locations, operator: organizations.name })
    .from(locations)
    .innerJoin(organizations, eq(organizations.id, locations.orgId))
    .where(and(eq(locations.id, locationId), eq(locations.vertical, 'childcare')));
  if (!row) return null;
  const listing = await locationAvailability(locationId);
  return { ...row, listing: listing! };
}

async function directoryCentre(locationId: string) {
  if (!UUID.test(locationId)) throw new DomainError('Centre not found.', 404);
  const [loc] = await getDb().select().from(locations).where(eq(locations.id, locationId));
  if (!loc) throw new DomainError('Centre not found.', 404);
  if (!loc.attrs.directory) throw new DomainError('This centre takes applications on NidHub — join its waitlist instead.', 409);
  return loc;
}

export async function registerInterest(input: { customerId: string; locationId: string; dependantId: string; ageGroup: string }) {
  if (!isAgeGroup(input.ageGroup)) throw new DomainError('Choose an age group.');
  await directoryCentre(input.locationId);
  const db = getDb();
  const [child] = UUID.test(input.dependantId)
    ? await db.select().from(dependants).where(and(eq(dependants.id, input.dependantId), eq(dependants.customerId, input.customerId)))
    : [];
  if (!child) throw new DomainError('Choose one of your children.', 404);
  await db
    .insert(interests)
    .values({ locationId: input.locationId, customerId: input.customerId, dependantId: child.id, ageGroup: input.ageGroup as AgeGroup })
    .onConflictDoUpdate({ target: [interests.locationId, interests.dependantId], set: { ageGroup: input.ageGroup as AgeGroup } });
  return child;
}

export async function removeInterest(interestId: string, customerId: string) {
  if (!UUID.test(interestId)) throw new DomainError('Interest not found.', 404);
  const removed = await getDb()
    .delete(interests)
    .where(and(eq(interests.id, interestId), eq(interests.customerId, customerId)))
    .returning({ id: interests.id });
  if (removed.length === 0) throw new DomainError('Interest not found.', 404);
}

export async function familyInterests(customerId: string) {
  return getDb()
    .select({ interest: interests, location: locations, childName: dependants.name })
    .from(interests)
    .innerJoin(locations, eq(locations.id, interests.locationId))
    .innerJoin(dependants, eq(dependants.id, interests.dependantId))
    .where(eq(interests.customerId, customerId))
    .orderBy(asc(locations.name), asc(dependants.name));
}

export const CLAIM_ROLES = ['Owner', 'Director or supervisor', 'Licensee representative', 'Other staff'] as const;

/** Records an operator's request to take over a listing. Nothing is granted until a person verifies it. */
export async function submitClaim(input: { locationId: string; name: string; role: string; email: string; phone: string; note?: string }) {
  const name = input.name.trim();
  const email = input.email.trim().toLowerCase();
  const phone = input.phone.trim();
  const note = (input.note ?? '').trim();
  if (name.length < 2 || name.length > 120) throw new DomainError('Enter your full name.');
  if (!(CLAIM_ROLES as readonly string[]).includes(input.role)) throw new DomainError('Choose your role at the centre.');
  if (email.length > 200 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new DomainError('Enter a valid email address.');
  if (phone.replace(/\D/g, '').length < 10 || phone.length > 30) throw new DomainError('Enter a phone number we can call to verify you.');
  if (note.length > 1000) throw new DomainError('Keep the note under 1,000 characters.');

  const loc = await directoryCentre(input.locationId);
  const db = getDb();
  const [dup] = await db
    .select({ id: centreClaims.id })
    .from(centreClaims)
    .where(and(eq(centreClaims.locationId, loc.id), eq(centreClaims.email, email), eq(centreClaims.status, 'pending')));
  if (dup) throw new DomainError('We already have your request for this centre and will be in touch.', 409);

  await db.insert(centreClaims).values({ locationId: loc.id, name, role: input.role, email, phone, note: note || null });
  return loc;
}
