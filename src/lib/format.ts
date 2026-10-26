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

export function timeOfDay(d: Date | null | undefined) {
  if (!d) return '—';
  return d.toLocaleTimeString('en-CA', { hour: '2-digit', minute: '2-digit', hour12: false });
}

export function currentPeriod(now = new Date()) {
  return now.toISOString().slice(0, 7);
}
