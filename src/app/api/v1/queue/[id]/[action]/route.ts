import { DomainError } from '@/domain/types';
import { currentUser } from '@/services/auth';
import { acceptOffer, declineOffer, offerSpace, withdrawEntry } from '@/services/queue';
import { handle } from '../../../_lib';

/**
 * POST /api/v1/queue/:id/offer     — centre director offers a space
 * POST /api/v1/queue/:id/accept    — family (or director on their behalf) accepts
 * POST /api/v1/queue/:id/decline   — family declines
 * POST /api/v1/queue/:id/withdraw  — family leaves the list
 */
export async function POST(_req: Request, { params }: { params: { id: string; action: string } }) {
  return handle(async () => {
    const u = await currentUser();
    if (!u) throw new DomainError('Sign in first.', 401);
    switch (params.action) {
      case 'offer':
        if (u.role !== 'centre_admin' || !u.orgId) throw new DomainError('Only centre directors can offer spaces.', 403);
        return offerSpace(params.id, { orgId: u.orgId });
      case 'accept':
        return acceptOffer(params.id, { customerId: u.customerId ?? undefined, orgId: u.orgId ?? undefined });
      case 'decline':
        if (!u.customerId) throw new DomainError('Only the family can decline.', 403);
        return declineOffer(params.id, { customerId: u.customerId });
      case 'withdraw':
        if (!u.customerId) throw new DomainError('Only the family can withdraw.', 403);
        return withdrawEntry(params.id, { customerId: u.customerId });
      default:
        throw new DomainError('Unknown action.', 404);
    }
  });
}
