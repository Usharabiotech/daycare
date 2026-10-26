import { AGE_GROUPS } from '@/domain/types';
import { roster } from '@/services/centre';
import { timeOfDay } from '@/lib/format';
import { attendanceAction } from '../../../actions';
import { Flash } from '../../../components/Flash';

export default async function Attendance({ params, searchParams }: { params: { locationId: string }; searchParams: { ok?: string; error?: string } }) {
  const rows = await roster(params.locationId);
  const inNow = rows.filter((r) => r.checkedIn && !r.checkedOut).length;
  return (
    <div className="stack">
      <Flash searchParams={searchParams} />
      <div className="kpis">
        <div className="kpi"><b>{inNow}</b><span>In now</span></div>
        <div className="kpi"><b>{rows.filter((r) => r.checkedOut).length}</b><span>Picked up</span></div>
        <div className="kpi"><b>{rows.filter((r) => !r.checkedIn).length}</b><span>Not arrived / absent</span></div>
      </div>
      <div className="tablewrap">
        <table>
          <thead><tr><th>Child</th><th>Room</th><th>In</th><th>Out</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {rows.map((r) => {
              const status = !r.checkedIn ? ['short', 'Not in'] : r.checkedOut ? ['full', 'Picked up'] : ['open', 'In'];
              const label = !r.checkedIn ? 'Check in' : r.checkedOut ? 'Check in again' : 'Check out';
              return (
                <tr key={r.booking.id}>
                  <td>{r.childName}</td>
                  <td>{r.room.attrs.ageGroup ? AGE_GROUPS[r.room.attrs.ageGroup].label : r.room.name}</td>
                  <td className="num">{timeOfDay(r.checkedIn)}</td>
                  <td className="num">{timeOfDay(r.checkedOut)}</td>
                  <td><span className={`pill ${status[0]}`}>{status[1]}</span></td>
                  <td>
                    <form action={attendanceAction}>
                      <input type="hidden" name="locationId" value={params.locationId} />
                      <input type="hidden" name="bookingId" value={r.booking.id} />
                      <button className="btn small" type="submit">{label}</button>
                    </form>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
