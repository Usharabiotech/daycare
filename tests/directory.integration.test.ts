/**
 * Centre pages, families' interest in centres that haven't joined, and owners' claims —
 * against a real (in-memory) Postgres with the demo seed plus two registry centres.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { and, eq, ne } from 'drizzle-orm';

process.env.DATABASE_URL = '';
process.env.PGLITE_DIR = 'memory';

import { getDb, resetDbForTests } from '@/db/client';
import { runMigrations } from '@/db/migrate';
import { seed } from '@/db/seed';
import { importOntario, resetOntario } from '@/db/import-ontario';
import { centreClaims, customers, dependants, locations } from '@/db/schema';
import { ageGroupFor } from '@/domain/types';
import { centreDetail, familyInterests, registerInterest, removeInterest, submitClaim } from '@/services/directory';
import { searchListings } from '@/services/listings';
import { familyWaitlists } from '@/services/queue';

const facility = (site: string, city: string, licenceNo: string) => ({
  licensee: 'Sunrise Learning Inc.', site, programType: 'Child Care Centre',
  programOption: 'Full Day(6 hours or more in a day), Before school', licenceNo, issueDate: '2015-09-01',
  language: 'English', region: 'Central West Region', cmsm: 'Regional Municipality of Peel',
  street: '10 Main Street', city, province: 'ON', postal: 'L6V 1A1',
});

let priya: { id: string };
let kids: { id: string; name: string; birthDate: string | null }[];
let brampton: string;
let maple: string;

beforeAll(async () => {
  resetDbForTests();
  await runMigrations();
  const db = getDb();
  await seed(db);
  await importOntario(db, [facility('Sunrise Brampton', 'Brampton,', '9000001'), facility('Sunrise Mississauga', 'Mississauga', '9000002')]);
  [priya] = await db.select().from(customers).where(eq(customers.email, 'priya@example.com'));
  kids = await db.select().from(dependants).where(eq(dependants.customerId, priya.id));
  [{ id: brampton }] = await db.select({ id: locations.id }).from(locations).where(eq(locations.name, 'Sunrise Brampton'));
  [{ id: maple }] = await db.select({ id: locations.id }).from(locations).where(eq(locations.name, 'Maple Leaf Early Learning'));
}, 120_000);

describe('age group from birth date', () => {
  const now = new Date('2026-10-26T12:00:00Z');
  it('places children in the room for their age', () => {
    expect(ageGroupFor('2026-06-26', now)).toBe('infant'); // 4 months
    expect(ageGroupFor('2025-01-26', now)).toBe('toddler'); // 21 months
    expect(ageGroupFor('2023-08-26', now)).toBe('preschool'); // 38 months
    expect(ageGroupFor('2027-01-10', now)).toBe('infant'); // not born yet
    expect(ageGroupFor(null, now)).toBe('infant');
  });
});

describe('centre pages', () => {
  it('shows a registry centre with its operator and a cleaned-up city', async () => {
    const c = (await centreDetail(brampton))!;
    expect(c.listing.directory).toBe(true);
    expect(c.operator).toBe('Sunrise Learning Inc.');
    expect(c.location.city).toBe('Brampton');
    expect(c.listing.interested).toBe(0);
  });

  it('returns nothing for unknown or malformed ids', async () => {
    expect(await centreDetail('00000000-0000-0000-0000-000000000000')).toBeNull();
    expect(await centreDetail('not-a-uuid')).toBeNull();
  });
});

describe('registering interest', () => {
  it('records one row per child, and registering again just updates the age group', async () => {
    await registerInterest({ customerId: priya.id, locationId: brampton, dependantId: kids[0].id, ageGroup: 'infant' });
    await registerInterest({ customerId: priya.id, locationId: brampton, dependantId: kids[0].id, ageGroup: 'toddler' });
    const mine = await familyInterests(priya.id);
    expect(mine).toHaveLength(1);
    expect(mine[0].interest.ageGroup).toBe('toddler');
    expect((await centreDetail(brampton))!.listing.interested).toBe(1);
    const { listings } = await searchListings({ city: 'Brampton' });
    expect(listings.find((l) => l.locationId === brampton)!.interested).toBe(1);
  });

  it('never touches the real waitlists', async () => {
    const entries = await familyWaitlists(priya.id);
    expect(entries.filter((e) => e.entry.status === 'waiting')).toHaveLength(4);
    expect(entries.filter((e) => e.entry.status === 'offered')).toHaveLength(1);
  });

  it('refuses centres already on NidHub, other families\' children and bad age groups', async () => {
    await expect(registerInterest({ customerId: priya.id, locationId: maple, dependantId: kids[0].id, ageGroup: 'infant' }))
      .rejects.toMatchObject({ status: 409 });
    const [stranger] = await getDb().select().from(dependants).where(ne(dependants.customerId, priya.id)).limit(1);
    await expect(registerInterest({ customerId: priya.id, locationId: brampton, dependantId: stranger.id, ageGroup: 'infant' }))
      .rejects.toMatchObject({ status: 404 });
    await expect(registerInterest({ customerId: priya.id, locationId: brampton, dependantId: kids[1].id, ageGroup: 'teen' }))
      .rejects.toThrow('Choose an age group');
  });

  it('only the family that registered can remove it', async () => {
    const [mine] = await familyInterests(priya.id);
    const [other] = await getDb().select().from(customers).where(ne(customers.id, priya.id)).limit(1);
    await expect(removeInterest(mine.interest.id, other.id)).rejects.toMatchObject({ status: 404 });
    await removeInterest(mine.interest.id, priya.id);
    expect(await familyInterests(priya.id)).toHaveLength(0);
  });
});

describe('claiming a centre', () => {
  const owner = { name: 'Dana Owner', role: 'Owner', email: 'Dana@Sunrise.example', phone: '(905) 555-0100' };

  it('validates the request', async () => {
    await expect(submitClaim({ ...owner, locationId: brampton, email: 'not-an-email' })).rejects.toThrow('valid email');
    await expect(submitClaim({ ...owner, locationId: brampton, phone: '555' })).rejects.toThrow('phone number');
    await expect(submitClaim({ ...owner, locationId: brampton, role: 'CEO of everything' })).rejects.toThrow('role');
    await expect(submitClaim({ ...owner, locationId: maple })).rejects.toMatchObject({ status: 409 });
  });

  it('saves a pending claim once per email, with the email normalised', async () => {
    await submitClaim({ ...owner, locationId: brampton });
    await expect(submitClaim({ ...owner, locationId: brampton })).rejects.toMatchObject({ status: 409 });
    const claims = await getDb().select().from(centreClaims).where(and(eq(centreClaims.locationId, brampton)));
    expect(claims).toHaveLength(1);
    expect(claims[0]).toMatchObject({ status: 'pending', email: 'dana@sunrise.example' });
  });
});

describe('monthly registry refresh', () => {
  it('refuses to reset while families or owners are attached to registry centres', async () => {
    await expect(resetOntario(getDb())).rejects.toThrow('nothing was changed');
    const [still] = await getDb().select().from(locations).where(eq(locations.id, brampton));
    expect(still).toBeTruthy();
  });
});
