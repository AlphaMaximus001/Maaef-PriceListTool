import * as XLSX from "xlsx";
import { computeSpecKey } from "@/lib/templates";

/**
 * Unified-inventory intake — the wide, pre-matched format used by Maaef's real
 * price list. One row = one product with EVERY brand's rate side by side:
 *
 *   Category | SI_No. | Description/Name | Form_No. | Pages/Leaves |
 *   Maaef Rate | Smas Rate | Chandra Rate | Unit
 *
 * Differences from the two-file templates this handles:
 *   - No SKU column: identity is (Category, SI_No.) — we synthesize a stable SKU.
 *   - Multiple brand "* Rate" columns on one row (one "mine" + N competitors).
 *   - Blank rate = that brand doesn't offer the item (NOT zero).
 *   - Pages/Leaves, Unit, Form_No. carry product identity -> folded into specs.
 *   - Devanagari/Hindi text is preserved (Unicode-safe keys, see templates.ts).
 */

export const DEFAULT_MY_BRAND = "Maaef";

type ColSpec = { canonical: string; aliases: string[] };

const FIXED_COLUMNS: ColSpec[] = [
  { canonical: "Category", aliases: ["category", "cat"] },
  { canonical: "SI_No.", aliases: ["si_no.", "si no", "sl no", "s.no", "serial", "sr no", "sno"] },
  { canonical: "Description/Name", aliases: ["description/name", "description", "name", "item", "particulars"] },
  { canonical: "Form_No.", aliases: ["form_no.", "form no", "form number", "form", "form_no"] },
  { canonical: "Pages/Leaves", aliases: ["pages/leaves", "pages", "leaves", "size", "pages / leaves"] },
  { canonical: "Unit", aliases: ["unit", "uom"] },
];

export type CompetitorPrice = { brand: string; sku: string; price: number };

export type UnifiedRow = {
  category: string | null;
  name: string;
  specs: Record<string, string>;
  spec_key: string;
  mySku: string;
  myPrice: number | null; // null = Maaef doesn't offer this item
  competitorPrices: CompetitorPrice[]; // only brands that have a rate
};

export type UnifiedParseResult = {
  ok: boolean;
  rows: UnifiedRow[];
  myBrand: string;
  competitorBrands: string[];
  errors: string[];
  warnings: string[];
  detectedColumns: string[];
};

const norm = (s: unknown) => String(s ?? "").trim();
const normKey = (s: unknown) => norm(s).toLowerCase().replace(/\s+/g, " ");

function toNumber(v: unknown): number | null {
  const raw = norm(v).replace(/[, ₹]/g, "");
  if (raw === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

/** Deterministic short hash so synthesized SKUs are stable across re-imports. */
function hashCode(s: string): string {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36).slice(0, 6);
}

function skuFor(brand: string, catOrder: number, siNo: string, name: string): string {
  const prefix = brand.replace(/[^a-zA-Z0-9]+/g, "").slice(0, 5).toUpperCase() || "ITEM";
  const idPart = siNo || hashCode(name);
  // Readable + stable: brand + category number (from the sheet's Categories tab)
  // + the row serial, e.g. MAAEF-C6-2.
  return `${prefix}-C${catOrder}-${idPart}`;
}

/**
 * Read the workbook's "Categories" (or "Summary") tab to map each category name
 * to its canonical order number, so SKUs read MAAEF-C6-… . Falls back to
 * first-seen order for any category not listed there.
 */
function buildCategoryOrder(wb: XLSX.WorkBook): Map<string, number> {
  const map = new Map<string, number>();
  const sheetName =
    wb.SheetNames.find((n) => n.toLowerCase() === "categories") ??
    wb.SheetNames.find((n) => n.toLowerCase() === "summary");
  if (!sheetName) return map;

  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[sheetName], { defval: "" });
  for (const r of rows) {
    const keys = Object.keys(r);
    const catKey = keys.find((k) => k.trim().toLowerCase() === "category");
    const ordKey = keys.find((k) => ["order", "category_order"].includes(k.trim().toLowerCase()));
    if (!catKey) continue;
    const cat = norm(r[catKey]);
    const ord = ordKey ? Number(norm(r[ordKey])) : NaN;
    if (cat && Number.isFinite(ord)) map.set(cat, ord);
  }
  return map;
}

function makeOrderResolver(known: Map<string, number>): (category: string | null) => number {
  let nextFallback = 1;
  for (const v of known.values()) nextFallback = Math.max(nextFallback, v + 1);
  const cache = new Map<string, number>();
  return (category) => {
    const key = category ?? "";
    const cached = cache.get(key);
    if (cached !== undefined) return cached;
    const order = known.get(key) ?? nextFallback++;
    cache.set(key, order);
    return order;
  };
}

function resolveHeader(detected: string): string | null {
  const d = normKey(detected);
  for (const col of FIXED_COLUMNS) {
    if (normKey(col.canonical) === d || col.aliases.some((a) => normKey(a) === d)) return col.canonical;
  }
  // Brand rate column, e.g. "Maaef Rate", "Smas Rate".
  const m = d.match(/^(.*?)\s*rate$/);
  if (m && m[1]) return `RATE:${norm(detected).replace(/\s*rate$/i, "").trim()}`;
  return null;
}

/**
 * Parse the unified workbook. `myBrand` is the brand treated as "yours"
 * (default "Maaef"); every other "* Rate" column is a competitor.
 */
export function parseUnifiedWorkbook(
  buffer: ArrayBuffer | Buffer,
  myBrand: string = DEFAULT_MY_BRAND,
): UnifiedParseResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  let wb: XLSX.WorkBook;
  try {
    wb = XLSX.read(buffer, { type: "buffer" });
  } catch {
    return empty(["Could not read the file as a spreadsheet."], myBrand);
  }
  // Prefer an "Inventory" sheet if present (the real file has several sheets).
  const sheetName =
    wb.SheetNames.find((n) => n.toLowerCase() === "inventory") ?? wb.SheetNames[0];
  if (!sheetName) return empty(["The workbook has no sheets."], myBrand);

  const matrix = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[sheetName], {
    header: 1,
    blankrows: false,
  });
  if (matrix.length < 2) return empty(["The sheet has no data rows."], myBrand);

  const headerRow = (matrix[0] as unknown[]).map(norm);
  const detectedColumns = headerRow.filter(Boolean);
  const resolved = headerRow.map(resolveHeader);

  // Index the fixed columns.
  const idxOf = (canon: string) => resolved.findIndex((r) => r === canon);
  const iCat = idxOf("Category");
  const iSi = idxOf("SI_No.");
  const iName = idxOf("Description/Name");
  const iForm = idxOf("Form_No.");
  const iPages = idxOf("Pages/Leaves");
  const iUnit = idxOf("Unit");

  // Brand rate columns.
  const brandCols: { brand: string; index: number }[] = [];
  resolved.forEach((r, i) => {
    if (r?.startsWith("RATE:")) brandCols.push({ brand: r.slice(5), index: i });
  });

  if (iName < 0) errors.push('Missing a product name column ("Description/Name").');
  if (brandCols.length === 0) errors.push('No "<Brand> Rate" columns found (e.g. "Maaef Rate").');

  const myBrandCol = brandCols.find((b) => b.brand.toLowerCase() === myBrand.toLowerCase());
  if (brandCols.length > 0 && !myBrandCol) {
    errors.push(`No "${myBrand} Rate" column found. Found: ${brandCols.map((b) => `${b.brand} Rate`).join(", ")}.`);
  }

  if (errors.length) return { ...empty(errors, myBrand), detectedColumns };

  const competitorCols = brandCols.filter((b) => b !== myBrandCol);
  const competitorBrands = competitorCols.map((b) => b.brand);

  // Category -> order number (from the Categories tab) for readable SKUs.
  const orderFor = makeOrderResolver(buildCategoryOrder(wb));

  const rows: UnifiedRow[] = [];
  for (let r = 1; r < matrix.length; r++) {
    const row = matrix[r] as unknown[];
    const name = iName >= 0 ? norm(row[iName]) : "";
    if (!name) continue; // silently skip structural/blank rows

    const category = iCat >= 0 ? norm(row[iCat]) || null : null;
    const siNo = iSi >= 0 ? norm(row[iSi]) : "";
    const formNo = iForm >= 0 ? norm(row[iForm]) : "";
    const pages = iPages >= 0 ? norm(row[iPages]) : "";
    const unit = iUnit >= 0 ? norm(row[iUnit]) : "";

    const specs: Record<string, string> = {};
    if (pages) specs["pages"] = pages;
    if (unit) specs["unit"] = unit;
    if (formNo) specs["form_no"] = formNo;

    const spec_key = computeSpecKey(category, specs, "");
    const catOrder = orderFor(category);
    const mySku = skuFor(myBrand, catOrder, siNo, name);

    const myPrice = myBrandCol ? toNumber(row[myBrandCol.index]) : null;

    const competitorPrices: CompetitorPrice[] = [];
    for (const c of competitorCols) {
      const price = toNumber(row[c.index]);
      if (price !== null) {
        competitorPrices.push({ brand: c.brand, sku: skuFor(c.brand, catOrder, siNo, name), price });
      }
    }

    // A row with no rate at all carries no comparison value.
    if (myPrice === null && competitorPrices.length === 0) continue;

    rows.push({ category, name, specs, spec_key, mySku, myPrice, competitorPrices });
  }

  if (rows.length === 0) errors.push("No priced rows found.");

  return {
    ok: errors.length === 0,
    rows,
    myBrand,
    competitorBrands,
    errors,
    warnings,
    detectedColumns,
  };
}

function empty(errors: string[], myBrand: string): UnifiedParseResult {
  return { ok: false, rows: [], myBrand, competitorBrands: [], errors, warnings: [], detectedColumns: [] };
}

/** Downloadable unified-format template (headers + two example rows). */
export function buildUnifiedTemplate(): Buffer {
  const headers = [
    "Category", "SI_No.", "Description/Name", "Form_No.", "Pages/Leaves",
    "Maaef Rate", "Smas Rate", "Chandra Rate", "Unit",
  ];
  const examples = [
    ["P.W.A. Forms & Registers", 1, "Abstract Register", 81, "100 Leaves", 2106, "", "", "Per Pad"],
    ["P.W.A. Forms & Registers", 3, "Abstract of Stock Issue", "", "100 Forms", 1102, 340, "", "Per Pad"],
  ];
  const ws = XLSX.utils.aoa_to_sheet([headers, ...examples]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Inventory");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}
