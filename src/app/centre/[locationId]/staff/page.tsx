import { AGE_GROUPS } from '@/domain/types';
import { ratioStatus, staffList } from '@/services/centre';
import { shiftAction } from '../../../actions';
import { Flash } from '../../../components/Flash';

export default async function Staff({ params, searchParams }: { params: { locationId: string }; searchParams: { ok?: string; error?: string } }) {
  const [ratios, team] = await Promise.all([ratioStatus(params.locationId), staffList(params.locationId)]);
  return (
    <div className="stack">
      <Flash searchParams={searchParams} />
      <h2>Ratios right now</h2>
      <div className="tablewrap">
        <table>
          <thead><tr><th>Room</th><th>Required (staff : children)</th><th className="r">Children in</th><th className="r">Staff on shift</th><th className="r">Staff needed</th><th>Status</th></tr></thead>
          <tbody>
            {ratios.map((r) => (
              <tr key={r.room.id}>
                <td>{r.room.attrs.ageGroup ? AGE_GROUPS[r.room.attrs.ageGroup].label : r.room.name}</td>
                <td className="num">{r.ratio ? r.ratio.join(' : ') : '—'}</td>
                <td className="r num">{r.children}</td>
                <td className="r num">{r.staffOnShift}</td>
                <td className="r num">{r.needed}</td>
                <td>{r.ok ? <span className="pill open">In ratio</span> : <span className="pill full">Short {r.needed - r.staffOnShift}</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <h2>Team</h2>
      <div className="tablewrap">
        <table>
          <thead><tr><th>Name</th><th>Role</th><th>Room</th><th>Shift</th><th></th></tr></thead>
          <tbody>
            {team.map(({ s, roomName }) => (
              <tr key={s.id}>
                <td>{s.name}</td>
                <td>{s.role}</td>
                <td>{roomName ?? '—'}</td>
                <td>{s.onShift ? <span className="pill open">On shift</span> : <span className="pill short">Off</span>}</td>
                <td>
                  <form action={shiftAction}>
                    <input type="hidden" name="locationId" value={params.locationId} />
                    <input type="hidden" name="staffId" value={s.id} />
                    <button className="btn small" type="submit">{s.onShift ? 'End shift' : 'Start shift'}</button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
