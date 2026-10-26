import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';
import { currentUser } from '@/services/auth';
import { signOut } from './actions';
import { Nav } from './components/Nav';

export const metadata: Metadata = {
  title: 'NidHub',
  description: 'Live childcare availability, waitlists and subsidies — and the operations software centres use to run them.',
};

export const dynamic = 'force-dynamic';

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  return (
    <html lang="en-CA">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,600;12..96,700;12..96,800&family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@500&display=swap" />
      </head>
      <body>
        <header className="bar">
          <div className="wrap">
            <Link href="/" className="brand"><i aria-hidden="true" />NidHub</Link>
            <Nav isCentre={user?.role === 'centre_admin'} />
            <div className="who">
              {user ? (
                <>
                  <span>{user.name}</span>
                  <form action={signOut} className="inline"><button className="btn small" type="submit">Sign out</button></form>
                </>
              ) : (
                <Link href="/login" className="btn small">Sign in</Link>
              )}
            </div>
          </div>
        </header>
        <main className="wrap">{children}</main>
      </body>
    </html>
  );
}
