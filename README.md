# NidHub

Live childcare availability for families and a small ERP for the centres that publish it.
Built on a vertical-agnostic booking core so clinics, hospitals and venues can be added later.

**Families** search licensed centres by city and age group, see open spaces and waitlist
sizes, join waitlists, track their position and estimated wait, accept or decline offers,
and estimate their fees and subsidy.

**Centres** see occupancy by room, run their waitlist and send offers, take attendance,
split monthly fees between parent / subsidy / program funding and create draft invoices,
and check staff-to-child ratios. Every offer and enrolment updates the public listing
automatically.

> All centres, families and children in the seed data are invented.

---

## Quick start (no database server needed)

Requires Node.js 20+.

```bash
npm install
npm run setup        # creates tables and loads sample data into ./.data/pglite
npm run dev          # http://localhost:3000
```

Open **Sign in** and pick a demo account:

- **Priya Sharma (family)** — on four waitlists, with one open offer to accept
- **Director, Maple Early Learning Group** — runs two Toronto centres (one room is short-staffed)

Without `DATABASE_URL`, the app uses [PGlite](https://pglite.dev) (Postgres compiled to WASM)
stored in `./.data/pglite`. It allows one process at a time, so stop `npm run dev` before
running `npm run db:seed` again. Reseed from scratch with `npm run db:seed -- --reset`.

## Using real PostgreSQL

```bash
docker compose up -d
cp .env.example .env
# set DATABASE_URL=postgres://openslot:openslot@localhost:5432/openslot
npm run setup
npm run dev
```

Production must use PostgreSQL. Host it in a Canadian region (see the checklist below).

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Development server |
| `npm run build` / `npm start` | Production build and server |
| `npm run setup` | Migrate + seed |
| `npm run db:generate` | Create a new SQL migration after changing `src/db/schema.ts` |
| `npm run db:migrate` | Apply migrations |
| `npm run db:seed` | Load sample data (`-- --reset` to wipe first) |
| `npm run db:import-ontario` | Load real Ontario centres as directory listings (`-- --reset-ontario` to replace) |
| `npm test` | Unit tests + an end-to-end offer/accept test against in-memory Postgres |
| `npm run typecheck` | TypeScript check |

## Project layout

```
src/
  db/
    schema.ts         Tables (Drizzle ORM). The generic booking core.
    client.ts         Postgres (DATABASE_URL) or embedded PGlite
    migrate.ts, seed.ts
  domain/             Pure logic, no database — safe to share with a mobile app
    types.ts          Age groups, queue flags, DomainError
    queue.ts          Admission order, wait estimate, offer hold time
    rules/provinces.ts  Fees, ratios and subsidy rules per province
  services/           Business operations used by both the web UI and the API
    listings.ts       Public search and availability
    queue.ts          Join, offer, accept, decline, withdraw, expire
    centre.ts         Dashboard, attendance, ratios, billing, invoices
    capacity.ts       Occupancy counts and publishing to the listing
    auth.ts           Demo sign-in (replace before a pilot)
  app/                Next.js App Router
    page.tsx          Find care
    waitlists/        Family's waitlists and offers
    subsidy/          Fee & subsidy estimator
    centre/[locationId]/  ERP: dashboard, waitlist, attendance, billing, staff
    actions.ts        Server actions behind the web forms
    api/v1/           REST API for the mobile app and centre website widgets
drizzle/              SQL migrations
tests/
```

## Data model

```
Organization ─┬─ Location (vertical, province, licence, base fee, funding programs)
              │     └─ Resource (room / practitioner / court; capacity; attrs e.g. ageGroup;
              │                  publishedOpen + publishedAt = what the public sees)
              └─ User (centre_admin)

Customer (parent) ── Dependant (child) ── User (family)

QueueEntry   resource × dependant; status waiting → offered → accepted | declined | expired | withdrawn
Booking      the enrolment; active | ended; approved subsidy per month
Attendance   one row per booking per day
Staff        assigned to a resource; on/off shift
Invoice      per booking per month, split into parent / subsidy / program shares
```

Key rules live in code, not the database:

- **Admission order**: staff children, then siblings, then application date (`domain/queue.ts`).
- **Offers** hold a space for 48 hours. `GET /api/cron/expire-offers` releases unanswered ones.
- **Accepting** an offer creates the enrolment and withdraws the child's other waitlist entries,
  so every centre's list shrinks to real demand.
- **Open spaces** = capacity − active enrolments − open offers.
- **Wait estimate** = position × share of families who will really take the space ÷ spaces opening
  per month. The share starts at 0.4 — calibrate it from real offer outcomes.

## Real centre data (Ontario)

Alongside the invented demo centres, you can load every **licensed childcare centre in Ontario**
from the province's open data — about **6,350 active centres under 2,600 licensees**:

```bash
# 1. Download the latest monthly file from the Ontario Data Catalogue (XLSX) into data/ontario/
# 2. Turn it into the importer's JSON (keeps only active facilities):
python scripts/extract_ontario.py data/ontario/<file>.xlsx data/ontario/active_facilities.json
# 3. Load it:
npm run db:import-ontario            # add -- --reset-ontario to replace a previous import
```

These load as **directory listings** (`attrs.directory = true`): a centre shows in search with its
real name, address, licence and program type, but **no live spaces or waitlists** — the open data
doesn't contain capacity or availability, and that is each centre's own private data. A centre only
gets live availability, offers and the ERP once a real operator claims and publishes it. The demo
seed centres (with rooms, families and offers) are separate and untouched by the import.

Every centre has a public page at `/centres/<id>` (linked from search) with its registry facts and
Google Maps links. On a directory centre, a signed-in family can **register interest** per child
(`interests` table) — shown on My waitlists, counted on the page, and never mixed into real waitlists
or offers. Owners can ask to **claim** a listing (`centre_claims`, status `pending`); there is no
admin screen yet, so review requests in the database and call the centre to verify:

```sql
SELECT c.created_at, l.name AS centre, l.licence_no, c.name, c.role, c.email, c.phone, c.note
FROM centre_claims c JOIN locations l ON l.id = c.location_id
WHERE c.status = 'pending' ORDER BY c.created_at;
```

Because interests and claims point at directory rows, `db:import-ontario -- --reset-ontario` refuses
to run once any exist; a refresh that updates centres in place by licence number is the next step.

- **Source**: [Licensed child care facilities in Ontario](https://data.ontario.ca/dataset/licensed-child-care-facilities-in-ontario), Ontario Data Catalogue. Updated monthly.
- **Licence**: Open Government Licence – Ontario. Contains information licensed under the Open Government Licence – Ontario.
- Other provinces each publish their own dataset in a different format — add one importer per province under `src/db/`. New Brunswick includes spaces by age group and coordinates; BC's set is partial.

## REST API (v1)

Auth today is the demo cookie `openslot_uid`. Swap for bearer tokens when real auth lands.

| Method | Path | Who | Purpose |
|---|---|---|---|
| GET | `/api/v1/listings?city=&age=&open=1&program=1` | public | Search centres |
| GET | `/api/v1/locations/:id/availability` | public, CORS | Widget for a centre's own website |
| GET | `/api/v1/me/waitlists` | family | Positions, estimates, offers |
| POST | `/api/v1/queue` | family | `{ resourceId, dependantId, desiredStart?, sibling? }` |
| POST | `/api/v1/queue/:id/offer` | centre | Offer a space |
| POST | `/api/v1/queue/:id/accept` | family / centre | Accept an offer |
| POST | `/api/v1/queue/:id/decline` | family | Decline |
| POST | `/api/v1/queue/:id/withdraw` | family | Leave the list |
| POST | `/api/v1/attendance` | centre | `{ bookingId }` toggles check-in/out |
| POST | `/api/v1/subsidy/estimate` | public | Fee + subsidy estimate |
| GET | `/api/cron/expire-offers` | scheduler | `Authorization: Bearer $CRON_SECRET` |

Responses are `{ "data": ... }` or `{ "error": "message" }` with a matching HTTP status.

## Mobile app (next phase)

Build with React Native / Expo against `/api/v1`. Import `src/domain/*` directly (it has no
server dependencies) so wait estimates and fee rules match the web app exactly. Add push
notifications for new offers — offers expire in 48 hours, so families need to know quickly.

## Adding a new vertical (clinics, hospitals, venues)

1. Use the existing `vertical` enum value (`clinic`, `hospital`, `venue`).
2. Resources become practitioners, departments or courts. Put vertical-specific fields in `attrs`.
3. Seat-based capacity (childcare) uses `Booking` with no end date. Time-slot verticals need a
   `slots` table (resource, start, end, status) — add it alongside, not instead of, bookings.
4. Queues work as they are: a walk-in clinic queue is a `QueueEntry` list with offers that
   expire in minutes instead of hours (make `OFFER_HOLD_HOURS` per vertical).
5. Add a rule pack under `src/domain/rules/` (eligibility, e.g. provincial health card).
6. Add routes under `src/app/<vertical>/`. Keep services generic where possible.

Hospitals need a privacy review first (PHIPA in Ontario and equivalents elsewhere).

## Before a real pilot

- [ ] **Real authentication** (Auth.js, Clerk or Cognito). Keep `services/auth.ts` signatures.
- [ ] **Verify every province rule** in `src/domain/rules/provinces.ts` against current regulation.
      Fees and subsidy thresholds change yearly; ratios here are simplified to one per age group.
- [ ] **Privacy**: PIPEDA plus provincial law; host and back up data in Canada; collect the minimum
      about children; consent records; data export and deletion for families.
- [ ] **Notifications**: email/SMS for offers and expiries (e.g. Postmark, Twilio).
- [ ] **Scheduler** calling `/api/cron/expire-offers` every 15 minutes.
- [ ] **Payments** (Stripe or Moneris) on top of draft invoices.
- [ ] **Per-centre admission policies** and configurable room age ranges.
- [ ] **Time zones**: attendance "today" currently uses the server clock; use each location's zone.
- [ ] **Imports**: CSV import of existing waitlists and rosters from centres' current software.
- [ ] Rate limiting on public endpoints; audit log of who changed what.

## Research sources (October 2026)

- Ontario waitlists growing: https://www.cp24.com/politics/queens-park/2026/09/15/four-years-into-10day-program-child-care-waitlists-growing-in-some-ontario-cities/
- Fees by province (CCPA): https://www.policyalternatives.ca/?p=88240
- Alberta Affordability Grant: https://www.alberta.ca/affordability-grant
- BC Affordable Child Care Benefit: https://www2.gov.bc.ca/gov/content/family-social-supports/caring-for-young-children/childcarebc-programs/child-care-benefit/information-for-families/eligibility-estimate-funding
- Quebec single window replacement: https://www.noovo.info/nouvelle/remplacement-de-la-place-0-5-quebec-mise-sur-de-veritables-listes-dattente.html
