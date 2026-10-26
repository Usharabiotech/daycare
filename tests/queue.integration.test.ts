/**
 * End-to-end check of the offer → accept flow against a real (in-memory) Postgres.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';

process.env.DATABASE_URL = '';
process.env.PGLITE_DIR = 'memory';

import { getDb, resetDbForTests } from '@/db/client';
import { runMigrations } from '@/db/migrate';
import { seed } from '@/db/seed';
import { customers, locations, queueEntries, resources, users } from '@/db/schema';
import { acceptOffer, familyWaitlists, joinQueue, locationQueue, offerSpace } from '@/services/queue';
import { searchListings } from '@/services/listings';
import { billingPreview } from '@/services/centre';

beforeAll(async () => {
  resetDbForTests();
  await runMigrations();
  await seed(getDb());
}, 120_000);

async function demoFamily() {
  const [c] = await getDb().select().from(customers).where(eq(customers.email, 'priya@example.com'));
  return c;
}

async function centre(name: string) {
  const [l] = await getDb().select().from(locations).where(eq(locations.name, name));
  return l;
}

describe('waitlists and offers', () => {
  it('publishes availability to the family listing', async () => {
    const { listings } = await searchListings({ city: 'Toronto', ageGroup: 'preschool' });
    const maple = listings.find((l) => l.name === 'Maple Leaf Early Learning')!;
    // 24 places, 21 enrolled, 1 held by an open offer → 2 open
    expect(maple.rooms[0].open).toBe(2);
  });

  it('accepting an offer enrols the child and closes their other waitlist entries', async () => {
    const fam = await demoFamily();
    const before = await familyWaitlists(fam.id);
    const offer = before.find((e) => e.entry.status === 'offered')!;
    expect(offer).toBeTruthy();
    const otherForSameChild = before.filter((e) => e.entry.dependantId === offer.entry.dependantId && e.entry.id !== offer.entry.id);
    expect(otherForSameChild.length).toBe(1);

    const result = await acceptOffer(offer.entry.id, { customerId: fam.id });
    expect(result.closedOtherEntries).toBe(1);

    const after = await familyWaitlists(fam.id);
    expect(after.some((e) => e.entry.dependantId === offer.entry.dependantId)).toBe(false);
  });

  it('refuses to offer a space in a full room', async () => {
    const harbour = await centre('Little Harbour Childcare');
    const [director] = await getDb().select().from(users).where(eq(users.orgId, harbour.orgId));
    const queue = await locationQueue(harbour.id);
    const infant = queue.find((q) => q.room.attrs.ageGroup === 'infant')!;
    expect(infant.open).toBe(0);
    await expect(offerSpace(infant.entries[0].entry.id, { orgId: director.orgId! })).rejects.toThrow(/no open space/);
  });

  it('lets a centre offer an open space and holds it', async () => {
    const rideau = await centre('Rideau Kids Centre');
    const [director] = await getDb().select().from(users).where(eq(users.orgId, rideau.orgId));
    const queue = await locationQueue(rideau.id);
    const infant = queue.find((q) => q.room.attrs.ageGroup === 'infant')!;
    expect(infant.open).toBe(1);
    const offered = await offerSpace(infant.entries[0].entry.id, { orgId: director.orgId! });
    expect(offered.status).toBe('offered');
    const [room] = await getDb().select().from(resources).where(eq(resources.id, infant.room.id));
    expect(room.publishedOpen).toBe(0);
  });

  it('blocks duplicate applications for the same child and room', async () => {
    const fam = await demoFamily();
    const [entry] = await getDb().select().from(queueEntries).where(and(eq(queueEntries.customerId, fam.id), eq(queueEntries.status, 'waiting')));
    await expect(joinQueue({ customerId: fam.id, dependantId: entry.dependantId, resourceId: entry.resourceId })).rejects.toThrow(/already/);
  });

  it('splits fees between parent, subsidy and program funding', async () => {
    const bow = await centre('Bow Valley Learning');
    const lines = await billingPreview(bow.id);
    expect(lines.length).toBeGreaterThan(0);
    for (const l of lines) {
      expect(l.parentCents + l.subsidyCents).toBe(32625);
      expect(l.programCents).toBe(145000 - 32625);
    }
  });
});
