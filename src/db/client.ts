import { drizzle as drizzlePostgres, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite';
import postgres from 'postgres';
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import path from 'node:path';
import * as schema from './schema';

/**
 * Both drivers expose the same Drizzle query API, so the app is typed against the
 * Postgres one. PGlite (embedded Postgres in WASM) is used when DATABASE_URL is unset,
 * so a developer can run the app with no database server installed.
 */
export type DB = PostgresJsDatabase<typeof schema>;
export type Tx = Parameters<Parameters<DB['transaction']>[0]>[0];

const g = globalThis as unknown as { __openslotDb?: DB; __openslotDriver?: 'postgres' | 'pglite' };

/**
 * Neon's copy-paste connection strings end in `channel_binding=require`, a libpq-only
 * setting. postgres.js forwards unknown URL parameters to the server as runtime settings,
 * which Postgres rejects, so drop it. TLS is still enforced by `sslmode=require`.
 */
export function driverUrl(url: string): string {
  try {
    const u = new URL(url);
    u.searchParams.delete('channel_binding');
    return u.toString();
  } catch {
    return url;
  }
}

export function getDb(): DB {
  if (g.__openslotDb) return g.__openslotDb;
  const url = process.env.DATABASE_URL;
  if (url) {
    // Small pool: serverless (Vercel) runs many short-lived instances, and Neon has a
    // connection ceiling. One connection per instance is plenty for this app's traffic.
    g.__openslotDb = drizzlePostgres(
      postgres(driverUrl(url), { max: Number(process.env.DB_POOL_MAX) || 1, idle_timeout: 20, connect_timeout: 15 }),
      { schema },
    );
    g.__openslotDriver = 'postgres';
  } else {
    const dir = process.env.PGLITE_DIR || './.data/pglite';
    let client: PGlite;
    if (dir === 'memory') {
      client = new PGlite();
    } else {
      fs.mkdirSync(path.dirname(path.resolve(dir)), { recursive: true });
      client = new PGlite(dir);
    }
    g.__openslotDb = drizzlePglite(client, { schema }) as unknown as DB;
    g.__openslotDriver = 'pglite';
  }
  return g.__openslotDb;
}

export function dbDriver() {
  getDb();
  return g.__openslotDriver!;
}

/** Tests only: drop the cached connection so the next getDb() starts fresh. */
export function resetDbForTests() {
  g.__openslotDb = undefined;
  g.__openslotDriver = undefined;
}
