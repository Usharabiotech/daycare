import { PROVINCES } from '@/domain/rules/provinces';
import { Estimator } from './Estimator';

export default function SubsidyPage() {
  return (
    <div className="stack">
      <div>
        <div className="eyebrow">Fees &amp; subsidy</div>
        <h1>What will I pay?</h1>
        <p className="lede">Each province runs its own reduced-fee program and income-tested subsidy. Enter your details for an estimate.</p>
      </div>
      <Estimator />
      <h2>Province rules in use</h2>
      <div className="tablewrap">
        <table>
          <thead><tr><th>Province</th><th>Program</th><th>Parent fee at program centres</th><th>Ratios (infant / toddler / preschool)</th></tr></thead>
          <tbody>
            {Object.values(PROVINCES).map((p) => (
              <tr key={p.code}>
                <td>{p.name}</td>
                <td>{p.programName}</td>
                <td>{p.programFlatMonthly ? `$${p.programFlatMonthly}/month` : p.programDailyFee ? `$${p.programDailyFee}/day` : 'Varies'}</td>
                <td className="num">{(['infant', 'toddler', 'preschool'] as const).map((a) => p.ratios[a].join(':')).join(' / ')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
