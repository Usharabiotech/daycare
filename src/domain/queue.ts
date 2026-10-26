import { AGE_GROUPS, type AgeGroup, type QueueFlags } from './types';

/** Hours a family has to accept an offered space before it expires. */
export const OFFER_HOLD_HOURS = 48;

export interface Orderable {
  appliedAt: Date;
  flags: QueueFlags;
}

/**
 * Default admission policy: staff children, then siblings, then first come first served.
 * Make this per-location configurable when centres ask for different policies.
 */
export function priorityScore(flags: QueueFlags): number {
  return (flags.staffChild ? 2 : 0) + (flags.sibling ? 1 : 0);
}

export function compareQueue(a: Orderable, b: Orderable): number {
  const p = priorityScore(b.flags) - priorityScore(a.flags);
  if (p !== 0) return p;
  return a.appliedAt.getTime() - b.appliedAt.getTime();
}

export function orderQueue<T extends Orderable>(entries: T[]): T[] {
  return [...entries].sort(compareQueue);
}

/**
 * Share of families ahead of you who will actually take a space here when offered.
 * Families join many lists and most leave once placed elsewhere, so raw position overstates
 * the wait. 0.4 is a starting assumption; calibrate per centre from real offer outcomes
 * (accepted vs. declined/withdrawn/expired) once the pilot has data.
 */
export const DEFAULT_ACTIVE_SHARE = 0.4;

/**
 * Estimated wait range in months for someone at `position` in a room.
 * Assumes children leave the room after the typical stay for its age group, so about
 * capacity / typicalStayMonths spaces open per month. Shown to families as a range.
 */
export function estimateWaitMonths(ageGroup: AgeGroup, capacity: number, position: number, activeShare = DEFAULT_ACTIVE_SHARE): [number, number] {
  const exitsPerMonth = Math.max(capacity / AGE_GROUPS[ageGroup].typicalStayMonths, 0.1);
  const mid = (position * activeShare) / exitsPerMonth;
  return [Math.max(1, Math.round(mid * 0.8)), Math.max(1, Math.round(mid * 1.25))];
}

export function formatWait([low, high]: [number, number]): string {
  const f = (m: number) => (m >= 24 ? `${(m / 12).toFixed(1)} yrs` : `${m} mo`);
  return low === high ? f(low) : `${f(low)} – ${f(high)}`;
}

export function offerExpiry(from: Date): Date {
  return new Date(from.getTime() + OFFER_HOLD_HOURS * 3600 * 1000);
}
