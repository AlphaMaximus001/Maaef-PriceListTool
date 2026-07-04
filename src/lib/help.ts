/**
 * Central help registry. Every ⓘ button in the app reads its title + body from
 * here, keyed by feature. To change any explanation, edit THIS file only —
 * no component changes needed. Voice: declarative, practitioner-first.
 */

export type HelpEntry = { title: string; body: string };

export const HELP = {
  // ── Dashboard ───────────────────────────────────────────────────────────────
  "dashboard.access": {
    title: "Your access",
    body:
      "What you're allowed to do in this app. Your role (Admin, Editor, Viewer) sets the baseline, and an admin can grant or deny individual abilities just for you. A green tick means you can use that feature; a grey cross means it's hidden or disabled for you. If you need something unlocked, ask an admin — they change it on the Admin page.",
  },
  "dashboard.roadmap": {
    title: "Build roadmap",
    body:
      "The order the tool's features were built and shipped. Everything marked Live is ready to use today. This card is informational only.",
  },

  // ── Lists directory ─────────────────────────────────────────────────────────
  "lists.directory": {
    title: "Lists",
    body:
      "The home of every price list in the system. Your Maaef list is the one you edit, version, and export. Competitor lists are reference material: you can look at them and compare against them, but never edit them — that keeps comparisons honest.",
  },
  "lists.importUnified": {
    title: "Import inventory",
    body:
      "Upload the master spreadsheet that has YOUR rate and each competitor's rate side by side on each row (e.g. Maaef Rate, Smas Rate, Chandra Rate). One upload does everything: creates your product list as a locked Original, creates each competitor's list, and links every row where you and a competitor both have a price — those appear on the Undercut radar immediately. A blank rate cell means that brand doesn't sell the item.",
  },
  "lists.importMy": {
    title: "Import my list",
    body:
      "Upload a spreadsheet containing ONLY Maaef products (one price column). Use this when you have your own list separate from competitor data. The file must match the template — download it from inside the dialog. Creates a new locked Original list.",
  },
  "lists.uploadCompetitor": {
    title: "Upload competitor list",
    body:
      "Upload one competitor's price list on its own. Pick the competitor (or name a new one), name the list, and upload the file matching the template. Competitor data can never be edited after upload — if their prices change, upload a fresh list.",
  },
  "lists.myListCard": {
    title: "Your list",
    body:
      "Maaef's own products and client-facing prices — the protagonist of this tool. Open it to view, edit (on an editable version), and export. The private cost floor is attached here too, visible only to people with cost permission.",
  },
  "lists.competitorCard": {
    title: "Competitor lists",
    body:
      "Reference data only. Open any list to view its items read-only. These prices power the Undercut radar and Market gap screens. Nothing in the app can modify them — by design.",
  },

  // ── My list / versions ──────────────────────────────────────────────────────
  "mylist.workingList": {
    title: "Working list",
    body:
      "Which version of your price list every screen shows — the grid below, the Undercut radar, Pricing power, the Configurator, Edit history, and the PDF export all follow this selection. Lists with a lock icon are Originals: pristine imports that can never be changed. To experiment, switch to (or create) a version.",
  },
  "mylist.newVersion": {
    title: "New version",
    body:
      "Makes a complete, editable copy of the current list — products, private costs, and competitor links included — under a name you choose. Use versions to try pricing scenarios (e.g. 'Diwali rates', 'Q3 proposal') without any risk: the Original is never touched, and you can switch back anytime.",
  },
  "mylist.rename": {
    title: "Rename",
    body: "Changes this version's display name everywhere. Originals can't be renamed.",
  },
  "mylist.reset": {
    title: "Reset",
    body:
      "Undoes EVERY change made in this version, returning it to exactly how it was the moment it was created (the Original's prices). The reset itself is recorded in Edit history, so even a reset can be undone. Nothing is deleted.",
  },
  "mylist.archive": {
    title: "Archive",
    body:
      "Removes this version from every screen and picker — use it when a scenario is finished or went wrong beyond repair. Nothing is actually deleted, and the Original is unaffected. Originals can never be archived.",
  },
  "mylist.editToolbar": {
    title: "Bulk price editor",
    body:
      "Change many prices in one operation. Pick a Scope (one selected product, a whole category, or the entire list), an Operation (percentage like +10% / −5%, a flat rupee amount, or set every price to one value), enter the number, and press Preview. You'll see how many products change — and whether any would fall below their private cost floor — before anything is saved. On a locked Original, this button instead asks you to name a new version and applies the change there.",
  },
  "mylist.scope": {
    title: "Scope",
    body:
      "What the edit applies to. 'Selected product' = the single row you've ticked in the grid. 'A category' = every product in the chosen category. 'Whole list' = every product in this version.",
  },
  "mylist.operation": {
    title: "Operation",
    body:
      "How prices change. Percentage: multiply by a percent (e.g. −5 lowers everything 5%). Flat amount: add or subtract rupees (e.g. −50 takes ₹50 off each). Set to value: every product in scope gets exactly this price.",
  },
  "mylist.preview": {
    title: "Preview",
    body:
      "A dry run. Shows how many products are in scope, how many would actually change, and how many would land at or below the private cost floor — before anything is written. You then confirm or cancel. No prices change until you apply.",
  },
  "mylist.showCategory": {
    title: "Show category",
    body:
      "Filters the grid to one category so you can jump straight to it. This only changes what you SEE — it doesn't affect the bulk editor's scope, which has its own category picker.",
  },
  "mylist.costColumn": {
    title: "Cost (private)",
    body:
      "Maaef's internal cost floor per product — what it costs you, not what clients pay. Only people with the view-cost permission can see this column or the numbers in it; it never appears in exports, PDFs, or to Viewers. The undercut guard uses it to stop prices being set below cost.",
  },
  "mylist.exportPdf": {
    title: "Download PDF",
    body:
      "Generates a branded A5 Maaef price list of the version you're currently viewing, reflecting all saved edits. Client-facing: it shows selling prices only — never cost. Requires the export permission.",
  },
  "mylist.inlineEdit": {
    title: "Editing prices in the grid",
    body:
      "Double-click a price cell to type a new value. On an editable version it previews and saves (with the below-cost guard). On a locked Original it asks you to name a new version first.",
  },

  // ── Overlap / unique / market gap ───────────────────────────────────────────
  "overlap.page": {
    title: "Undercut radar",
    body:
      "Every Maaef product that has a confirmed competitor match, with your price beside each competitor's best price. 'Gap' is your price minus the cheapest competitor: red/positive means you're pricier (an undercut target), green means you're already cheapest. Sorted by biggest gap first so the top of the list is where action matters most. Follows the working list you've selected.",
  },
  "unique.page": {
    title: "Pricing power",
    body:
      "Maaef products with NO confirmed competitor match — items only you sell. No competition means room to charge a premium. If a product shouldn't be here, it probably needs its match confirmed on the Match review screen.",
  },
  "gap.page": {
    title: "Market gap",
    body:
      "The mirror of Pricing power: products competitors sell that Maaef doesn't (no confirmed link to any of your products). Use it to spot items worth adding to your catalogue — you can see exactly what the competition charges.",
  },

  // ── Match review ────────────────────────────────────────────────────────────
  "matches.page": {
    title: "Match review",
    body:
      "Where proposed product matches get a human decision. A 'match' says a Maaef product and a competitor item are the same physical product despite different names/codes. Matches only affect the Undercut radar once a person confirms them here — the computer never decides alone.",
  },
  "matches.run": {
    title: "Run matcher",
    body:
      "Scans your products against all competitor items and proposes likely matches: exact spec matches first, then name-similarity within the same category (with a % confidence). It only PROPOSES — nothing changes until you confirm each match below. Safe to run repeatedly; it won't disturb existing decisions.",
  },
  "matches.proposed": {
    title: "Proposed matches",
    body:
      "The matcher's suggestions, best-confidence first. Confirm = 'yes, same product' — it moves to the Undercut radar. Reject = 'different products' — it's dismissed and won't be re-proposed. When in doubt, check the pages/size specs before confirming.",
  },
  "matches.confirmed": {
    title: "Confirmed matches",
    body:
      "Matches a person has approved; these power the Undercut radar. Retract one if it was confirmed by mistake — the product moves back to Pricing power.",
  },

  // ── Configurator ────────────────────────────────────────────────────────────
  "config.page": {
    title: "Configurator",
    body:
      "Price a customized product. Open a product, toggle its add-ons (like lamination or binding), watch the price recompute live, and save. Saving writes the new price to the working list (with the same below-cost guard and history logging as any edit).",
  },
  "config.addons": {
    title: "Add-on catalogue",
    body:
      "Reusable customization options, each with a fixed price delta (e.g. Lamination +₹120). An add-on can apply to one category or to all products. These are flat amounts — the tool never derives them from cost.",
  },
  "config.price": {
    title: "Configured price",
    body:
      "Base price plus the sum of every toggled add-on, recomputed live as you flip switches. 'Save configuration' commits this price to the product on the working list and logs the change in Edit history.",
  },

  // ── History ─────────────────────────────────────────────────────────────────
  "history.page": {
    title: "Edit history",
    body:
      "The complete audit trail for the working list: every price change, who made it, when, old → new. Nothing here is ever deleted. Three ways back: Undo reverses one change or one bulk batch; 'Restore to before' rolls the WHOLE list back to just before that entry; Reset (on the list page) goes all the way back to creation. Restores are themselves logged, so even they can be undone.",
  },
  "history.undo": {
    title: "Undo",
    body:
      "Reverses just this change (or this batch), putting the affected price(s) back to their previous value. Other changes stay.",
  },
  "history.restore": {
    title: "Restore to before",
    body:
      "Time machine: rolls EVERY product in the list back to the price it had just before this entry — as if this change and everything after it never happened. The restore is logged too, so it's reversible.",
  },

  // ── Admin ───────────────────────────────────────────────────────────────────
  "admin.page": {
    title: "Admin",
    body:
      "The control room for people and permissions. Create accounts, deactivate them, set roles, and fine-tune individual abilities. Every permission rule in the app resolves through what's configured here.",
  },
  "admin.newUser": {
    title: "New user",
    body:
      "Creates an account that can sign in immediately with the temporary password you set (they should change it after first login). Pick their role: Viewer = read-only, Editor = works with prices and uploads, Admin = everything including this page.",
  },
  "admin.role": {
    title: "Role",
    body:
      "The permission baseline. Viewer: look, don't touch. Editor: edit prices, bulk edit, upload lists, confirm matches, export PDFs — but no cost visibility and no user management. Admin: everything. Individual abilities can still be granted or denied per person on top of the role.",
  },
  "admin.active": {
    title: "Active",
    body:
      "Switch off to deactivate an account: they can no longer sign in or do anything, but their history is kept. Switch back on to restore access. You can't deactivate yourself.",
  },
  "admin.capabilities": {
    title: "Capabilities",
    body:
      "Fine-grained overrides for one person. Each ability is set to Default (follow the role), Allow (grant it even if the role wouldn't), or Deny (block it even if the role would allow it). Example: give one trusted Editor 'View cost floor', or take 'Bulk edit' away from someone still learning.",
  },

  // ── Upload dialogs ──────────────────────────────────────────────────────────
  "upload.template": {
    title: "Templates",
    body:
      "Files must match the expected columns exactly — the importer refuses to guess. Download the template, fill it (or export from Excel in the same shape), and upload. Unknown or missing columns are reported so you can fix the file.",
  },
  "upload.myBrand": {
    title: "Your brand column",
    body:
      "Which '<Brand> Rate' column is YOURS in the unified sheet. Every other Rate column becomes a competitor automatically. Leave as 'Maaef' unless your sheet names the column differently.",
  },
} as const satisfies Record<string, HelpEntry>;

export type HelpKey = keyof typeof HELP;
