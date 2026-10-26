import { AGE_GROUPS } from '@/domain/types';
import { locationQueue } from '@/services/queue';
import { markAcceptedAction, offerSpaceAction } from '../../../actions';
import { Flash } from '../../../components/Flash';

const SHOW = 25;

export default async function Waitlist({ params, searchParams }: { params: { locationId: string }; searchParams: { ok?: string; error?: string; room?: string } }) {
  const rooms = await locationQueue(params.locationId);
  return (
    <div className="stack">
      <Flash searchParams={searchParams} />
      <p className="small">Admission order: staff children, then siblings, then application date. An offer holds the space for 48 hours; unanswered offers expire and the space returns to the list.</p>
      {rooms.map(({ room, open, entries }) => (
        <section className="stack" key={room.id}>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <h2>{room.attrs.ageGroup ? AGE_GROUPS[room.attrs.ageGroup].label : room.name} room</h2>
            <span className={`pill ${open > 0 ? 'open' : 'full'}`}>{open} open of {room.capacity}</span>
          </div>
          <div className="tablewrap">
            <table>
              <thead><tr><th>#</th><th>Child</th><th>Born</th><th>Applied</th><th>Wants start</th><th>Flags</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {entries.slice(0, SHOW).map(({ position, entry, childName, birthDate }) => (
                  <tr key={entry.id} className={entry.status === 'offered' ? 'offered' : undefined}>
                    <td className="num">{position}</td>
                    <td>{childName}</td>
                    <td className="num">{birthDate ?? '—'}</td>
                    <td className="num">{entry.appliedAt.toISOString().slice(0, 10)}</td>
                    <td className="num">{entry.desiredStart ?? '—'}</td>
                    <td>
                      {entry.flags.staffChild && <span className="chip">Staff child</span>} {entry.flags.sibling && <span className="chip">Sibling</span>} {entry.flags.needsSubsidy && <span className="chip program">Subsidy</span>}
                    </td>
                    <td>{entry.status === 'offered' ? `Offer sent · expires ${entry.offerExpiresAt?.toISOString().slice(0, 16).replace('T', ' ')}` : 'Waiting'}</td>
                    <td>
                      {entry.status === 'waiting' ? (
                        <form action={offerSpaceAction}>
                          <input type="hidden" name="locationId" value={params.locationId} />
                          <input type="hidden" name="entryId" value={entry.id} />
                          <button className={`btn small ${open > 0 ? 'primary' : ''}`} type="submit" disabled={open <= 0} title={open > 0 ? undefined : 'No open space in this room'}>Offer space</button>
                        </form>
                      ) : (
                        <form action={markAcceptedAction}>
                          <input type="hidden" name="locationId" value={params.locationId} />
                          <input type="hidden" name="entryId" value={entry.id} />
                          <button className="btn small" type="submit">Mark accepted</button>
                        </form>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {entries.length > SHOW && <p className="small">Showing the first {SHOW} of {entries.length}.</p>}
        </section>
      ))}
    </div>
  );
}
