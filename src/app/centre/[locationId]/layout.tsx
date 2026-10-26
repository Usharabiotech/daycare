import Link from 'next/link';
import { getProvince } from '@/domain/rules/provinces';
import { DomainError } from '@/domain/types';
import { requireCentreAdmin } from '@/services/auth';
import { getLocation } from '@/services/centre';
import { CentreTabs } from '../../components/Nav';

export default async function CentreLayout({ children, params }: { children: React.ReactNode; params: { locationId: string } }) {
  try {
    await requireCentreAdmin(params.locationId);
  } catch (e) {
    if (e instanceof DomainError) {
      return (
        <div className="stack">
          <h1>Centre ERP</h1>
          <p className="lede">{e.message}</p>
          <Link className="btn primary" href="/login" style={{ alignSelf: 'start' }}>Sign in</Link>
        </div>
      );
    }
    throw e;
  }
  const loc = await getLocation(params.locationId);
  const programs = loc.attrs.fundingPrograms ?? [];
  return (
    <div className="stack">
      <div>
        <div className="eyebrow">Centre operations</div>
        <h1>{loc.name}</h1>
        <p className="lede">{loc.city}, {getProvince(loc.province)?.name ?? loc.province} · {programs.length ? `${getProvince(loc.province)?.programName} participant` : 'Market-fee centre'} · Licence {loc.licenceNo}</p>
      </div>
      <CentreTabs locationId={loc.id} />
      {children}
    </div>
  );
}
