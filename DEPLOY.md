# Deploying NidHub (Vercel + Neon, free)

A public URL you can share. Vercel hosts the Next.js app; Neon is the Postgres database.
No real personal data is involved (public registry + invented demo families), so the free
tiers are fine for a demo. For a real pilot, host in a Canadian region and add real auth first.

You do the two account logins (Neon, Vercel). Everything else is copy-paste.

---

## 1. Create the database (Neon)

1. Sign up at **https://neon.tech** (free) and create a project. Only **Postgres database**
   needs to be on; leave storage, functions, AI gateway, realtime and auth off.
2. On the project dashboard click **Connect**, turn **off Connection pooling**, and copy the string.
   NidHub uses database transactions, which need the direct (session) connection — the host must
   **not** contain `-pooler`. Copy it exactly as Neon shows it, `channel_binding=require` included;
   the app drops that libpq-only setting itself. It looks like:
   ```
   postgresql://USER:PASSWORD@ep-xxxx.REGION.aws.neon.tech/neondb?sslmode=require&channel_binding=require
   ```

## 2. The data loads itself

There is nothing to run on your PC. Vercel's build (`vercel-build` in `package.json`) creates the
tables, loads the demo accounts and imports the ~6,355 Ontario centres before building the app.
Each step skips itself once its data is there, so later deploys leave the database as it is.
If `DATABASE_URL` isn't set in Vercel, the build stops with a message saying so.

<details><summary>Optional: load or inspect the data from your PC</summary>

Only if your network can reach Neon (some home routers refuse Neon's addresses):

```bash
node scripts/set-database-url.mjs
node scripts/check-db.mjs
npm run db:migrate
npm run db:seed
npm run db:import-ontario
```

The first saves your string into `.env` without showing it; the second confirms the connection.
Note that while `.env` has a `DATABASE_URL`, your local app uses Neon too.
</details>

## 3. Deploy the app (Vercel, from GitHub)

The code lives at **github.com/Usharabiotech/daycare**. Vercel builds it from there.

1. Go to **https://vercel.com/new** and sign in with GitHub.
2. Under **Import Git Repository**, pick **Usharabiotech/daycare**.
   If it isn't listed, click **Adjust GitHub App Permissions** and give Vercel access to the
   Usharabiotech organisation (or just this repo).
3. Framework preset: **Next.js** (detected automatically). Leave the build settings as they are.
4. Open **Environment Variables** and add:
   - Name: `DATABASE_URL`
   - Value: the **Neon direct string** from step 1
5. Click **Deploy**. The first build takes a few minutes because it also loads the data.
   Vercel then gives you a live URL (e.g. `https://daycare-xxxx.vercel.app`). That's the link to send.

From then on, every push to `main` redeploys automatically.

<details><summary>Alternative: deploy from your PC with the Vercel CLI</summary>

```bash
npm i -g vercel
vercel login
vercel
vercel env add DATABASE_URL production
vercel --prod
```
</details>

## 4. Share with your brother

Open the URL → **Sign in** → pick a demo account:
- **Priya Sharma (family)** — four waitlists and an open offer to accept.
- **Director, Maple Early Learning Group** — the two-centre ERP (dashboard, waitlist, attendance, billing, ratios).

Browse **Find care** to see the 6,362 real + demo centres, filter by city, and try **Fees & subsidy**.

---

## Updating it later

- Change code → commit and push to `main`; Vercel redeploys on its own.
- Refresh next month's Ontario data → replace `data/ontario/active_facilities.json`, then run
  `npm run db:import-ontario -- --reset-ontario` from a machine that can reach Neon.

## Notes

- Locally (no `DATABASE_URL` in `.env`), NidHub uses the zero-setup PGlite database — nothing changes for dev.
- `DB_POOL_MAX` defaults to 1, which is correct for serverless. Leave it unless you hit limits.
- The `/api/cron/expire-offers` endpoint expects `Authorization: Bearer <CRON_SECRET>`; set a
  `CRON_SECRET` env var (and a Vercel Cron) if you want offers to auto-expire. Not needed for a demo.
