import { AGE_GROUPS } from '@/domain/types';
import { dashboard } from '@/services/centre';
import { relTime } from '@/lib/format';
import { publishAction } from '../../actions';
import { Flash } from '../../components/Flash';

export default async function Dashboard({ params, searchParams }: { params: { locationId: string }; searchParams: { ok?: string; error?: string } }) {
  const rooms = await dashboard(params.locationId);
  const cap = rooms.reduce((s, r) => s + r.room.capacity, 0);
  const enrolled = rooms.reduce((s, r) => s + r.active, 0);
  const open = rooms.reduce((s, r) => s + r.open, 0);
  const waiting = rooms.reduce((s, r) => s + r.waiting, 0);
  const present = rooms.reduce((s, r) => s + r.present, 0);

  return (
    <div className="stack">
      <Flash searchParams={searchParams} />
      <div className="kpis">
        <div className="kpi"><b>{enrolled}/{cap}</b><span>Enrolled / licensed capacity</span></div>
        <div className="kpi"><b>{open}</b><span>Open spaces</span></div>
        <div className="kpi"><b>{present}</b><span>Children in today</span></div>
        <div className="kpi"><b>{waiting}</b><span>Children waiting</span></div>
      </div>
      <div className="tablewrap">
        <table>
          <thead><tr><th>Room</th><th>Occupancy</th><th className="r">Enrolled</th><th className="r">Offers out</th><th className="r">Capacity</th><th className="r">Open</th><th className="r">Waiting</th><th>Families see</th></tr></thead>
          <tbody>
            {rooms.map((r) => {
              const pct = (r.active + r.offered) / r.room.capacity;
              return (
                <tr key={r.room.id}>
                  <td>{r.room.attrs.ageGroup ? AGE_GROUPS[r.room.attrs.ageGroup].label : r.room.name}</td>
                  <td><div className="bar-track"><div className={`bar-fill ${pct >= 1 ? 'max' : pct > 0.85 ? 'hi' : ''}`} style={{ width: `${Math.min(100, pct * 100)}%` }} /></div></td>
                  <td className="r num">{r.active}</td>
                  <td className="r num">{r.offered}</td>
                  <td className="r num">{r.room.capacity}</td>
                  <td className="r num">{r.open}</td>
                  <td className="r num">{r.waiting}</td>
                  <td><span className="small">{r.room.publishedOpen ?? '—'} open · {relTime(r.room.publishedAt)}</span></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <form action={publishAction} className="row">
        <input type="hidden" name="locationId" value={params.locationId} />
        <button className="btn primary" type="submit">Publish availability now</button>
        <span className="small">Offers and enrolments update the public listing automatically. Use this after changing capacity.</span>
      </form>
    </div>
  );
}
