import { NextResponse } from 'next/server';
import { expireOffers } from '@/services/queue';

export const dynamic = 'force-dynamic';

/** Call every 15 minutes from your scheduler with header `Authorization: Bearer $CRON_SECRET`. */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const expired = await expireOffers();
  return NextResponse.json({ expired });
}
