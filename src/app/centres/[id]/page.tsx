import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AGE_GROUPS, AGE_GROUP_KEYS, ageGroupFor } from '@/domain/types';
import { estimateWaitMonths, formatWait } from '@/domain/queue';
import { getProvince, parentFeeMonthly } from '@/domain/rules/provinces';
import { localDate, timeZoneFor } from '@/domain/time';
import { dollars, relTime } from '@/lib/format';
import { currentUser, familyChildren } from '@/services/auth';
import { CLAIM_ROLES, centreDetail, familyInterests } from '@/services/directory';
import { claimCentreAction, joinWaitlist, registerInterestAction, removeInterestAction } from '../../actions';
import { Flash } from '../../components/Flash';

type Props = { params: { id: string }; searchParams: { ok?: string; error?: string } };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const c = await centreDetail(params.id);
  return { title: c ? `${c.location.name} · NidHub` : 'Centre not found · NidHub' };
}

function spaces(open: number | null) {
  if (open == null) return { cls: 'short', text: 'Not published' };
  if (open === 0) return { cls: 'full', text: 'Full' };
  return { cls: open <= 2 ? 'short' : 'open', text: `${open} open` };
}

/** "Full Day(6 hours or more in a day), Before school" → ["Full day (6 hours or more in a day)", "Before school"] */
function services(programOption?: string) {
  return (programOption ?? '').split(',').map((s) => s.trim().replace(/\s*\(/, ' (').replace(/^Full Day/, 'Full day')).filter(Boolean);
}

function licensedSince(issueDate?: string) {
  if (!issueDate) return null;
  return new Date(`${issueDate}T00:00:00Z`).toLocaleDateString('en-CA', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });
}

export default async function CentrePage({ params, searchParams }: Props) {
  const c = await centreDetail(params.id);
  if (!c) notFound();
  const { location: loc, operator, listing } = c;
  const a = loc.attrs;
  const user = await currentUser();
  const isFamily = user?.role === 'family' && !!user.customerId;
  const [kids, mine] = isFamily
    ? await Promise.all([familyChildren(user!.customerId!), familyInterests(user!.customerId!)])
    : [[], []];
  const here = mine.filter((m) => m.location.id === loc.id);
  const registered = new Set(here.map((m) => m.interest.dependantId));
  const tz = timeZoneFor(loc.province);
  const self = `/centres/${loc.id}`;

  const place = [loc.name, loc.address, loc.city, loc.province].filter(Boolean).join(', ');
  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place)}`;
  const directionsUrl = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(place)}`;
  const fee = listing.directory ? null : parentFeeMonthly({ province: loc.province, centreFeeMonthly: (loc.baseFeeCents ?? 0) / 100, inProgram: listing.inProgram });

  const facts: [string, string | null | undefined][] = listing.directory
    ? [
        ['Operated by', operator],
        ['Type', a.programType],
        ['Licence number', loc.licenceNo],
        ['Licensed since', licensedSince(a.issueDate)],
        ['Language of service', a.language],
        ['Local service manager', a.cmsm],
        ['Ministry region', a.region],
      ]
    : [
        ['Operated by', operator],
        ['Hours', loc.hours],
        ['Licence number', loc.licenceNo],
        ['Fees', fee ? `From ${dollars(fee.amount)}/month (${fee.basis})` : null],
      ];

  return (
    <div className="stack">
      <Link href="/" className="small back">← Back to search</Link>
      <Flash searchParams={searchParams} />

      <section className="hero rise">
        <div className="stack">
          <div>
            <div className="eyebrow">{listing.directory ? a.programType ?? 'Licensed child care' : 'On NidHub · live availability'}</div>
            <h1>{loc.name}</h1>
            <p className="lede">{[loc.address, `${loc.city}, ${loc.province}`].filter(Boolean).join(' · ')}</p>
          </div>
          <div className="chips">
            {listing.inProgram && <span className="chip program">{getProvince(loc.province)?.programName ?? 'Reduced-fee program'}</span>}
            {services(a.programOption).map((s) => <span className="chip" key={s}>{s}</span>)}
            {a.language && <span className="chip">{a.language}</span>}
          </div>
          <div className="row">
            <a className="btn primary" href={mapsUrl} target="_blank" rel="noopener noreferrer">Open in Google Maps</a>
            <a className="btn" href={directionsUrl} target="_blank" rel="noopener noreferrer">Directions</a>
          </div>
          {listing.directory && <p className="small">Google Maps shows the centre&apos;s phone number, website, hours and reviews.</p>}
        </div>
      </section>

      <div className="split">
        <section className="panel">
          <h2>About this centre</h2>
          <dl className="facts">
            {facts.filter(([, v]) => v).map(([k, v]) => (
              <div key={k}><dt>{k}</dt><dd>{v}</dd></div>
            ))}
          </dl>
          {listing.directory && <p className="small">From Ontario&apos;s public registry of licensed child care. The registry doesn&apos;t list capacity, fees or open spaces.</p>}
        </section>

        {listing.directory ? (
          <section className="panel">
            <h2>Interested in this centre?</h2>
            <div className="kpi">
              <b>{listing.interested}</b>
              <span>{listing.interested === 1 ? 'child registered' : 'children registered'} on NidHub{listing.interested === 0 ? ' — be the first' : ''}</span>
            </div>

            {isFamily ? (
              kids.length === 0 ? (
                <p className="small">Add a child to your account to register interest.</p>
              ) : (
                <div className="stack">
                  {here.map((m) => (
                    <form action={removeInterestAction} className="row interest" key={m.interest.id}>
                      <input type="hidden" name="interestId" value={m.interest.id} />
                      <input type="hidden" name="back" value={self} />
                      <span><b>{m.childName.split(' ')[0]}</b> · {AGE_GROUPS[m.interest.ageGroup].label}<div className="small">Registered {localDate(tz, m.interest.createdAt)}</div></span>
                      <button className="btn small" type="submit">Remove</button>
                    </form>
                  ))}
                  {kids.filter((k) => !registered.has(k.id)).map((k) => (
                    <form action={registerInterestAction} className="row interest" key={k.id}>
                      <input type="hidden" name="locationId" value={loc.id} />
                      <input type="hidden" name="dependantId" value={k.id} />
                      <span><b>{k.name.split(' ')[0]}</b></span>
                      <select name="ageGroup" aria-label={`Age group for ${k.name.split(' ')[0]}`} defaultValue={ageGroupFor(k.birthDate)}>
                        {AGE_GROUP_KEYS.map((g) => <option key={g} value={g}>{AGE_GROUPS[g].label}</option>)}
                      </select>
                      <button className="btn primary small" type="submit">Register interest</button>
                    </form>
                  ))}
                </div>
              )
            ) : user ? (
              <p className="small">Families can register interest here. You&apos;re signed in as a centre director.</p>
            ) : (
              <Link className="btn primary" href={`/login?next=${encodeURIComponent(self)}`} style={{ alignSelf: 'start' }}>Sign in to register interest</Link>
            )}

            <p className="small">This centre isn&apos;t on NidHub yet. Registering doesn&apos;t put you on its own waitlist — contact the centre as well. Your interest is kept on your My waitlists page.</p>
          </section>
        ) : (
          <section className="panel">
            <h2>Spaces right now</h2>
            <div className="tablewrap">
              <table>
                <thead><tr><th>Age group</th><th>Spaces</th><th className="r">Waiting</th><th>Wait if you join today</th></tr></thead>
                <tbody>
                  {listing.rooms.map((r) => {
                    const s = spaces(r.open);
                    return (
                      <tr key={r.resourceId}>
                        <td>{r.ageGroup ? AGE_GROUPS[r.ageGroup].label : r.name}</td>
                        <td><span className={`pill ${s.cls}`}>{s.text}</span></td>
                        <td className="r num">{r.waiting}</td>
                        <td>{r.ageGroup ? formatWait(estimateWaitMonths(r.ageGroup, r.capacity, r.waiting + 1)) : '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="small">Updated by the centre {relTime(listing.updatedAt)}.</p>
            {isFamily && kids.length > 0 ? (
              <form action={joinWaitlist} className="join">
                <input type="hidden" name="back" value={self} />
                <select name="resourceId" aria-label="Room" defaultValue={listing.rooms[0]?.resourceId}>
                  {listing.rooms.map((r) => <option key={r.resourceId} value={r.resourceId}>{r.ageGroup ? AGE_GROUPS[r.ageGroup].label : r.name}</option>)}
                </select>
                <select name="dependantId" aria-label="Child">
                  {kids.map((k) => <option key={k.id} value={k.id}>{k.name.split(' ')[0]}</option>)}
                </select>
                <button className="btn primary small" type="submit">Join waitlist</button>
              </form>
            ) : !user ? (
              <Link className="btn primary" href={`/login?next=${encodeURIComponent(self)}`} style={{ alignSelf: 'start' }}>Sign in to join the waitlist</Link>
            ) : null}
          </section>
        )}
      </div>

      {listing.directory && (
        <details className="panel claim">
          <summary><b>Is this your centre?</b> Claim it to publish open spaces and run your waitlist on NidHub.</summary>
          <form action={claimCentreAction} className="stack">
            <input type="hidden" name="locationId" value={loc.id} />
            <div className="row">
              <label className="f" htmlFor="claim-name">Your name<input id="claim-name" name="name" required minLength={2} maxLength={120} autoComplete="name" /></label>
              <label className="f" htmlFor="claim-role">Your role
                <select id="claim-role" name="role" required defaultValue="">
                  <option value="" disabled>Choose…</option>
                  {CLAIM_ROLES.map((r) => <option key={r}>{r}</option>)}
                </select>
              </label>
            </div>
            <div className="row">
              <label className="f" htmlFor="claim-email">Work email<input id="claim-email" name="email" type="email" required maxLength={200} autoComplete="email" /></label>
              <label className="f" htmlFor="claim-phone">Phone<input id="claim-phone" name="phone" type="tel" required maxLength={30} autoComplete="tel" /></label>
            </div>
            <label className="f" htmlFor="claim-note">Anything we should know? (optional)<textarea id="claim-note" name="note" rows={3} maxLength={1000} /></label>
            <p className="small">We&apos;ll call to confirm you work at {loc.name} (licence {loc.licenceNo ?? 'on file'}) before giving you access. Nothing on this page changes until then.</p>
            <button className="btn primary" type="submit" style={{ alignSelf: 'start' }}>Send claim request</button>
          </form>
        </details>
      )}
    </div>
  );
}
