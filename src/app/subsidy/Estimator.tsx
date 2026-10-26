'use client';

import { useState } from 'react';
import { PROVINCES, estimateSubsidy, parentFeeMonthly, type ProvinceCode } from '@/domain/rules/provinces';
import { dollars } from '@/lib/format';

export function Estimator() {
  const [province, setProvince] = useState<ProvinceCode>('ON');
  const [income, setIncome] = useState(62000);
  const [size, setSize] = useState(4);
  const [support, setSupport] = useState(0);
  const [fee, setFee] = useState(1400);
  const [inProgram, setInProgram] = useState(true);

  const pf = parentFeeMonthly({ province, centreFeeMonthly: fee, inProgram });
  const sub = estimateSubsidy({ province, annualIncome: income, familySize: size, childrenWithSupportNeeds: support, parentFeeMonthly: pf.amount });
  const pay = Math.max(0, pf.amount - sub.monthly);
  const p = PROVINCES[province];

  return (
    <div className="panel">
      <div className="row">
        <label className="f" htmlFor="prov">Province
          <select id="prov" value={province} onChange={(e) => setProvince(e.target.value as ProvinceCode)}>
            {Object.values(PROVINCES).map((x) => <option key={x.code} value={x.code}>{x.name}</option>)}
          </select>
        </label>
        <label className="f" htmlFor="inc">Family income (CAD/yr)
          <input id="inc" type="number" min={0} step={1000} value={income} onChange={(e) => setIncome(Number(e.target.value) || 0)} style={{ width: 140 }} />
        </label>
        <label className="f" htmlFor="size">Family size
          <input id="size" type="number" min={2} max={12} value={size} onChange={(e) => setSize(Number(e.target.value) || 2)} style={{ width: 80 }} />
        </label>
        <label className="f" htmlFor="sn">Children with support needs
          <input id="sn" type="number" min={0} max={6} value={support} onChange={(e) => setSupport(Number(e.target.value) || 0)} style={{ width: 80 }} />
        </label>
        <label className="f" htmlFor="fee">Centre fee ($/month)
          <input id="fee" type="number" min={0} step={50} value={fee} onChange={(e) => setFee(Number(e.target.value) || 0)} style={{ width: 110 }} />
        </label>
        <label className="f" htmlFor="prog">Centre in {p.programName}?
          <select id="prog" value={inProgram ? 'y' : 'n'} onChange={(e) => setInProgram(e.target.value === 'y')}>
            <option value="y">Yes</option><option value="n">No</option>
          </select>
        </label>
      </div>
      <div className="result">
        <span className="small">Estimated parent cost, full-time</span>
        <b className="big">{dollars(pay)}<span className="small"> / month</span></b>
        <span className="small">Fee basis: {pf.basis} ({dollars(pf.amount)}/mo). Subsidy: {sub.monthly > 0 ? `${dollars(sub.monthly)}/mo` : 'none estimated'}{sub.confidence === 'approximate' ? ' (approximate)' : ''}.</span>
        <span className="small">{sub.explanation}</span>
      </div>
      <p className="small">Indicative only. Final eligibility and amounts are decided by the province or municipality.</p>
    </div>
  );
}
