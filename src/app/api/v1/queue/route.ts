import { requireFamily } from '@/services/auth';
import { joinQueue } from '@/services/queue';
import { body, handle } from '../_lib';

/** POST /api/v1/queue { resourceId, dependantId, desiredStart?, sibling? } — family joins a waitlist. */
export async function POST(req: Request) {
  return handle(async () => {
    const { customerId } = await requireFamily();
    const b = await body<{ resourceId: string; dependantId: string; desiredStart?: string; sibling?: boolean }>(req);
    return joinQueue({ customerId, resourceId: b.resourceId, dependantId: b.dependantId, desiredStart: b.desiredStart ?? null, flags: { sibling: !!b.sibling } });
  }, 201);
}
