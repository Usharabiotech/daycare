import Link from 'next/link';
import { AGE_GROUPS, AGE_GROUP_KEYS, isAgeGroup } from '@/domain/types';
import { getProvince, parentFeeMonthly } from '@/domain/rules/provinces';
import { currentUser, familyChildren } from '@/services/auth';
import { listCities, searchListings } from '@/services/listings';
import { dollars, relTime } from '@/lib/format';
import { joinWaitlist } from './actions';
import { Flash } from './components/Flash';

type SP = { city?: string; age?: string; show?: string; page?: string; ok?: string; error?: string };

/** How many centre cards to render at once. The registry has thousands; families filter by city. */
const PAGE_SIZE = 48;

function spaces(open: number | null) {
  if (open == null) return { cls: 'short', text: 'Not published' };
  if (open === 0) return { cls: 'full', text: 'Full' };
  return { cls: open <= 2 ? 'short' : 'open', text: `${open} open` };
}

export default async function FindCare({ searchParams }: { searchParams: SP }) {
  const ageGroup = isAgeGroup(searchParams.age) ? searchParams.age : undefined;
  const pageNo = Math.max(1, Math.floor(Number(searchParams.page)) || 1);
  const [cities, page, user] = await Promise.all([
    listCities(),
    searchListings({
      city: searchParams.city || undefined,
      ageGroup,
      onlyOpen: searchParams.show === 'open',
      onlyProgram: searchParams.show === 'program',
      limit: PAGE_SIZE,
      offset: (pageNo - 1) * PAGE_SIZE,
    }),
    currentUser(),
  ]);
  const { listings, total } = page;
  const kids = user?.customerId ? await familyChildren(user.customerId) : [];
  const filters = Object.entries({ city: searchParams.city ?? '', age: searchParams.age ?? '', show: searchParams.show ?? '' }).filter(([, v]) => v);
  const pageHref = (n: number) => '/?' + new URLSearchParams([...filters, ...(n > 1 ? [['page', String(n)]] : [])]).toString();
  const back = pageHref(pageNo);
  const pages = Math.ceil(total / PAGE_SIZE);
  const first = (pageNo - 1) * PAGE_SIZE + 1;
  const last = (pageNo - 1) * PAGE_SIZE + listings.length;

  return (
    <div className="stack">
      <section className="hero rise">
        <div className="stack">
          <div>
            <div className="eyebrow">For parents</div>
            <h1>See open childcare spaces without calling around</h1>
            <p className="lede">Licensed centres publish their open spaces by age group. Join waitlists in one place, see your position and an estimated wait, and check what your province pays toward your fees.</p>
          </div>

          <form className="row" method="get">
        <label className="f" htmlFor="city">City
          <select id="city" name="city" defaultValue={searchParams.city ?? ''}>
            <option value="">All cities</option>
            {cities.map((c) => <option key={c}>{c}</option>)}
          </select>
        </label>
        <label className="f" htmlFor="age">Child&apos;s age group
          <select id="age" name="age" defaultValue={ageGroup ?? ''}>
            <option value="">Any age</option>
            {AGE_GROUP_KEYS.map((a) => <option key={a} value={a}>{AGE_GROUPS[a].label}</option>)}
          </select>
        </label>
        <label className="f" htmlFor="show">Show
          <select id="show" name="show" defaultValue={searchParams.show ?? ''}>
            <option value="">All centres</option>
            <option value="open">Only with open spaces</option>
            <option value="program">Only reduced-fee program centres</option>
          </select>
        </label>
        <button className="btn primary" type="submit">Search</button>
          </form>
        </div>
      </section>
      <Flash searchParams={searchParams} />

      {total > 0 && (
        <p className="small">
          {total.toLocaleString()} licensed {searchParams.city ? `centres in ${searchParams.city}` : 'centres'}
          {pages > 1 && listings.length > 0 && <> · showing {first.toLocaleString()}–{last.toLocaleString()}</>}
          {pages > 1 && !searchParams.city && <>. Pick a city to narrow.</>}
        </p>
      )}

      {listings.length === 0 && <p className="small">{total > 0 ? <>No more centres. <Link href={pageHref(1)}>Back to the first page</Link>.</> : 'No centres match these filters.'}</p>}
      <div className="grid stagger">
        {listings.map((l) => {
          const fee = l.directory ? null : parentFeeMonthly({ province: l.province, centreFeeMonthly: (l.baseFeeCents ?? 0) / 100, inProgram: l.inProgram });
          return (
            <article className="card" key={l.locationId}>
              <div>
                <h3><Link href={`/centres/${l.locationId}`}>{l.name}</Link></h3>
                <div className="meta">{l.city}, {l.province}{l.directory ? (l.address ? ` · ${l.address}` : '') : l.hours ? ` · ${l.hours}` : ''}</div>
              </div>
              <div className="chips">
                {l.directory ? (
                  <span className="chip">{l.programType ?? 'Licensed centre'}</span>
                ) : (
                  <>
                    {l.inProgram ? <span className="chip program">{getProvince(l.province)?.programName ?? 'Reduced-fee program'}</span> : <span className="chip">Market fees</span>}
                    {fee && <span className="chip">From {dollars(fee.amount)}/mo</span>}
                  </>
                )}
              </div>
              {l.directory ? (
                <p className="small">Licensed in Ontario, not on NidHub yet. Open it for the centre&apos;s details and directions, and to register your interest.</p>
              ) : (
                <div className="rooms">
                  <span className="h">Age group</span><span className="h">Spaces</span><span className="h">Waiting</span>
                  {l.rooms.map((r) => {
                    const s = spaces(r.open);
                    return [
                      <span key={r.resourceId + 'n'}>{r.ageGroup ? AGE_GROUPS[r.ageGroup].label : r.name}</span>,
                      <span key={r.resourceId + 's'} className={`pill ${s.cls}`}>{s.text}</span>,
                      <span key={r.resourceId + 'w'} className="num">{r.waiting}</span>,
                    ];
                  })}
                </div>
              )}
              <div className="foot">
                {l.directory ? (
                  <>
                    <span className="small">{l.interested > 0 ? `${l.interested} ${l.interested === 1 ? 'child' : 'children'} registered on NidHub` : 'Public registry listing'}</span>
                    <Link className="btn small primary" href={`/centres/${l.locationId}`}>View centre</Link>
                  </>
                ) : (
                  <>
                    <span className="small">Updated by centre {relTime(l.updatedAt)}</span>
                    {user?.role === 'family' && kids.length > 0 ? (
                      <form action={joinWaitlist} className="join">
                        <input type="hidden" name="back" value={back} />
                        <select name="resourceId" aria-label="Room" defaultValue={l.rooms[0].resourceId}>
                          {l.rooms.map((r) => <option key={r.resourceId} value={r.resourceId}>{r.ageGroup ? AGE_GROUPS[r.ageGroup].label : r.name}</option>)}
                        </select>
                        <select name="dependantId" aria-label="Child">
                          {kids.map((k) => <option key={k.id} value={k.id}>{k.name.split(' ')[0]}</option>)}
                        </select>
                        <button className="btn primary small" type="submit">Join waitlist</button>
                      </form>
                    ) : (
                      <Link className="btn small" href={`/login?next=${encodeURIComponent(back)}`}>Sign in to join</Link>
                    )}
                  </>
                )}
              </div>
            </article>
          );
        })}
      </div>

      {pages > 1 && pageNo <= pages && (
        <nav className="pager" aria-label="Result pages">
          {pageNo > 1 ? <Link className="btn" href={pageHref(pageNo - 1)}>← Previous</Link> : <span />}
          <span className="small">Page {pageNo.toLocaleString()} of {pages.toLocaleString()}</span>
          {pageNo < pages ? <Link className="btn" href={pageHref(pageNo + 1)}>Next →</Link> : <span />}
        </nav>
      )}
    </div>
  );
}
