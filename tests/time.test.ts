import { describe, expect, it } from 'vitest';
import { atLocalTime, localDate, localPeriod, timeZoneFor } from '@/domain/time';
import { dateTime, timeOfDay } from '@/lib/format';

const TORONTO = 'America/Toronto';

describe('time zones', () => {
  it('maps provinces to zones, defaulting to Toronto', () => {
    expect(timeZoneFor('ON')).toBe(TORONTO);
    expect(timeZoneFor('BC')).toBe('America/Vancouver');
    expect(timeZoneFor('SK')).toBe('America/Regina');
    expect(timeZoneFor('??')).toBe(TORONTO);
  });

  it("an evening in Toronto is still today there, though it's tomorrow in UTC", () => {
    const at = new Date('2026-10-27T01:30:00Z'); // 9:30 p.m. EDT on the 26th
    expect(localDate(TORONTO, at)).toBe('2026-10-26');
    expect(localDate('America/Vancouver', at)).toBe('2026-10-26');
    expect(at.toISOString().slice(0, 10)).toBe('2026-10-27');
  });

  it('the billing month turns over at local midnight', () => {
    const at = new Date('2026-11-01T02:00:00Z'); // 10 p.m. EDT on Oct 31
    expect(localPeriod(TORONTO, at)).toBe('2026-10');
  });

  it('finds the instant a local clock shows a time, with and without daylight saving', () => {
    expect(atLocalTime(TORONTO, '2026-10-26', 7, 30).toISOString()).toBe('2026-10-26T11:30:00.000Z'); // EDT
    expect(atLocalTime(TORONTO, '2026-01-15', 7, 30).toISOString()).toBe('2026-01-15T12:30:00.000Z'); // EST
    expect(atLocalTime('America/Vancouver', '2026-10-26', 7).toISOString()).toBe('2026-10-26T14:00:00.000Z');
    expect(atLocalTime('America/Regina', '2026-07-01', 7).toISOString()).toBe('2026-07-01T13:00:00.000Z'); // no DST
  });

  it('handles the days the clocks change', () => {
    expect(atLocalTime(TORONTO, '2026-11-01', 7).toISOString()).toBe('2026-11-01T12:00:00.000Z'); // after fall back
    expect(atLocalTime(TORONTO, '2026-03-08', 7).toISOString()).toBe('2026-03-08T11:00:00.000Z'); // after spring forward
  });

  it('round-trips through the display helpers', () => {
    const t = atLocalTime(TORONTO, '2026-10-26', 7, 5);
    expect(localDate(TORONTO, t)).toBe('2026-10-26');
    expect(timeOfDay(t, TORONTO)).toBe('07:05');
    expect(timeOfDay(atLocalTime(TORONTO, '2026-10-26', 0, 15), TORONTO)).toBe('00:15');
  });

  it('labels family-facing times with the zone', () => {
    const label = dateTime(new Date('2026-10-28T17:23:00Z'), TORONTO);
    expect(label).toContain('1:23');
    expect(label).toContain('EDT');
    expect(label).toContain('Oct 28, 2026');
  });
});
