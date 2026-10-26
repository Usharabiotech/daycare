import Link from 'next/link';
import { AGE_GROUPS } from '@/domain/types';
import { formatWait } from '@/domain/queue';
import { timeZoneFor } from '@/domain/time';
import { dateTime } from '@/lib/format';
import { currentUser } from '@/services/auth';
import { familyWaitlists } from '@/services/queue';
import { acceptOfferAction, declineOfferAction, withdrawAction } from '../actions';
import { Flash } from '../components/Flash';

export default async function MyWaitlists({ searchParams }: { searchParams: { ok?: string; error?: string } }) {
  const user = await currentUser();
  if (!user?.customerId) {
    return (
      <div className="stack">
        <h1>My waitlists</h1>
        <p className="lede">Sign in as a family to see your waitlist positions and offers.</p>
        <Link className="btn primary" href="/login?next=/waitlists" style={{ alignSelf: 'start' }}>Sign in</Link>
      </div>
    );
  }
  const entries = await familyWaitlists(user.customerId);
  const offers = entries.filter((e) => e.entry.status === 'offered');
  const waiting = entries.filter((e) => e.entry.status === 'waiting').sort((a, b) => a.position - b.position);

  return (
    <div className="stack">
      <div>
        <div className="eyebrow">My waitlists</div>
        <h1>Where you stand</h1>
        <p className="lede">Positions update as centres enrol children. Wait ranges assume children leave a room at the usual age for that group. When you accept a space, your other entries for that child close automatically.</p>
      </div>
      <Flash searchParams={searchParams} />

      {offers.length > 0 && (
        <section className="stack">
          <h2>Offers waiting for you</h2>
          {offers.map((o) => (
            <div className="card" key={o.entry.id} style={{ borderColor: 'var(--good)' }}>
              <div>
                <h3>{o.location.name} has a space for {o.childName.split(' ')[0]}</h3>
                <div className="meta">{o.room.name} · {o.location.city} · answer by {dateTime(o.entry.offerExpiresAt, timeZoneFor(o.location.province))}</div>
              </div>
              <div className="row">
                <form action={acceptOfferAction}><input type="hidden" name="entryId" value={o.entry.id} /><button className="btn primary" type="submit">Accept space</button></form>
                <form action={declineOfferAction}><input type="hidden" name="entryId" value={o.entry.id} /><button className="btn" type="submit">Decline</button></form>
              </div>
            </div>
          ))}
        </section>
      )}

      <section className="stack">
        <h2>Waiting</h2>
        {waiting.length === 0 && <p className="small">You are not on any waitlists. <Link href="/">Find care</Link>.</p>}
        <div className="tablewrap">
          <table>
            <thead><tr><th>Child</th><th>Centre</th><th>Room</th><th className="r">Position</th><th>Estimated wait</th><th></th></tr></thead>
            <tbody>
              {waiting.map((w) => (
                <tr key={w.entry.id}>
                  <td>{w.childName}</td>
                  <td>{w.location.name}<div className="small">{w.location.city}</div></td>
                  <td>{w.room.attrs.ageGroup ? AGE_GROUPS[w.room.attrs.ageGroup].label : w.room.name}</td>
                  <td className="r num">{w.position} of {w.total}</td>
                  <td>{w.wait ? formatWait(w.wait) : '—'}</td>
                  <td><form action={withdrawAction}><input type="hidden" name="entryId" value={w.entry.id} /><button className="btn small" type="submit">Leave list</button></form></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
