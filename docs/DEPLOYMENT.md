# Deployment — Render + Supabase (Option A)

The whole app runs as **one always-on Next.js container on Render**, talking to
**Supabase** for the database, auth, and file storage. The container is
persistent (not serverless) because the branded-PDF export launches headless
Chromium via Playwright, which needs a real, long-lived browser.

```
Render (Next.js app, Docker, always-on)  ──►  Supabase (Postgres + Auth + Storage + Realtime)
```

Everything needed is already in the repo: `Dockerfile`, `render.yaml`,
`next.config.mjs` (standalone output), and the SQL in `supabase/migrations/`.

---

## 1. Supabase (the data backend)

1. **Create a project** at <https://supabase.com> → New project.
   - Pick a region close to your users (for India, **Mumbai / ap-south-1**).
   - Save the database password somewhere safe.

2. **Copy your keys** — Project → Settings → API:
   - `Project URL`            → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon` `public` key      → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` key       → `SUPABASE_SERVICE_ROLE_KEY` (**secret — server only**)

3. **Run the migrations, in order** (`0001` → `0016`). Either:

   **Option 1 — Supabase CLI (recommended, reproducible):**
   ```bash
   npm i -g supabase
   supabase login
   supabase link --project-ref <your-project-ref>
   supabase db push        # applies everything in supabase/migrations in order
   ```

   **Option 2 — SQL editor (no CLI):** open Project → SQL Editor, then paste and
   **Run each file one at a time, in numeric order** `0001_…` through `0016_…`.
   Run them individually (not all at once) so ordering and the enum change in
   `0013` apply cleanly.

   This creates every table, RLS policy, function, the three storage buckets
   (`intake-archives`, `signatures`, `documents`), and the Realtime publication.
   No manual bucket or policy setup is needed.

4. **Auth settings** — Project → Authentication → Providers / URL Configuration:
   - **Email** provider is enabled by default. Self sign-up creates a **read-only
     viewer** automatically (a DB trigger sets the role — the client can't choose).
   - Decide on **"Confirm email"**: ON = new users must click an email link before
     signing in (the sign-up form shows a "check your email" notice); OFF = they
     sign in immediately. Either works.
   - Set **Site URL** and add a **Redirect URL** once you have the Render URL
     (step 3 of the Render section) — e.g. `https://maaef-pricing.onrender.com`.

---

## 2. Render (the app)

1. Push this repo to GitHub (the current default branch is
   `claude/system-build-pa0cgb` — Render will deploy whatever branch you point it at).

2. In Render: **New → Blueprint**, connect the repo. Render reads `render.yaml`
   and proposes the `maaef-pricing` Docker web service (plan: `starter`).

3. **Set the environment variables** (Render marks them `sync: false`, so you
   enter them by hand):

   | Key | Value |
   |-----|-------|
   | `NEXT_PUBLIC_SUPABASE_URL` | your Supabase Project URL |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | your Supabase anon key |
   | `SUPABASE_SERVICE_ROLE_KEY` | your Supabase service_role key (secret) |
   | `NEXT_PUBLIC_APP_URL` | the Render URL (fill in after first deploy) |

   > The two `NEXT_PUBLIC_*` values are needed **at build time** — the Dockerfile
   > declares matching `ARG`s and Render passes env vars into the Docker build,
   > so Next.js can inline them into the browser bundle. The `service_role` key
   > is runtime-only and never reaches the browser.

4. **Create / deploy.** The Docker build runs `next build` and
   `playwright install --with-deps chromium` (so the PDF path works). First build
   takes a few minutes. Health check is `GET /login`.

5. Once live, copy the `…onrender.com` URL and:
   - set it as `NEXT_PUBLIC_APP_URL`,
   - add it as the **Site URL / Redirect URL** in Supabase Auth (step 4 above).

`autoDeploy` is on, so every push to the connected branch redeploys.

---

## 3. First admin (bootstrap)

Sign-up always creates a **viewer**, so promote your own account once:

1. Open the deployed app and **Sign up** with your email.
2. In Supabase → SQL Editor, run:
   ```sql
   update profiles set role = 'admin', active = true
   where email = 'you@maaef.com';
   ```
3. Reload the app — you now see **Admin**, **Action Logs**, and everything else.
   From Admin you can create the rest of the team (that flow uses the
   `service_role` key) and grant per-person capabilities.

---

## 4. Smoke test after deploy

- **Sign in** works; a fresh sign-up lands read-only.
- **Price Lists → import** your unified spreadsheet; SKUs appear on **My Products**.
- **Download PDF** on My Products returns a branded A5 file (confirms Playwright/
  Chromium is working in the container).
- **Documents** → upload and download a file (confirms the `documents` bucket).
- Open the app in **two tabs**, change data in one → the other shows the
  "Data was updated — Refresh" banner (confirms Realtime).

---

## Notes & gotchas

- **Why not Vercel?** The PDF export needs headless Chromium in a persistent
  container. Vercel's serverless functions can't run full Playwright, which is
  why this app targets Render. (Moving to Vercel would require rewriting
  `src/lib/pdf/render.ts` to `puppeteer-core` + `@sparticuz/chromium`.)
- **Cost floor & keys.** `SUPABASE_SERVICE_ROLE_KEY` bypasses RLS — keep it only
  in Render's env, never in client code or the repo.
- **Backups.** Supabase handles Postgres backups per your plan; the versioned
  price lists (locked originals + restore) are an app-level safety net on top.
- **Scaling.** One `starter` container is fine to begin with. If PDF exports for
  very large lists get heavy, bump the Render plan rather than splitting services.
