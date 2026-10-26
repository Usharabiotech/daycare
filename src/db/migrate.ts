import 'dotenv/config';
import path from 'node:path';
import { getDb, dbDriver } from './client';

const migrationsFolder = path.join(process.cwd(), 'drizzle');

export async function runMigrations() {
  const db = getDb();
  if (dbDriver() === 'postgres') {
    const { migrate } = await import('drizzle-orm/postgres-js/migrator');
    await migrate(db, { migrationsFolder });
  } else {
    const { migrate } = await import('drizzle-orm/pglite/migrator');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await migrate(db as any, { migrationsFolder });
  }
}

if (process.argv[1]?.endsWith('migrate.ts')) {
  runMigrations()
    .then(() => {
      console.log(`Migrations applied (${dbDriver()}).`);
      process.exit(0);
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
