# Maaef Competitive Pricing Dashboard — Project Overview (LLM handoff)

This document is a complete, self-contained description of the system: its purpose,
architecture, data model, features, and how each was built. It is written to bring
another engineer or LLM fully up to speed without reading the whole codebase.

---

## 1. What it is / why it exists

A **competitive price-positioning dashboard** for Maaef, a company that sells
print/stationery products (government forms, registers, ledgers, etc.) at
client-facing prices. Competitors (in the real data: **SMAS** and **Chandra**) sell
overlapping products.

The tool answers one question continuously: **where do I overlap with competitors
(so I can undercut) and where am I unique (so I can charge a premium)?** A private
**cost floor** (visible only to permitted users) guards every price change so the
user never prices below profitability.

It is **not** a sourcing/vendor tool, not a bill-of-materials cost engine, and not a
general spreadsheet. Maaef's own list is the protagonist — the only list that gets
edited, versioned, and exported. Competitor lists are read-only reference data.

The build was driven by a locked spec (`docs/Maaef_Pricing_Dashboard_Build_Brief.md`)
plus later iterative requirements from the owner.

---

## 2. Tech stack (locked)

| Layer | Choice |
|---|---|
| Framework | **Next.js 15 (App Router) + TypeScript**, React 19, Server Components + Server Actions |
| Styling | **Tailwind CSS v3 + shadcn/ui** (hand-written primitives), Maaef brand palette |
| Data grid | **AG Grid Community v36** (Theming API; note: row grouping is Enterprise-only, so grouping is done manually — see §7.3) |
| DB / Auth / Storage | **Supabase (Postgres)** — auth, Row-Level Security, file storage |
| Spreadsheet parsing | **SheetJS (`xlsx`)** |
| PDF | **Playwright** (headless Chromium), HTML→PDF |
| Hosting | Single **persistent container on Render** (Dockerfile + render.yaml). NOT Vercel serverless (the Playwright path needs a warm container) |

**Brand palette:** Maaef Red `#8B0000` (primary), deep purple `#2B1B2E`, blush
`#F4E1E4`, near-black `#1A1A1A`.

Repo: `AlphaMaximus001/Maaef-PriceListTool`, working branch `claude/system-build-pa0cgb`.

---

## 3. Core domain glossary

- **My list / my products** — Maaef's own products + client-facing prices. The only editable list.
- **Price** — client-facing selling price (the number that appears on the PDF).
- **Cost** — PRIVATE per-product cost floor. Not a selling price. Readable only with the `view_cost` capability. Never shown to clients, in exports, or to Viewers.
- **Competitor list** — one competitor's prices; reference-only, never edited in-app.
- **Match** — a link between one Maaef product and one competitor item judged to be the same physical product. Only counts once a human confirms it (`confirmed = true`).
- **Overlap SKU** — a Maaef product with ≥1 confirmed competitor match (shown on the undercut radar).
- **Unique SKU** — a Maaef product with no confirmed match (shown on pricing power).
- **Market gap** — a competitor item with no confirmed match to any Maaef product ("they sell it, we don't").
- **Spec add-on** — a fixed price delta for a customization (e.g. lamination +₹120). Flat amounts only; never derived from cost.
- **Capability** — a gated action (e.g. `export_pdf`), granted by role default and overridable per person.
- **Price list / version** — the my-list is versioned. The imported list is a **locked Original**; edits are made on named **copies (versions)**.

---

## 4. Invariants (hard rules — never violate)

1. **Cost is private & isolated.** Cost lives in `product_costs`, never in `my_products`. Readable only via `view_cost` (enforced by RLS). No screen/query/export/API reachable without `view_cost` may contain cost, and a Viewer must not be able to infer it.
2. **Matching is never silent.** A proposed match affects nothing until a human sets `confirmed = true`.
3. **Competitor data is read-only.** Nothing edits `competitor_items`/`competitor_lists` after upload (insert-only; no UPDATE/DELETE policies).
4. **Every price change is logged and reversible.** All edits write `price_edits` (old, new, who, when, operation, scope). Undo + restore available.
5. **Capabilities resolve through `has_capability()`.** UI gating and server enforcement both use it; per-person override beats role default. Never gate on raw role checks in app code.
6. **The undercut guard fires before a save at/below floor.** With `view_cost`: warn + require explicit confirmation. Without `view_cost`: silently block, with a generic message that never reveals the cost number.
7. **Only standardized templates are accepted on intake.** Parse against a known column set; reject/flag files that don't match rather than guessing.
8. **(Added) The original list is immutable.** The imported list is locked forever; edits go to named versions. Every version state is restorable.

All of invariants 1–8 are enforced at the **database boundary** (RLS + SECURITY DEFINER functions), not just in the UI, and were verified with Postgres tests during the build.

---

## 5. Database (Supabase Postgres) — migrations in order

Migrations live in `supabase/migrations/`, applied in numeric order. Auth (`auth.users`,
`auth.uid()`), the `storage` schema, and the `anon`/`authenticated` roles are Supabase-provided.

### 0001_schema.sql — tables, functions, views
- **Identity/permissions:** `profiles` (id→auth.users, email, full_name, role enum admin/editor/viewer, active), `capabilities` (key, label, description), `role_defaults` (role, capability_key, granted), `capability_grants` (user_id, capability_key, granted — per-person override).
- **`has_capability(uid, cap)`** — SECURITY DEFINER resolver. Order: per-person override → role default → deny. Deactivated/unknown users hold nothing. Plus a `has_capability(cap)` wrapper on `auth.uid()`, and `is_admin(uid)`.
- **My list + cost:** `my_products` (id, sku, product_name, category, specs jsonb, spec_key, price, currency, config jsonb, active). `product_costs` (product_id→my_products, cost, currency) — the RLS-locked floor, one-to-one.
- **`spec_addons`** (name, applies_to category-or-null, price_delta, currency, active) — flat deltas for the configurator.
- **Competitor reference:** `competitors` (name unique), `competitor_lists` (competitor_id, name, source_file, uploaded_by, row_count), `competitor_items` (list_id, sku, product_name, category, specs, spec_key, price, currency).
- **`product_matches`** (my_product_id, competitor_item_id, confidence 0–1, method enum spec_key/fuzzy/manual, confirmed bool, confirmed_by/at, rejected). Unique (my_product_id, competitor_item_id).
- **`price_edits`** (product_id, old_price, new_price, operation enum percentage/flat/set, scope enum single/category/list/configurator, batch_id, actor, note, reverted, created_at) — the audit trail.
- **Views:** `v_overlap` (one row per Maaef product × confirmed competitor item, with gap and i_am_cheaper) and `v_unique` (Maaef products with no confirmed match). Both feed only from confirmed, non-rejected matches.
- **Triggers:** `updated_at`; `handle_new_user()` creates a `profiles` row (default role viewer) on `auth.users` insert.

### 0002_rls.sql — Row-Level Security + grants
- Enables RLS on all tables. The critical policy: `product_costs` SELECT/writes require `has_capability(auth.uid(),'view_cost')`.
- `my_products`: read by all authenticated; write requires `edit_price` or `bulk_edit`.
- Competitor tables: SELECT for all; INSERT requires `upload_competitor`; **no UPDATE/DELETE policies** (read-only).
- `product_matches`: write requires `confirm_match`.
- `price_edits`: insert/update require an edit capability; never deletable.
- `profiles`/`capability_grants`: managed by `has_capability('manage_users')` (not raw role, per invariant 5). Users may edit their own display name.
- Explicit `GRANT`s so RLS is portable (not reliant on Supabase defaults).

### 0003_seed_permissions.sql — capability catalogue + role baselines
Capabilities: `view_cost`, `edit_price`, `bulk_edit`, `upload_competitor`, `confirm_match`, `export_pdf`, `manage_users`.
- **Admin:** all true.
- **Editor:** edit_price, bulk_edit, upload_competitor, confirm_match, export_pdf. NOT view_cost, NOT manage_users.
- **Viewer:** all false (read-only). Grant export_pdf/view_cost per-person as needed.

### 0004_storage.sql — private `intake-archives` bucket + capability-gated policies (archives every uploaded original file).

### 0005_edit_engine.sql — `mutate_prices()` (later replaced by 0009)
Atomic price mutation in the DB so the undercut guard reads the cost floor without it leaving the DB. Original 7-arg signature.

### 0006_configurator.sql — `save_configuration()` + moves `spec_addons` management to `bulk_edit`. Configurator saves route through the same guard/audit.

### 0007_market_gap.sql — `v_market_gap` view (competitor items with no confirmed match to any Maaef product).

### 0008_versioned_lists.sql — **versioning** (major)
- `price_lists` (id, name, is_original, locked, created_from, created_by, archived[added in 0011]).
- `my_products.list_id` → price_lists; SKU unique per (list_id, sku) instead of global.
- `v_overlap`/`v_unique` recreated to expose `list_id` (pages filter by the selected version).
- `create_list_version(source, name)` — SECURITY DEFINER; deep-copies products + costs + matches into a new editable list.
- RLS: originals can never be renamed/unlocked.

### 0009_edit_engine_versioned.sql — replaces `mutate_prices` (8-arg, adds `p_list_id`) and `save_configuration`, both now **refuse locked/original lists** (`LIST_LOCKED`) and scope to a list.

### 0010_session_rpc.sql — `current_session()` returns `{profile, can:{...}}` as jsonb in one round trip (perf; see §8).

### 0011_restore.sql — **restore safety net**
- Adds `price_lists.archived`; extends `edit_scope` with `restore`.
- `restore_list(list, before)` — rolls every product in an unlocked list back to its price as of just before `before`, from the audit trail. The restore is itself logged (so it's undoable); superseded edits marked reverted. `before = -infinity` → reset to creation state.
- `archive_list(list)` — soft-deletes a version (never an original).

**Key SECURITY DEFINER functions:** `has_capability`, `is_admin`, `handle_new_user`, `mutate_prices`, `save_configuration`, `create_list_version`, `restore_list`, `archive_list`, `current_session`.

---

## 6. Application structure

```
src/
  middleware.ts                      # Supabase session refresh + route guard
  app/
    layout.tsx                       # root: TooltipProvider, Toaster
    login/                           # email/password auth (server action)
    (app)/                           # authenticated shell (sidebar nav, gated)
      layout.tsx                     # loads session, builds capability-gated nav
      dashboard/                     # access summary + roadmap
      lists/                         # directory (your list + competitor lists)
        page.tsx, upload-dialogs.tsx, actions.ts, list-actions.ts
        my/                          # the editable my-list screen
          page.tsx, my-grid.tsx, my-list-client.tsx,
          list-version-bar.tsx, edit-actions.ts
        competitor/[id]/            # read-only competitor grid
      overlap/                       # undercut radar (v_overlap, pivoted)
      unique/                        # pricing power (v_unique)
      market-gap/                    # they-sell-you-dont (v_market_gap)
      matches/                       # match review + matcher (actions.ts)
      configurator/                  # SKU add-on configurator (+ [id] detail)
      history/                       # edit history + undo/restore
      admin/                         # users, roles, per-person capabilities
    api/
      templates/[kind]/route.ts      # downloadable .xlsx templates
      export/[type]/[id]/route.ts    # Playwright PDF export
  lib/
    supabase/{server,client,middleware}.ts
    capabilities.ts                  # getSession/requireSession/requireCapability
    lists.ts                         # getLists/getCurrentList (cookie-based version)
    templates.ts                     # two-file template parsing + spec_key
    unified.ts                       # wide multi-brand inventory parsing
    match.ts                         # deterministic token-set-ratio scoring
    pdf/{template,render}.ts         # A5 HTML + Playwright render
    help.ts                          # central registry for all ⓘ info tooltips
    utils.ts                         # cn(), formatPrice()
  components/
    ui/                              # shadcn primitives (button, dialog, select, popover, ...)
    info-tip.tsx                     # the ⓘ button (reads lib/help.ts)
    data-grid.tsx                    # AG Grid wrapper (Maaef Quartz theme)
    capability-gate.tsx              # hide/disable-with-tooltip gating
    export-pdf-button.tsx
    app-shell/{sidebar-nav,user-menu}.tsx
supabase/migrations/*.sql
docs/Maaef_Pricing_Dashboard_Build_Brief.md   # the original spec
Dockerfile, render.yaml, .env.example
```

**Screens (sidebar):** Dashboard · Lists · Undercut radar · Pricing power · Market gap · Match review · Configurator · Edit history · Admin (gated by `manage_users`).

---

## 7. Features — what they do and how

### 7.1 Auth + permissions (Phase 1)
- Supabase email/password; `middleware.ts` refreshes the session cookie and redirects unauthenticated users to `/login`.
- `getSession()` (React.cache'd) calls the `current_session()` RPC → `{ profile, can:{capability→bool} }`. Every gate reads `session.can[...]`; server actions call `requireCapability(cap)` (re-checked in the DB too).
- **Admin page** (`manage_users`): create users (needs `SUPABASE_SERVICE_ROLE_KEY` for the auth admin API), deactivate, set role, and a tri-state (Allow / Default / Deny) capability matrix per person writing `capability_grants`.
- New users default to `viewer`. Bootstrap the first admin with SQL: `update profiles set role='admin' where email='…';`.

### 7.2 Intake + display (Phase 2) + Unified import
Two intake modes:
- **Two-file templates** (`lib/templates.ts`): a Maaef-products file and a competitor file, each validated against a known column set (unknown/missing columns rejected, never guessed). Downloadable via `/api/templates/[kind]`.
- **Unified inventory import** (`lib/unified.ts`) — the primary path for the real data. The real file is one **wide sheet**: `Category | SI_No. | Description/Name | Form_No. | Pages/Leaves | Maaef Rate | Smas Rate | Chandra Rate | Unit`. One row = one product with every brand's price side by side. One upload:
  - Creates a locked **Original** `price_lists` row.
  - Inserts Maaef-priced rows into `my_products` (synthesized SKUs — see below), Pages/Unit/Form_No folded into `specs`.
  - Creates one competitor list + items per competitor brand.
  - Links same-row overlaps as **confirmed** matches (the row alignment IS the human judgment), so the undercut radar populates immediately.
  - Competitor-only rows (blank Maaef rate) become Market-gap entries.
  - Blank rate = "not offered" (never ₹0).
- **Synthesized SKUs:** the source has no SKU column. Format `MAAEF-C<categoryNumber>-<serial>` (e.g. `MAAEF-C6-2`), where the category number comes from the workbook's `Categories`/`Summary` tab; deterministic + stable across re-imports; unique.
- **Unicode:** categories/names include Hindi/Devanagari. Key/token normalization keeps `\p{L}\p{N}\p{M}` (a plain `[a-z0-9]` filter previously emptied Hindi rows — fixed).
- **Storage:** every uploaded original is archived to the private `intake-archives` bucket.

### 7.3 The my-list grid
`components/data-grid.tsx` wraps AG Grid Community with a Maaef-tinted Quartz theme.
**Row grouping is Enterprise-only in AG Grid**, so category grouping is done manually: rows are sorted by category and full-width "category header" rows are injected (Community supports full-width rows). A "Show category" dropdown filters/jumps to a category. Cost column renders only for `view_cost` users.

### 7.4 Matching + the two views (Phase 3)
- `lib/match.ts` — deterministic scoring: exact `spec_key` pass, then a fuzzywuzzy-style **token-set ratio** (Levenshtein-based) on product names within the same category, threshold 0.6, top 5 per product. No LLM, no embeddings.
- **Match review** (`matches/`) — the only place `confirmed` is set. Run matcher (proposes only), confirm/reject, retract confirmed. Scoped to the current version.
- **Undercut radar** (`overlap/`) — reads `v_overlap`, aggregated one row per product with each competitor's best price pivoted into its own column beside yours; shows lowest competitor, gap, cheapest flag; default-sorted by biggest gap where you're pricier.
- **Pricing power** (`unique/`) — `v_unique` (no confirmed match).
- **Market gap** (`market-gap/`) — `v_market_gap` (competitor items unmatched anywhere).

### 7.5 Edit engine (Phase 4)
- Scope × operation: {single, category, whole-list} × {percentage, flat, set-to-value}.
- `mutate_prices()` does everything atomically in the DB: computes new prices, checks the floor, applies, and writes `price_edits` (grouped by `batch_id` for bulk). **Undercut guard:** `view_cost` users get `needs_confirm` (with the floor shown) for below-floor changes; non-`view_cost` users have below-floor rows silently blocked with **no cost number in the response**.
- **Preview-then-apply:** a dry run reports affected/changing/breach counts before writing.
- Inline price edits in the grid route through the same preview/confirm flow.
- **Undo** (single edit or batch) via `undo_price_edit`/`undo_price_batch`.

### 7.6 Configurator (Phase 5)
SKU detail: specs + base price; toggle `spec_addons` (filtered by category); live recomputed price = base + Σ selected flat deltas; save writes `config` + price via `save_configuration()` (same guard + audit, scope `configurator`). Add-on catalogue managed by `bulk_edit` holders.

### 7.7 Branded PDF export (Phase 6)
- `lib/pdf/template.ts` — pure function producing branded **A5** HTML (header/logo, category groups, price table). Client-facing: **never includes cost**. Easy to replace with a final template later; data shape stays.
- `lib/pdf/render.ts` — Playwright/Chromium HTML→PDF; honors `CHROMIUM_EXECUTABLE_PATH`.
- `/api/export/[type]/[id]` — gated by `export_pdf`; exports the **current version's** my-list, or any competitor list. Local dev requires `npx playwright install chromium`; Render installs it in the Docker build.

### 7.8 Versioned lists (owner requirement)
- The imported list is a **locked Original**, immutable at UI + function + RLS layers.
- A **version bar** on the my-list screen: switch working list, "New version" (deep copy), rename, reset, archive. The selected version is stored in a cookie (`maaef_list_id`) via `lib/lists.ts`; **every screen** (radar, pricing power, matches, configurator, history, PDF) follows it.
- **Editing a locked Original** opens a "name a new list" dialog, creates the copy, applies the edit there (single targets remapped by SKU), and switches to it — the original is never touched.

### 7.9 Restore safety net (owner requirement)
- **Edit history** (`history/`) — full audit for the current version; Undo (single/batch); **"Restore to before"** on every entry rolls the whole list back to that moment (`restore_list`); restores are themselves logged.
- **Reset** (version bar) → back to creation state (the original's prices).
- **Archive** (version bar) → soft-delete a bad version (originals can't be archived).

### 7.10 In-app help (owner requirement)
- `components/info-tip.tsx` — a ⓘ popover button on every page title and primary control. All copy lives in **`lib/help.ts`** (single registry; edit there). Repeated row buttons use native hover tooltips.

---

## 8. Performance notes
- `current_session()` resolves profile + all capabilities in **one** DB round trip (previously ~6). `getLists`/`getCurrentList` are React.cache'd per request.
- Remaining latency on localhost is **dev-mode compilation** (use `npm run dev:turbo`) and **laptop→Supabase region** round-trip time. Production on Render **in the same region as Supabase** removes the latter. All pages are `force-dynamic` (per-user, auth-gated data).

---

## 9. Deployment & running

**Env vars** (`.env.example`): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (server-only, for Admin create-user), `NEXT_PUBLIC_APP_URL`, optional `CHROMIUM_EXECUTABLE_PATH`.

**Local:**
```
npm install
npx playwright install chromium        # for PDF export
cp .env.example .env.local              # fill Supabase keys
# apply supabase/migrations/*.sql in order (SQL editor or `supabase db push`)
update profiles set role='admin' where email='you@maaef.com';   # bootstrap
npm run dev        # or npm run dev:turbo (faster compiles)
```
**Reset for a clean re-import** (setup only — wipes lists/products/matches/history, keeps users/roles/add-ons): `truncate price_lists, competitors restart identity cascade;`

**Production:** `Dockerfile` (multi-stage, standalone Next output, installs Chromium) + `render.yaml` (persistent Docker web service). Set the env vars in Render; deploy in a region near Supabase.

---

## 10. Known gotchas / decisions
- **AG Grid Community has no row grouping** — grouping is faked with full-width header rows.
- **`xlsx` npm advisory** (prototype pollution / ReDoS): low real risk (trusted internal files only); the patched fix is the SheetJS CDN build. **Never run `npm audit fix --force`** — it would downgrade Next.js to v9.
- **After every `git pull`, run `npm install`** — new features add dependencies (`xlsx`, `@radix-ui/react-popover`, `playwright`); a stale `node_modules` throws "Module not found".
- **PDF 500 locally** = Chromium not installed → `npx playwright install chromium`.
- **Re-importing** creates a new snapshot competitor list each time (competitor data is append-only by design).
- The two-file `uploadMyProducts` path also creates a locked Original; the unified importer is the main path for the real data.
- `has_capability` is called both directly and inside RLS; it's SECURITY DEFINER to avoid recursive policy evaluation.

---

## 11. Current state
All six brief phases plus versioning, restore, performance, and in-app help are built,
typecheck-clean, and build-clean; DB logic (guard, cost isolation, matching, versioning,
restore, RLS) was verified with Postgres integration tests. Branch
`claude/system-build-pa0cgb`, latest commit `9756f56`. 11 migrations (`0001`–`0011`).
