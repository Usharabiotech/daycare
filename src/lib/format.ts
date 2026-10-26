export function money(cents: number) {
  return '$' + Math.round(cents / 100).toLocaleString('en-CA');
}

export function dollars(amount: number) {
  return '$' + Math.round(amount).toLocaleString('en-CA');
}

export function relTime(d: Date | null | undefined, now = new Date()) {
  if (!d) return 'never';
  const mins = Math.round((now.getTime() - d.getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} h ago`;
  return `${Math.round(hrs / 24)} days ago`;
}

/** 24-hour clock time in the centre's time zone, e.g. "07:42". */
export function timeOfDay(d: Date | null | undefined, timeZone: string) {
  if (!d) return '—';
  return d.toLocaleTimeString('en-CA', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone });
}

/** Date and time in the centre's time zone, labelled with it, e.g. "Oct 28, 2026, 1:23 p.m. EDT". */
export function dateTime(d: Date | null | undefined, timeZone: string) {
  if (!d) return '—';
  return d.toLocaleString('en-CA', {
    month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZone, timeZoneName: 'short',
  });
}
