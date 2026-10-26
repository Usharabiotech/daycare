/** Verticals share one booking core. Childcare is live; the others are reserved for later phases. */
export type Vertical = 'childcare' | 'clinic' | 'hospital' | 'venue';

export type AgeGroup = 'infant' | 'toddler' | 'preschool';

export const AGE_GROUPS: Record<AgeGroup, { label: string; minMonths: number; maxMonths: number; typicalStayMonths: number }> = {
  infant: { label: 'Infant', minMonths: 0, maxMonths: 18, typicalStayMonths: 18 },
  toddler: { label: 'Toddler', minMonths: 18, maxMonths: 30, typicalStayMonths: 12 },
  // Most children leave preschool rooms for junior kindergarten at about 3 years 8 months.
  preschool: { label: 'Preschool', minMonths: 30, maxMonths: 72, typicalStayMonths: 24 },
};

export const AGE_GROUP_KEYS = Object.keys(AGE_GROUPS) as AgeGroup[];

export function isAgeGroup(v: unknown): v is AgeGroup {
  return typeof v === 'string' && v in AGE_GROUPS;
}

/**
 * The room a child of this birth date belongs in today. Children not born yet are treated as
 * infants (families register before birth); children past preschool age stay "preschool".
 */
export function ageGroupFor(birthDate: string | null | undefined, now = new Date()): AgeGroup {
  if (!birthDate) return 'infant';
  const b = new Date(`${birthDate}T00:00:00Z`);
  const months = (now.getUTCFullYear() - b.getUTCFullYear()) * 12 + (now.getUTCMonth() - b.getUTCMonth()) - (now.getUTCDate() < b.getUTCDate() ? 1 : 0);
  return AGE_GROUP_KEYS.find((g) => months < AGE_GROUPS[g].maxMonths) ?? 'preschool';
}

/** Priority flags a centre's admission policy can use to order its queue. */
export interface QueueFlags {
  sibling?: boolean;
  staffChild?: boolean;
  needsSubsidy?: boolean;
}

export class DomainError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
    this.name = 'DomainError';
  }
}
