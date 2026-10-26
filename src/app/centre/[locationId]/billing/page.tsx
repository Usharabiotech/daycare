import { billingPreview, invoiceCount } from '@/services/centre';
import { currentPeriod, money } from '@/lib/format';
import { invoicesAction } from '../../../actions';
import { Flash } from '../../../components/Flash';

export default async function Billing({ params, searchParams }: { params: { locationId: string }; searchParams: { ok?: string; error?: string } }) {
  const period = currentPeriod();
  const [lines, existing] = await Promise.all([billingPreview(params.locationId), invoiceCount(params.locationId, period)]);
  const t = lines.reduce((s, l) => ({ fee: s.fee + l.feeCents, parent: s.parent + l.parentCents, sub: s.sub + l.subsidyCents, prog: s.prog + l.programCents }), { fee: 0, parent: 0, sub: 0, prog: 0 });
  return (
    <div className="stack">
      <Flash searchParams={searchParams} />
      <div className="kpis">
        <div className="kpi"><b>{money(t.fee)}</b><span>Monthly fee value</span></div>
        <div className="kpi"><b>{money(t.parent)}</b><span>Billed to parents</span></div>
        <div className="kpi"><b>{money(t.sub)}</b><span>Subsidy claims</span></div>
        <div className="kpi"><b>{money(t.prog)}</b><span>Program funding claim</span></div>
      </div>
      <form action={invoicesAction} className="row">
        <input type="hidden" name="locationId" value={params.locationId} />
        <input type="hidden" name="period" value={period} />
        <button className="btn primary" type="submit" disabled={existing > 0}>{existing > 0 ? `${existing} invoices exist for ${period}` : `Create draft invoices for ${period}`}</button>
        <span className="small">{lines[0]?.basis ? `Parent fee basis: ${lines[0].basis}.` : ''} Subsidy amounts come from each family&apos;s approved subsidy.</span>
      </form>
      <div className="tablewrap">
        <table>
          <thead><tr><th>Child</th><th>Room</th><th className="r">Centre fee</th><th className="r">Parent pays</th><th className="r">Subsidy</th><th className="r">Program funding</th></tr></thead>
          <tbody>
            {lines.map((l) => (
              <tr key={l.bookingId}>
                <td>{l.childName}</td>
                <td>{l.roomName}</td>
                <td className="r num">{money(l.feeCents)}</td>
                <td className="r num">{money(l.parentCents)}</td>
                <td className="r num">{l.subsidyCents ? money(l.subsidyCents) : '—'}</td>
                <td className="r num">{money(l.programCents)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
