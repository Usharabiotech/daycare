/**
 * OpenSlot core schema.
 *
 * The core is vertical-agnostic: it knows organizations, locations, bookable resources,
 * queues, bookings, funding programs and invoices. Childcare-specific facts (age groups,
 * the $10-a-day program) live in `attrs` JSON and in src/domain/rules. A clinic or venue
 * reuses the same tables with its own `vertical` value and attrs.
 */
import {
  pgTable, pgEnum, uuid, text, integer, boolean, timestamp, date, jsonb, index, uniqueIndex,
} from 'drizzle-orm/pg-core';
import type { AgeGroup, QueueFlags } from '@/domain/types';

export const vertical = pgEnum('vertical', ['childcare', 'clinic', 'hospital', 'venue']);
export const queueStatus = pgEnum('queue_status', ['waiting', 'offered', 'accepted', 'declined', 'withdrawn', 'expired']);
export const bookingStatus = pgEnum('booking_status', ['active', 'ended']);
export const userRole = pgEnum('user_role', ['family', 'centre_admin', 'platform_admin']);
export const invoiceStatus = pgEnum('invoice_status', ['draft', 'issued', 'paid', 'void']);
export const claimStatus = pgEnum('claim_status', ['pending', 'verified', 'rejected']);

const id = () => uuid('id').primaryKey().defaultRandom();
const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();

export const organizations = pgTable('organizations', {
  id: id(),
  name: text('name').notNull(),
  createdAt: createdAt(),
});

export interface LocationAttrs {
  /** Funding programs the location participates in, e.g. ['CWELCC']. */
  fundingPrograms?: string[];
  /** Where this record came from, e.g. 'ontario_open_data'. Absent for centres created in OpenSlot. */
  source?: string;
  /** A public-registry listing the centre has not claimed yet: shown in search, but no live availability. */
  directory?: boolean;
  /** Registry facts kept for display and later matching (not used by the booking core). */
  programType?: string;
  programOption?: string;
  language?: string;
  region?: string;
  cmsm?: string;
  licenceStatus?: string;
  issueDate?: string;
}

export const locations = pgTable('locations', {
  id: id(),
  orgId: uuid('org_id').notNull().references(() => organizations.id),
  vertical: vertical('vertical').notNull(),
  name: text('name').notNull(),
  city: text('city').notNull(),
  province: text('province').notNull(),
  address: text('address'),
  hours: text('hours'),
  licenceNo: text('licence_no'),
  /** The location's own list price per month, before any program or subsidy. */
  baseFeeCents: integer('base_fee_cents'),
  attrs: jsonb('attrs').$type<LocationAttrs>().notNull().default({}),
  createdAt: createdAt(),
}, (t) => [index('locations_city_idx').on(t.city), index('locations_org_idx').on(t.orgId)]);

export interface ResourceAttrs {
  ageGroup?: AgeGroup;
}

/** A bookable unit: a childcare room, a practitioner's calendar, a court, a bed. */
export const resources = pgTable('resources', {
  id: id(),
  locationId: uuid('location_id').notNull().references(() => locations.id),
  vertical: vertical('vertical').notNull(),
  kind: text('kind').notNull(),
  name: text('name').notNull(),
  capacity: integer('capacity').notNull(),
  attrs: jsonb('attrs').$type<ResourceAttrs>().notNull().default({}),
  isPublic: boolean('is_public').notNull().default(true),
  /** What families see. Refreshed whenever enrolment or offers change, or when the centre publishes. */
  publishedOpen: integer('published_open'),
  publishedAt: timestamp('published_at', { withTimezone: true }),
  createdAt: createdAt(),
}, (t) => [index('resources_location_idx').on(t.locationId)]);

/** The paying/registering person (a parent or guardian in childcare, a patient in clinics). */
export const customers = pgTable('customers', {
  id: id(),
  name: text('name').notNull(),
  email: text('email').notNull(),
  phone: text('phone'),
  province: text('province'),
  createdAt: createdAt(),
}, (t) => [uniqueIndex('customers_email_uq').on(t.email)]);

/** The person the service is for (a child). In clinics this may be the customer themselves. */
export const dependants = pgTable('dependants', {
  id: id(),
  customerId: uuid('customer_id').notNull().references(() => customers.id),
  name: text('name').notNull(),
  birthDate: date('birth_date', { mode: 'string' }),
  createdAt: createdAt(),
}, (t) => [index('dependants_customer_idx').on(t.customerId)]);

export const users = pgTable('users', {
  id: id(),
  email: text('email').notNull(),
  name: text('name').notNull(),
  role: userRole('role').notNull(),
  customerId: uuid('customer_id').references(() => customers.id),
  orgId: uuid('org_id').references(() => organizations.id),
  createdAt: createdAt(),
}, (t) => [uniqueIndex('users_email_uq').on(t.email)]);

export const queueEntries = pgTable('queue_entries', {
  id: id(),
  resourceId: uuid('resource_id').notNull().references(() => resources.id),
  customerId: uuid('customer_id').notNull().references(() => customers.id),
  dependantId: uuid('dependant_id').notNull().references(() => dependants.id),
  appliedAt: timestamp('applied_at', { withTimezone: true }).notNull().defaultNow(),
  desiredStart: date('desired_start', { mode: 'string' }),
  flags: jsonb('flags').$type<QueueFlags>().notNull().default({}),
  status: queueStatus('status').notNull().default('waiting'),
  offeredAt: timestamp('offered_at', { withTimezone: true }),
  offerExpiresAt: timestamp('offer_expires_at', { withTimezone: true }),
  closedAt: timestamp('closed_at', { withTimezone: true }),
  closedReason: text('closed_reason'),
}, (t) => [
  index('queue_resource_status_idx').on(t.resourceId, t.status),
  index('queue_dependant_idx').on(t.dependantId),
]);

export const bookings = pgTable('bookings', {
  id: id(),
  resourceId: uuid('resource_id').notNull().references(() => resources.id),
  customerId: uuid('customer_id').notNull().references(() => customers.id),
  dependantId: uuid('dependant_id').notNull().references(() => dependants.id),
  queueEntryId: uuid('queue_entry_id').references(() => queueEntries.id),
  startDate: date('start_date', { mode: 'string' }).notNull(),
  endDate: date('end_date', { mode: 'string' }),
  status: bookingStatus('status').notNull().default('active'),
  schedule: text('schedule').notNull().default('full_time'),
  /** Approved income-tested subsidy paid by the province/municipality, per month. */
  subsidyMonthlyCents: integer('subsidy_monthly_cents').notNull().default(0),
  createdAt: createdAt(),
}, (t) => [index('bookings_resource_status_idx').on(t.resourceId, t.status)]);

export const staff = pgTable('staff', {
  id: id(),
  locationId: uuid('location_id').notNull().references(() => locations.id),
  name: text('name').notNull(),
  role: text('role').notNull(),
  resourceId: uuid('resource_id').references(() => resources.id),
  onShift: boolean('on_shift').notNull().default(true),
  createdAt: createdAt(),
}, (t) => [index('staff_location_idx').on(t.locationId)]);

export const attendance = pgTable('attendance', {
  id: id(),
  bookingId: uuid('booking_id').notNull().references(() => bookings.id),
  day: date('day', { mode: 'string' }).notNull(),
  checkInAt: timestamp('check_in_at', { withTimezone: true }),
  checkOutAt: timestamp('check_out_at', { withTimezone: true }),
}, (t) => [uniqueIndex('attendance_booking_day_uq').on(t.bookingId, t.day)]);

export const invoices = pgTable('invoices', {
  id: id(),
  bookingId: uuid('booking_id').notNull().references(() => bookings.id),
  period: text('period').notNull(), // YYYY-MM
  feeCents: integer('fee_cents').notNull(),
  parentCents: integer('parent_cents').notNull(),
  subsidyCents: integer('subsidy_cents').notNull(),
  programCents: integer('program_cents').notNull(),
  status: invoiceStatus('status').notNull().default('draft'),
  createdAt: createdAt(),
}, (t) => [uniqueIndex('invoices_booking_period_uq').on(t.bookingId, t.period)]);

/**
 * A family's interest in a public-registry centre that hasn't joined yet. Kept apart from
 * queueEntries on purpose: it holds no place in the centre's own list and never takes part in
 * offers or wait estimates. When the centre joins, these families can be invited onto its
 * real waitlist. One row per child per centre; registering again updates the age group.
 */
export const interests = pgTable('interests', {
  id: id(),
  locationId: uuid('location_id').notNull().references(() => locations.id),
  customerId: uuid('customer_id').notNull().references(() => customers.id),
  dependantId: uuid('dependant_id').notNull().references(() => dependants.id),
  ageGroup: text('age_group').$type<AgeGroup>().notNull(),
  createdAt: createdAt(),
}, (t) => [
  uniqueIndex('interests_location_dependant_uq').on(t.locationId, t.dependantId),
  index('interests_customer_idx').on(t.customerId),
]);

/** An operator asking to take over a directory listing. A person verifies it before access is granted. */
export const centreClaims = pgTable('centre_claims', {
  id: id(),
  locationId: uuid('location_id').notNull().references(() => locations.id),
  name: text('name').notNull(),
  role: text('role').notNull(),
  email: text('email').notNull(),
  phone: text('phone').notNull(),
  note: text('note'),
  status: claimStatus('status').notNull().default('pending'),
  createdAt: createdAt(),
}, (t) => [index('centre_claims_location_idx').on(t.locationId)]);

export type Location = typeof locations.$inferSelect;
export type Resource = typeof resources.$inferSelect;
export type QueueEntry = typeof queueEntries.$inferSelect;
export type Booking = typeof bookings.$inferSelect;
export type User = typeof users.$inferSelect;
