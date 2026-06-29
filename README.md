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

## Build phases

1. **Auth + permissions + Admin page** ✅ (this phase)
2. Intake + display — _next_
3. Matching + overlap / unique views
4. Edit engine + audit + undercut guard
5. SKU configurator
6. Branded PDF export

Each phase ships working before the next starts.

## What's built now (Phase 1)

- Supabase email/password auth; middleware-guarded routes.
- The full database schema (`supabase/migrations/`): tables, RLS, the
  `has_capability()` resolver, the `v_overlap` / `v_unique` views, and the
  capability/role seed.
- The **capability system** — every gate resolves through `has_capability()`
  (invariant 5). Per-person grant beats role default.
- The **Admin page** — create/deactivate users, set roles, and grant/retract
  individual capabilities per person. Server actions re-check capability
  server-side; RLS enforces it at the database boundary too.
- App shell with the §8 screen roadmap (later screens shown as locked).

### Invariants honored

- **Cost is private & isolated.** `product_costs` is a separate table, readable
  only with `view_cost` (RLS). No non-`view_cost` path can read it.
- **Capabilities resolve through `has_capability()`** — UI and server both use
  it; the Admin page is the single source of truth.
- The audit (`price_edits`), read-only competitor data, never-silent matching,
  and the undercut guard are wired into the schema/RLS now; their UIs land in
  phases 3–4.

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

## Deploy (Render)

`render.yaml` defines a Docker web service (persistent container). Set the four
env vars in the Render dashboard. The container stays warm so the phase-6
Playwright PDF path won't hit a serverless timeout — do **not** deploy the PDF
path to Vercel serverless (brief §10).
