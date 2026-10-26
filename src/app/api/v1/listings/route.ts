import { isAgeGroup } from '@/domain/types';
import { searchListings } from '@/services/listings';
import { handle } from '../_lib';

export const dynamic = 'force-dynamic';

/** GET /api/v1/listings?city=Toronto&age=infant&open=1&program=1 — public. */
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const age = q.get('age');
  const limit = Math.min(Math.max(Number(q.get('limit')) || 100, 1), 500);
  return handle(() => searchListings({
    city: q.get('city') || undefined,
    ageGroup: isAgeGroup(age) ? age : undefined,
    onlyOpen: q.get('open') === '1',
    onlyProgram: q.get('program') === '1',
    limit,
  }));
}
