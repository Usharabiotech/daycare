/**
 * Import real licensed childcare centres from Ontario's open data into OpenSlot as
 * unclaimed *directory* listings.
 *
 * Source: "Licensed child care facilities in Ontario", Ontario Data Catalogue,
 * Open Government Licence – Ontario. The open dataset carries the centre's name, licensee,
 * licence number, program type, language, region and address — but NOT room capacity or
 * age-group spaces, and never live availability or waitlists (those are each centre's own
 * private data). So every imported centre is marked `directory: true`: it appears in search
 * with its registry facts, but shows no open spaces until a real operator claims it and
 * publishes. Demo seed centres (with live rooms, families and offers) are left untouched.
 *
 * Usage:
 *   tsx src/db/import-ontario.ts [path/to/active_facilities.json] [--reset-ontario]
 *
 * Only active facilities should be in the JSON (see scripts/extract_ontario.py).
 */
import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { count, sql } from 'drizzle-orm';
import { getDb, type DB } from './client';
import { locations, organizations, resources } from './schema';

const SOURCE = 'ontario_open_data';

interface Facility {
  licensee: string | null;
  site: string | null;
  programType: string | null;
  programOption: string | null;
  licenceNo: string | null;
  issueDate: string | null;
  language: string | null;
  region: string | null;
  cmsm: string | null;
  street: string | null;
  city: string | null;
  province: string | null;
  postal: string | null;
}

async function chunked<T>(rows: T[], size: number, fn: (batch: T[]) => Promise<void>) {
  for (let i = 0; i < rows.length; i += size) await fn(rows.slice(i, i + size));
}

/**
 * City names in the registry come in many spellings of the same place: stray punctuation
 * ("Brampton,", "Toronto."), an appended province ("Ottawa On", "London Ontario"), or a
 * region/borough qualifier after a comma ("Ottawa, On", "Toronto, North York", "Mississauga, Peel").
 * Left as-is each would be a separate city in search. Normalize so each city appears once.
 */
export function cleanCity(s: string | null): string {
  if (!s) return 'Unknown';
  let c = s.replace(/\s+/g, ' ').trim();
  c = c.split(',')[0].trim();                        // drop ", <region/province/borough>"
  c = c.replace(/\s+(on|ont|ontario)$/i, '').trim(); // drop a trailing province word
  c = c.replace(/^[\s,.;:-]+|[\s,.;:-]+$/g, '').trim();
  if (c && (c === c.toUpperCase() || c === c.toLowerCase())) {
    c = c.toLowerCase().replace(/\b\p{L}/gu, (m) => m.toUpperCase()); // tidy ALL-CAPS / all-lower
  }
  return c || 'Unknown';
}

export async function importOntario(db: DB, facilities: Facility[]) {
  // One organization per distinct licensee, so a chain's centres share an owner.
  const licensees = [...new Set(facilities.map((f) => f.licensee?.trim()).filter((n): n is string => !!n))];
  const orgId = new Map<string, string>();
  await chunked(licensees, 400, async (batch) => {
    const rows = await db.insert(organizations).values(batch.map((name) => ({ name }))).returning({ id: organizations.id, name: organizations.name });
    for (const r of rows) orgId.set(r.name, r.id);
  });

  let centres = 0;
  await chunked(facilities, 300, async (batch) => {
    const locRows = await db.insert(locations).values(batch.map((f) => ({
      orgId: orgId.get((f.licensee ?? '').trim())!,
      vertical: 'childcare' as const,
      name: f.site ?? 'Licensed child care',
      city: cleanCity(f.city),
      province: f.province ?? 'ON',
      address: [f.street, f.postal].filter(Boolean).join(', ') || null,
      licenceNo: f.licenceNo,
      attrs: {
        source: SOURCE,
        directory: true,
        programType: f.programType ?? undefined,
        programOption: f.programOption ?? undefined,
        language: f.language ?? undefined,
        region: f.region ?? undefined,
        cmsm: f.cmsm ?? undefined,
        licenceStatus: 'Active',
        issueDate: f.issueDate ?? undefined,
      },
    }))).returning({ id: locations.id });

    // One placeholder resource per centre so it appears in search. Capacity is unknown in the
    // open data (0 = not published); families see "availability not published" until claimed.
    await db.insert(resources).values(locRows.map((loc, i) => ({
      locationId: loc.id,
      vertical: 'childcare' as const,
      kind: 'program',
      name: batch[i].programType ?? 'Licensed child care',
      capacity: 0,
      isPublic: true,
      publishedOpen: null,
      publishedAt: null,
    })));
    centres += locRows.length;
  });
  return { orgs: licensees.length, centres };
}

export async function resetOntario(db: DB) {
  await db.execute(sql`DELETE FROM resources WHERE location_id IN (SELECT id FROM locations WHERE attrs->>'source' = ${SOURCE})`);
  await db.execute(sql`DELETE FROM locations WHERE attrs->>'source' = ${SOURCE}`);
  await db.execute(sql`DELETE FROM organizations o WHERE NOT EXISTS (SELECT 1 FROM locations l WHERE l.org_id = o.id) AND NOT EXISTS (SELECT 1 FROM users u WHERE u.org_id = o.id)`);
}

if (process.argv[1]?.endsWith('import-ontario.ts')) {
  (async () => {
    const db = getDb();
    const args = process.argv.slice(2);
    const reset = args.includes('--reset-ontario');
    const path = args.find((a) => !a.startsWith('--')) ?? 'data/ontario/active_facilities.json';

    const [{ n }] = await db.select({ n: count() }).from(locations).where(sql`${locations.attrs}->>'source' = ${SOURCE}`);
    if (n > 0 && !reset) {
      console.log(`Ontario directory already imported (${n} centres). Re-run with --reset-ontario to replace it.`);
      process.exit(0);
    }
    if (reset) {
      await resetOntario(db);
      console.log('Cleared previous Ontario directory import.');
    }

    const facilities: Facility[] = JSON.parse(readFileSync(path, 'utf-8'));
    console.log(`Importing ${facilities.length} active Ontario facilities from ${path} …`);
    const { orgs, centres } = await importOntario(db, facilities);
    console.log(`Imported ${centres} centres under ${orgs} licensees as directory listings.`);
    process.exit(0);
  })().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
