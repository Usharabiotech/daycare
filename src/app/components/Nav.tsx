'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export function Nav({ isCentre }: { isCentre: boolean }) {
  const path = usePathname();
  const links = [
    { href: '/', label: 'Find care', match: (p: string) => p === '/' || p.startsWith('/centres/') },
    { href: '/waitlists', label: 'My waitlists', match: (p: string) => p.startsWith('/waitlists') },
    { href: '/subsidy', label: 'Fees & subsidy', match: (p: string) => p.startsWith('/subsidy') },
    // `/centre/…` is the ERP; the public `/centres/…` pages belong to Find care.
    ...(isCentre ? [{ href: '/centre', label: 'Centre ERP', match: (p: string) => p === '/centre' || p.startsWith('/centre/') }] : []),
  ];
  return (
    <nav className="main" aria-label="Main">
      {links.map((l) => (
        <Link key={l.href} href={l.href} aria-current={l.match(path) ? 'page' : undefined}>{l.label}</Link>
      ))}
    </nav>
  );
}

export function CentreTabs({ locationId }: { locationId: string }) {
  const path = usePathname();
  const base = `/centre/${locationId}`;
  const tabs = [
    { href: base, label: 'Dashboard' },
    { href: `${base}/waitlist`, label: 'Waitlist & offers' },
    { href: `${base}/attendance`, label: 'Attendance' },
    { href: `${base}/billing`, label: 'Billing & subsidy' },
    { href: `${base}/staff`, label: 'Staff & ratios' },
  ];
  return (
    <nav className="tabs" aria-label="Centre sections">
      {tabs.map((t) => (
        <Link key={t.href} href={t.href} aria-current={path === t.href ? 'page' : undefined}>{t.label}</Link>
      ))}
    </nav>
  );
}
