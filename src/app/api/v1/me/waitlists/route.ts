import { requireFamily } from '@/services/auth';
import { familyWaitlists } from '@/services/queue';
import { handle } from '../../_lib';

export const dynamic = 'force-dynamic';

/** GET /api/v1/me/waitlists — the signed-in family's entries with position and wait estimate. */
export async function GET() {
  return handle(async () => {
    const { customerId } = await requireFamily();
    const rows = await familyWaitlists(customerId);
    return rows.map((r) => ({
      id: r.entry.id,
      status: r.entry.status,
      child: r.childName,
      centre: { id: r.location.id, name: r.location.name, city: r.location.city },
      room: { id: r.room.id, name: r.room.name, ageGroup: r.room.attrs.ageGroup },
      position: r.position,
      total: r.total,
      estimatedWaitMonths: r.wait,
      offerExpiresAt: r.entry.offerExpiresAt,
    }));
  });
}
