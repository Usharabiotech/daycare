'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { DomainError } from '@/domain/types';
import { SESSION_COOKIE, requireCentreAdmin, requireFamily } from '@/services/auth';
import { acceptOffer, declineOffer, joinQueue, offerSpace, withdrawEntry } from '@/services/queue';
import { generateInvoices, publishAvailability, toggleAttendance, toggleShift } from '@/services/centre';

/** Runs a mutation, then sends the user back to `path` with a success or error message. */
async function run(path: string, okMessage: string, fn: () => Promise<unknown>) {
  try {
    await fn();
  } catch (e) {
    if (e instanceof DomainError) redirect(`${path}?error=${encodeURIComponent(e.message)}`);
    throw e;
  }
  revalidatePath('/', 'layout');
  redirect(`${path}?ok=${encodeURIComponent(okMessage)}`);
}

const str = (f: FormData, k: string) => String(f.get(k) ?? '');

export async function signIn(form: FormData) {
  cookies().set(SESSION_COOKIE, str(form, 'userId'), { httpOnly: true, sameSite: 'lax', path: '/' });
  redirect(str(form, 'next') || '/');
}

export async function signOut() {
  cookies().delete(SESSION_COOKIE);
  redirect('/');
}

export async function joinWaitlist(form: FormData) {
  const back = str(form, 'back') || '/';
  await run(back, 'Added to the waitlist. Track it under My waitlists.', async () => {
    const { customerId } = await requireFamily();
    await joinQueue({
      customerId,
      dependantId: str(form, 'dependantId'),
      resourceId: str(form, 'resourceId'),
      desiredStart: str(form, 'desiredStart') || null,
      flags: { sibling: form.get('sibling') === 'on' },
    });
  });
}

export async function acceptOfferAction(form: FormData) {
  await run('/waitlists', 'Space accepted. Your other waitlist entries for this child are closed.', async () => {
    const { customerId } = await requireFamily();
    await acceptOffer(str(form, 'entryId'), { customerId });
  });
}

export async function declineOfferAction(form: FormData) {
  await run('/waitlists', 'Offer declined. The space goes to the next family.', async () => {
    const { customerId } = await requireFamily();
    await declineOffer(str(form, 'entryId'), { customerId });
  });
}

export async function withdrawAction(form: FormData) {
  await run('/waitlists', 'Removed from the waitlist.', async () => {
    const { customerId } = await requireFamily();
    await withdrawEntry(str(form, 'entryId'), { customerId });
  });
}

export async function offerSpaceAction(form: FormData) {
  const loc = str(form, 'locationId');
  await run(`/centre/${loc}/waitlist`, 'Offer sent. The space is held for 48 hours.', async () => {
    const { orgId } = await requireCentreAdmin(loc);
    await offerSpace(str(form, 'entryId'), { orgId });
  });
}

export async function markAcceptedAction(form: FormData) {
  const loc = str(form, 'locationId');
  await run(`/centre/${loc}/waitlist`, 'Enrolled. The family\'s other waitlist entries are closed.', async () => {
    const { orgId } = await requireCentreAdmin(loc);
    await acceptOffer(str(form, 'entryId'), { orgId });
  });
}

export async function publishAction(form: FormData) {
  const loc = str(form, 'locationId');
  await run(`/centre/${loc}`, 'Availability published to families.', async () => {
    await requireCentreAdmin(loc);
    await publishAvailability(loc);
  });
}

export async function attendanceAction(form: FormData) {
  const loc = str(form, 'locationId');
  await run(`/centre/${loc}/attendance`, 'Attendance updated.', async () => {
    const { orgId } = await requireCentreAdmin(loc);
    await toggleAttendance(str(form, 'bookingId'), { orgId });
  });
}

export async function shiftAction(form: FormData) {
  const loc = str(form, 'locationId');
  await run(`/centre/${loc}/staff`, 'Shift updated.', async () => {
    const { orgId } = await requireCentreAdmin(loc);
    await toggleShift(str(form, 'staffId'), { orgId });
  });
}

export async function invoicesAction(form: FormData) {
  const loc = str(form, 'locationId');
  const period = str(form, 'period');
  let created = 0;
  await run(`/centre/${loc}/billing`, `Draft invoices created for ${period}.`, async () => {
    const { orgId } = await requireCentreAdmin(loc);
    created = await generateInvoices(loc, period, { orgId });
    if (created === 0) throw new DomainError(`Invoices for ${period} already exist.`, 409);
  });
}
