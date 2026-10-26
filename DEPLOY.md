# Deploying NidHub (Vercel + Neon, free)

A public URL you can share. Vercel hosts the Next.js app; Neon is the Postgres database.
No real personal data is involved (public registry + invented demo families), so the free
tiers are fine for a demo. For a real pilot, host in a Canadian region and add real auth first.

You do the two account logins (Neon, Vercel). Everything else is copy‑paste.

---

## 1. Create the database (Neon)

1. Sign up at **https://neon.tech** (free) and create a project.
2. In the project, open **Connection Details** and copy the connection string.
   **Use the DIRECT connection** — if you see a toggle or a host with `-pooler`, pick the one
   **without** `-pooler`. NidHub uses database transactions, which need a direct (session) connection.
   It looks like:
   ```
   postgresql://USER:PASSWORD@ep-xxxx.REGION.aws.neon.tech/neondb?sslmode=require
   ```

## 2. Load the data into Neon (run once, locally)

From the project folder (`R:\Code\DayCare\extracted\openslot`):

1. Create a file named `.env` with your Neon string (it's git‑ignored):
   ```
   DATABASE_URL=postgresql://USER:PASSWORD@ep-xxxx.REGION.aws.neon.tech/neondb?sslmode=require
   ```
2. Create the tables, load the demo data, and import the real Ontario centres:
   ```bash
   npm run db:migrate
   npm run db:seed
   npm run db:import-ontario
   ```
   The Ontario import (~6,355 centres) runs over the network, so give it a minute.

## 3. Deploy the app (Vercel)

1. Install the CLI and sign in (opens your browser):
   ```bash
   npm i -g vercel
   vercel login
   ```
2. From the project folder, link + create the project (accept the defaults — Vercel detects Next.js):
   ```bash
   vercel
   ```
3. Give Vercel the same database URL for production:
   ```bash
   vercel env add DATABASE_URL production
   ```
   Paste the **same Neon direct string** when prompted.
4. Ship it:
   ```bash
   vercel --prod
   ```
   Vercel prints your live URL (e.g. `https://nidhub-xxxx.vercel.app`). That's the link to send.

## 4. Share with your brother

Open the URL → **Sign in** → pick a demo account:
- **Priya Sharma (family)** — four waitlists and an open offer to accept.
- **Director, Maple Early Learning Group** — the two‑centre ERP (dashboard, waitlist, attendance, billing, ratios).

Browse **Find care** to see the 6,362 real + demo centres, filter by city, and try **Fees & subsidy**.

---

## Updating it later

- Change code → `vercel --prod` again.
- Refresh next month's Ontario data → re-run step 2 with `npm run db:import-ontario -- --reset-ontario`.

## Notes

- Locally (no `.env`), NidHub still uses the zero‑setup PGlite database — nothing changes for dev.
- `DB_POOL_MAX` defaults to 1, which is correct for serverless. Leave it unless you hit limits.
- The `/api/cron/expire-offers` endpoint expects `Authorization: Bearer <CRON_SECRET>`; set a
  `CRON_SECRET` env var (and a Vercel Cron) if you want offers to auto‑expire. Not needed for a demo.
