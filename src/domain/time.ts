/**
 * Dates and times as each centre sees them.
 *
 * Servers run in UTC, so anything a family or a centre reads as a clock time or a calendar
 * day — an offer deadline, a check-in, "today's" attendance, "this month's" invoices — is
 * worked out in the centre's own time zone. Provinces that span zones use their most
 * populous one.
 */

const PROVINCE_TIME_ZONES: Record<string, string> = {
  NL: 'America/St_Johns',
  NS: 'America/Halifax',
  PE: 'America/Halifax',
  NB: 'America/Moncton',
  QC: 'America/Toronto',
  ON: 'America/Toronto',
  MB: 'America/Winnipeg',
  SK: 'America/Regina',
  AB: 'America/Edmonton',
  BC: 'America/Vancouver',
  YT: 'America/Whitehorse',
  NT: 'America/Yellowknife',
  NU: 'America/Iqaluit',
};

export function timeZoneFor(province: string): string {
  return PROVINCE_TIME_ZONES[province] ?? 'America/Toronto';
}

function parts(timeZone: string, at: Date): Record<string, string> {
  return Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    }).formatToParts(at).map((p) => [p.type, p.value]),
  );
}

/** The calendar date (YYYY-MM-DD) in `timeZone` at the instant `at`. */
export function localDate(timeZone: string, at: Date = new Date()): string {
  const p = parts(timeZone, at);
  return `${p.year}-${p.month}-${p.day}`;
}

/** The billing period (YYYY-MM) in `timeZone` at the instant `at`. */
export function localPeriod(timeZone: string, at: Date = new Date()): string {
  return localDate(timeZone, at).slice(0, 7);
}

/** Minutes the zone's clock is ahead of UTC at `at` (negative across the Americas). */
function offsetMinutes(timeZone: string, at: Date): number {
  const p = parts(timeZone, at);
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return Math.round((asUtc - Math.floor(at.getTime() / 1000) * 1000) / 60000);
}

/** The instant at which the clock in `timeZone` reads `hour:minute` on `day` (YYYY-MM-DD). */
export function atLocalTime(timeZone: string, day: string, hour: number, minute = 0): Date {
  const pad = (n: number) => String(n).padStart(2, '0');
  const guess = new Date(`${day}T${pad(hour)}:${pad(minute)}:00Z`);
  const first = new Date(guess.getTime() - offsetMinutes(timeZone, guess) * 60000);
  // Second pass settles the offset when the guess and the answer straddle a DST change.
  return new Date(guess.getTime() - offsetMinutes(timeZone, first) * 60000);
}
