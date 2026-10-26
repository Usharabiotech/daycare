import Link from 'next/link';
import { redirect } from 'next/navigation';
import { currentUser } from '@/services/auth';
import { orgLocations } from '@/services/centre';

export default async function CentreHome() {
  const user = await currentUser();
  if (user?.role !== 'centre_admin' || !user.orgId) {
    return (
      <div className="stack">
        <h1>Centre ERP</h1>
        <p className="lede">Sign in as a centre director to manage enrolment, waitlists, attendance and billing.</p>
        <Link className="btn primary" href="/login" style={{ alignSelf: 'start' }}>Sign in</Link>
      </div>
    );
  }
  const locs = await orgLocations(user.orgId);
  if (locs.length === 1) redirect(`/centre/${locs[0].id}`);
  return (
    <div className="stack">
      <h1>Your centres</h1>
      <div className="grid">
        {locs.map((l) => (
          <Link key={l.id} href={`/centre/${l.id}`} className="card" style={{ textDecoration: 'none', color: 'inherit' }}>
            <h3>{l.name}</h3>
            <div className="meta">{l.city}, {l.province}</div>
          </Link>
        ))}
      </div>
    </div>
  );
}
