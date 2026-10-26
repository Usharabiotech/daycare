/**
 * DEMO AUTHENTICATION ONLY.
 * A cookie holds the id of a seeded user so you can switch between a family and a centre
 * director. Replace with a real provider (Auth.js, Clerk, Cognito) before any pilot:
 * keep the same `currentUser()` / `require*()` signatures and the rest of the app won't change.
 */
import { cookies } from 'next/headers';
import { eq } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { dependants, locations, users, type User } from '@/db/schema';
import { DomainError } from '@/domain/types';

export const SESSION_COOKIE = 'openslot_uid';

export async function currentUser(): Promise<User | null> {
  const uid = cookies().get(SESSION_COOKIE)?.value;
  if (!uid || !/^[0-9a-f-]{36}$/i.test(uid)) return null;
  const [u] = await getDb().select().from(users).where(eq(users.id, uid));
  return u ?? null;
}

export async function requireFamily() {
  const u = await currentUser();
  if (!u || u.role !== 'family' || !u.customerId) throw new DomainError('Sign in as a family to do this.', 401);
  return { user: u, customerId: u.customerId };
}

export async function requireCentreAdmin(locationId?: string) {
  const u = await currentUser();
  if (!u || u.role !== 'centre_admin' || !u.orgId) throw new DomainError('Sign in as a centre director to do this.', 401);
  if (locationId) {
    const [loc] = await getDb().select({ orgId: locations.orgId }).from(locations).where(eq(locations.id, locationId));
    if (!loc || loc.orgId !== u.orgId) throw new DomainError('You do not manage this centre.', 403);
  }
  return { user: u, orgId: u.orgId };
}

export async function familyChildren(customerId: string) {
  return getDb().select().from(dependants).where(eq(dependants.customerId, customerId));
}

export async function allUsers() {
  return getDb().select().from(users);
}
