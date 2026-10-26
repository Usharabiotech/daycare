import { requireCentreAdmin } from '@/services/auth';
import { toggleAttendance } from '@/services/centre';
import { body, handle } from '../_lib';

/** POST /api/v1/attendance { bookingId } — toggles check-in / check-out for today (staff app). */
export async function POST(req: Request) {
  return handle(async () => {
    const { orgId } = await requireCentreAdmin();
    const { bookingId } = await body<{ bookingId: string }>(req);
    await toggleAttendance(bookingId, { orgId });
    return { ok: true };
  });
}
