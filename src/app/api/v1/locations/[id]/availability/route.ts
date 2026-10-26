import { NextResponse } from 'next/server';
import { DomainError } from '@/domain/types';
import { locationAvailability } from '@/services/listings';
import { handle } from '../../../_lib';

export const dynamic = 'force-dynamic';

/** GET /api/v1/locations/:id/availability — public; for a centre's own website widget. CORS-open. */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const res = await handle(async () => {
    const a = await locationAvailability(params.id);
    if (!a) throw new DomainError('Centre not found.', 404);
    return a;
  });
  res.headers.set('Access-Control-Allow-Origin', '*');
  res.headers.set('Cache-Control', 'public, max-age=60');
  return res as NextResponse;
}
