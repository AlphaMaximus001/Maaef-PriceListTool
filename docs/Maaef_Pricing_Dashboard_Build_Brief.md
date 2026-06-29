# Maaef Competitive Pricing Dashboard — Build Brief

**Version 1.0 — locked requirements. Build against this document.**

This brief is written to be handed to an LLM (Claude Code) or a developer. It is the source of truth. Where this document and your own instinct disagree, this document wins. If something genuinely isn't specified here, stop and ask — do not invent it.

---

## 0. How to use this brief

- Build the stack in **§2 exactly**. Do not substitute frameworks.
- Treat **§4 Invariants** as hard constraints. A build that violates any invariant is wrong even if it "works."
- Build features in the **phase order of §9**. Don't jump ahead.
- Before adding anything not described here, check **§10 Do Not Build**. If still unsure, ask.
- Use the companion file `maaef_pricing_schema.sql` as the database. Do not redesign the schema; extend it only when a feature here requires it, and say so.

---

## 1. What this is

A competitive price-positioning dashboard for Maaef. Maaef sells print/stationery products at client-facing prices. Competitors sell overlapping products. The tool exists to answer one question continuously: **where do I overlap with competitors (so I can undercut), and where am I unique (so I can charge a premium)?**

The user's own price list is the protagonist — the only list that gets edited, configured, saved, and exported. Competitor lists are reference data: uploaded, named, compared against, never edited. A private cost floor (visible only to permitted users) guards every undercut so the user never prices below profitability.

This is **not** a sourcing tool, a vendor system, or a bill-of-materials cost engine. See §10.

---

## 2. Locked stack

| Layer | Choice | Notes |
|---|---|---|
| Framework | **Next.js (App Router) + TypeScript** | Server actions for upload/parse. |
| Styling | **Tailwind + shadcn/ui** | Maaef design system below. |
| Tables/grid | **AG Grid Community** | Category grouping, range-select bulk edit, inline edit at 1,500+ rows. |
| DB / Auth / Storage | **Supabase (Postgres)** | Auth, RLS, file storage. Schema is provided. |
| Spreadsheet parsing | **SheetJS (xlsx)** | Reads the standardized intake templates. |
| PDF (later phase) | **Playwright**, HTML→PDF | Branded A5 export. Built in final phase, not now. |
| Hosting | **Single container on Railway or Render** | Persistent container so Playwright PDF generation doesn't time out. Do not target Vercel serverless for the PDF path. |

**Maaef design system:** Maaef Red `#8B0000` (primary), deep purple `#2B1B2E`, blush `#F4E1E4`, near-black `#1A1A1A`. Voice in any UI copy: declarative, practitioner-first, confident. Not Gen-Z, not hustle-culture, not corporate-generic.

---

## 3. Glossary — pin these terms

| Term | Exact meaning |
|---|---|
| **My list / my products** | Maaef's own products and their client-facing prices. The only editable list. |
| **Competitor list** | One competitor's prices. Reference only. Never edited in-app. One uploaded file per competitor list. |
| **Price** | Client-facing selling price. The number on the eventual PDF. |
| **Cost** | PRIVATE cost floor for a Maaef product. Not a selling price. Visible only to users with the `view_cost` capability. Never shown to clients, never exposed to Viewers. |
| **Overlap SKU** | A Maaef product that has a *confirmed* match to at least one competitor item. Shown on the undercut radar. |
| **Unique SKU** | A Maaef product with no confirmed competitor match. Shown on the pricing-power screen. |
| **Match** | A link between one Maaef product and one competitor item, judged to be the same physical product despite different codes/names. Made by the matcher, **only counts once a human confirms it.** |
| **Spec add-on** | A fixed price delta for a customization (e.g. lamination +₹120). Configurator adds selected add-ons to the base price. |
| **Capability** | A gated action (e.g. `export_pdf`). Granted by role default and overridable per person. |

If any term feels ambiguous mid-build, it's defined here. Don't reinterpret.

---

## 4. Invariants — non-negotiable

1. **Cost is private and isolated.** Cost lives in `product_costs`, never in `my_products`. It is readable only via the `view_cost` capability (enforced by RLS). No screen, query, export, or API response available to a non-`view_cost` user may ever contain cost. A Viewer must not be able to infer it.
2. **Matching is never silent.** A match does not affect the overlap view, pricing, or any number until a human sets `confirmed = true`. The matcher only proposes.
3. **Competitor data is read-only.** Nothing in the app edits `competitor_items` or `competitor_lists` after upload. No "fix competitor price" feature.
4. **Every price change is logged and reversible.** All single/category/bulk edits write a row to `price_edits` (old price, new price, who, when, operation). "Save" means: apply to `my_products` *and* record in `price_edits`. The user can review and undo.
5. **Capabilities resolve through `has_capability()`.** UI gating and server enforcement both use it. Per-person override beats role default. Never gate on raw role checks in the app — always the resolver, so the Admin page stays the single source of truth.
6. **The undercut guard fires before a save below floor.** If an edit (single or bulk) would set a Maaef price at or below that product's cost, and the acting user has `view_cost`, warn and require explicit confirmation before saving. If the user lacks `view_cost`, the guard still blocks silently (save is rejected with a generic "below allowed floor" message that does not reveal the cost number).
7. **Only the standardized templates are accepted on intake.** Parse against the known column set. Reject/flag files that don't match rather than guessing columns.

---

## 5. Data model

Use `maaef_pricing_schema.sql` as-is. Summary of what each table is for:

- `profiles`, `capabilities`, `role_defaults`, `capability_grants` → identity + the permission system. `has_capability(uid, cap)` resolves access.
- `my_products` → your editable list (public price). `product_costs` → the private floor, RLS-locked.
- `spec_addons` → fixed customization deltas for the configurator.
- `competitors`, `competitor_lists`, `competitor_items` → reference competitor data.
- `product_matches` → mine ↔ theirs, with `confirmed` flag.
- `price_edits` → audit trail.
- Views `v_overlap` (undercut radar) and `v_unique` (pricing power) power the two core screens — read them directly.

---

## 6. Permission behavior in the UI

- Roles: **Admin, Editor, Viewer.** Baselines are in `role_defaults`.
- The **Admin page** is the control surface: create/deactivate users, set roles, and grant or retract individual capabilities per person (writes `capability_grants`). Example flows that must work: give one Viewer `export_pdf`; retract `bulk_edit` from one Editor; grant `view_cost` to a specific non-admin.
- Every gated control in the UI is shown/enabled via `has_capability`. A user who lacks a capability never sees a dead button — hide or disable with a tooltip.
- Server actions re-check capability server-side. Never trust the client gate alone.

---

## 7. Features → build units with acceptance criteria

Mapped to the user's original six features.

**F1 — Upload multiple competitor price lists.**
Upload an `.xlsx` matching the competitor template. Parse with SheetJS, archive the original to Storage, write rows to `competitor_items` under a named `competitor_lists` row tied to a `competitor`.
*Done when:* a user with `upload_competitor` uploads a file, names it, and its rows appear; a user without the capability cannot reach the upload.

**F2 — Display all lists, each named, distinctly.**
A list directory: your list + each competitor list, each labeled. Open any competitor list read-only; open your list editable (subject to capability).
*Done when:* every uploaded list is visible by name and distinguishable; competitor lists have no edit affordances.

**F3 — Overlap view (the core).**
For each Maaef product with a confirmed match: show your price beside each competitor's price, the lowest competitor price, the gap, and whether you're cheapest. Plus the mirror screen: unique SKUs with no competitor. Read `v_overlap` and `v_unique`.
*Done when:* both screens render correctly; changing a confirmation flag moves a product between them; sorting by "biggest gap where I'm pricier" works.

**F4 — Edit prices: single, category, whole list.**
Operations: percentage (e.g. +10% / −5%), flat amount (+₹/−₹), set-to-value. Scope: one SKU, a category, or the entire list. Every apply writes `price_edits`. Undercut guard per invariant 6. Undo from the audit trail.
*Done when:* all three scopes × three operations work, each logs an edit, the guard fires below floor, and an edit can be undone.

**F5 — SKU breakdown + spec configurator.**
A detail screen for one Maaef product: its specs and price up top; below, toggle spec add-ons (`spec_addons` filtered by `applies_to`); the recomputed price (base + Σ selected add-ons) shows live; a Save commits the new configuration/price to `my_products` (and logs to `price_edits`).
*Done when:* toggling add-ons updates the displayed price live, and Save persists and is reflected on the list. Add-ons are fixed deltas — no derived-from-cost math.

**F6 — Download any list as branded PDF (final phase).**
Playwright renders the branded A5 Maaef template for the selected list, reflecting the latest saved edits, on demand. Gated by `export_pdf`.
*Done when:* exporting produces a branded PDF of current prices. **Build last** (template comes in the final stage per the user).

---

## 8. Screens

1. **Login** (Supabase auth).
2. **Lists directory** — your list + competitor lists by name.
3. **My price list** — AG Grid, editable per capability, category grouping, bulk-edit toolbar, cost column visible only to `view_cost`.
4. **Competitor list view** — read-only grid.
5. **Overlap / undercut radar** — `v_overlap`, with cheapest flags and gaps.
6. **Unique / pricing power** — `v_unique`.
7. **Match review** — proposed matches with confidence; confirm/reject. The only place `confirmed` is set.
8. **SKU detail + configurator** — F5.
9. **Edit history** — `price_edits`, with undo.
10. **Admin** — users, roles, per-person capability grants.

---

## 9. Build phases (in order)

1. **Auth + permissions + Admin page.** Roles, `has_capability` wired into UI gating + server checks. Nothing else is safe to build first.
2. **Intake + display.** Upload/parse both templates, archive originals, lists directory, read-only competitor view, editable my-list grid (cost gated).
3. **Matching + the two views.** Matcher proposes (spec-key exact → fuzzy fallback), match-review screen to confirm, then `v_overlap` + `v_unique` screens.
4. **Edit engine.** Single/category/bulk × pct/flat/set, audit log, undercut guard, undo.
5. **Configurator.** SKU detail, add-on toggles, live price, save.
6. **Branded PDF export.** Playwright + A5 Maaef template.

Each phase ships working before the next starts. Definition of done for a phase = its features' acceptance criteria in §7 pass and no §4 invariant is violated.

---

## 10. Do not build

- **No sourcing / vendor / supplier features.** The lists are competitor *selling* prices, not your costs from suppliers.
- **No bill-of-materials cost engine.** Spec add-ons are flat deltas, full stop. Do not compute price from component costs.
- **No editing of competitor data.** Ever.
- **No auto-confirming matches.** A confidence score never substitutes for human confirmation.
- **No exposing cost** to any user without `view_cost`, in any form (column, tooltip, export, API, inferable calc).
- **No raw role checks** scattered in the app — only `has_capability`.
- **No Vercel-serverless PDF generation** — persistent container only.
- **No second LLM-at-runtime feature** unless the user adds it later; the matcher's fuzzy fallback can be deterministic (string similarity) to start.

---

## 11. Open items (decide before or during the relevant phase)

- **Matcher fallback strength (phase 3):** start with deterministic spec-key + string similarity (e.g. token-set ratio on product_name within same category). Only escalate to an LLM/embedding pass if confirmation volume proves too noisy. Default: deterministic first.
- **Currency handling:** schema stores INR/USD per row. Decide in phase 2 whether overlap comparisons are within-currency only (recommended) or converted.
- **Bulk-edit safety on huge selections (phase 4):** confirm a preview-then-apply step (show how many rows, how many would breach floor) before committing — recommended.

These are the only unresolved questions. Everything else is locked above.
