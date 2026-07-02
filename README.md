# Maaef Competitive Pricing Dashboard

A price-positioning dashboard for Maaef. It answers one question continuously:
**where do I overlap with competitors (so I can undercut), and where am I unique
(so I can charge a premium)?**

Your own price list is the protagonist — the only list that gets edited,
configured, saved, and exported. Competitor lists are reference data. A private
cost floor (visible only to permitted users) guards every undercut.

Built against `Maaef_Pricing_Dashboard_Build_Brief.md` (v1.0). That brief is the
source of truth.

## Stack (locked, brief §2)

| Layer | Choice |
|---|---|
| Framework | Next.js (App Router) + TypeScript |
| Styling | Tailwind + shadcn/ui |
| Tables/grid | AG Grid Community *(phase 2+)* |
| DB / Auth / Storage | Supabase (Postgres) |
| Spreadsheet parsing | SheetJS *(phase 2)* |
| PDF | Playwright, HTML→PDF *(phase 6)* |
| Hosting | Single persistent container on **Render** |

## Build phases — all shipped ✅

1. **Auth + permissions + Admin page**
2. **Intake + display**
3. **Matching + overlap / unique views**
4. **Edit engine + audit + undercut guard**
5. **SKU configurator**
6. **Branded PDF export**

## What's built

- **Auth + permissions** — Supabase email/password, middleware-guarded routes;
  every gate resolves through `has_capability()` (invariant 5, per-person grant
  beats role default); **Admin page** for users / roles / per-person grants.
- **Intake + display** — SheetJS parsing of the two standardized templates
  (validated, never guessed), originals archived to Storage, lists directory,
  read-only competitor grids, and the editable my-list AG Grid with the cost
  column gated.
- **Unified inventory import** — the wide, pre-matched Maaef format (one row per
  product with your rate + each competitor's rate side by side, e.g.
  Maaef/Smas/Chandra). One upload creates your products, each competitor's list,
  and confirms the same-row overlaps in a single pass. Handles Hindi/Devanagari
  (Unicode-safe keys) and synthesizes stable SKUs where the sheet has none.
  Competitor-only rows surface in the **Market gap** screen ("they sell, you
  don't").
- **Matching + views** — deterministic matcher (spec-key → token-set fuzzy);
  match-review screen (the only place `confirmed` is set); the undercut radar
  (`v_overlap`) and pricing-power (`v_unique`) screens.
- **Edit engine** — single/category/list × percentage/flat/set; preview-then-
  apply; audit trail (`price_edits`); **undercut guard** enforced inside the DB;
  undo (single + batch); Edit-history screen.
- **Configurator** — SKU detail, spec add-on toggles, live price, guarded save.
- **PDF export** — Playwright-rendered branded A5 list, gated by `export_pdf`.

### Invariants honored

- **Cost is private & isolated.** `product_costs` is RLS-locked to `view_cost`.
  The undercut guard runs inside the DB (`mutate_prices` / `save_configuration`)
  so the floor is enforced for non-`view_cost` users **without the cost number
  ever leaving the database**. No screen, query, export, or API response
  reachable without `view_cost` contains cost. The PDF never includes it.
- **Matching is never silent** — only `confirmed` matches feed the overlap view.
- **Competitor data is read-only** — insert-only, no edit path.
- **Every price change is logged & reversible** — `price_edits` + undo.
- **Capabilities resolve through `has_capability()`** — UI and server both;
  Admin page is the single source of truth.

## Local setup

```bash
npm install
cp .env.example .env.local   # fill in your Supabase keys
```

### Database

Apply the migrations in `supabase/migrations/` in order against your Supabase
project (via the Supabase CLI `supabase db push`, or paste each file into the
SQL editor in numeric order):

1. `0001_schema.sql` — tables, functions, views, triggers
2. `0002_rls.sql` — row-level security policies
3. `0003_seed_permissions.sql` — capability catalogue + role baselines

### Bootstrap the first admin

New auth users default to the `viewer` role (DB trigger). To create your first
admin, promote a user once in the SQL editor:

```sql
update profiles set role = 'admin' where email = 'you@maaef.com';
```

After that, manage everyone else from the Admin page. Creating users from the
Admin page requires `SUPABASE_SERVICE_ROLE_KEY` to be set.

```bash
npm run dev          # http://localhost:3000
npm run typecheck    # strict TS, no emit
npm run build        # production build (standalone)
```

### PDF export (Playwright)

The branded A5 export uses Playwright + Chromium. For local dev, install the
browser once:

```bash
npx playwright install chromium
```

The Render image installs it during the Docker build. If Chromium is
pre-provisioned at a fixed path, point `CHROMIUM_EXECUTABLE_PATH` at it instead.

## Deploy (Render)

`render.yaml` defines a Docker web service (persistent container). Set the four
env vars in the Render dashboard. The container stays warm so the phase-6
Playwright PDF path won't hit a serverless timeout — do **not** deploy the PDF
path to Vercel serverless (brief §10).
