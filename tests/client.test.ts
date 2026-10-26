import { describe, expect, it } from 'vitest';
import postgres from 'postgres';
import { driverUrl } from '@/db/client';

const NEON = 'postgresql://user:p%40ss@ep-x.c-7.us-east-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require';

describe('driverUrl (Neon connection strings)', () => {
  it('without it, postgres.js would send channel_binding to the server as a setting', () => {
    expect(postgres(NEON).options.connection).toHaveProperty('channel_binding', 'require');
  });

  it('drops channel_binding so the server never sees it', () => {
    expect(postgres(driverUrl(NEON)).options.connection).not.toHaveProperty('channel_binding');
  });

  it('keeps TLS, credentials, host and database', () => {
    const o = postgres(driverUrl(NEON)).options;
    expect(o.ssl).toBe('require');
    expect(o.user).toBe('user');
    expect(o.pass).toBe('p@ss');
    expect(o.host).toEqual(['ep-x.c-7.us-east-2.aws.neon.tech']);
    expect(o.database).toBe('neondb');
  });

  it('leaves strings without channel_binding unchanged in meaning', () => {
    const local = 'postgres://openslot:openslot@localhost:5432/openslot';
    expect(postgres(driverUrl(local)).options.host).toEqual(['localhost']);
  });
});
