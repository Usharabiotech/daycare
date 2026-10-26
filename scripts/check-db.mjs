// Checks that DATABASE_URL in .env is reachable, without printing the password.
// Run: node scripts/check-db.mjs
import 'dotenv/config';
import dns from 'node:dns/promises';
import postgres from 'postgres';

const url = process.env.DATABASE_URL;
if (!url) {
  console.log('DATABASE_URL is empty in .env');
  process.exit(1);
}

const u = new URL(url);
console.log(`host: ${u.hostname}  pooler: ${u.hostname.includes('-pooler')}  params: ${[...u.searchParams.keys()].join(',')}`);

try {
  const addrs = await dns.lookup(u.hostname, { all: true });
  console.log(`dns: ok (${addrs.map((a) => a.address).slice(0, 2).join(', ')})`);
} catch (e) {
  console.log(`dns: FAILED (${e.code})`);
  process.exit(1);
}

// Same as src/db/client.ts: postgres.js would send libpq's channel_binding to the server.
const driverUrl = new URL(url);
driverUrl.searchParams.delete('channel_binding');
const sql = postgres(driverUrl.toString(), { max: 1, connect_timeout: 15 });
try {
  const [r] = await sql`select current_database() as db,
    split_part(version(), ' ', 2) as pg,
    (select count(*) from information_schema.tables where table_schema = 'public')::int as tables`;
  console.log(`CONNECTED: database=${r.db} postgres=${r.pg} tables=${r.tables}`);
} catch (e) {
  console.log(`FAILED: ${e.code ?? ''} ${String(e.message).replace(/:\/\/[^@]*@/, '://***@')}`);
  process.exitCode = 1;
} finally {
  await sql.end({ timeout: 2 });
}
