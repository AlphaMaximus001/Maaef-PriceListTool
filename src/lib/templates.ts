import * as XLSX from "xlsx";

/**
 * Standardized intake templates (invariant 7: "Only the standardized templates
 * are accepted on intake. Parse against the known column set. Reject/flag files
 * that don't match rather than guessing columns.")
 *
 * Two templates share a column vocabulary. Headers are matched case-insensitively
 * and trimmed, but the SET must match: required headers present, no unknown ones.
 */

export type TemplateKind = "my_products" | "competitor";

type ColumnSpec = {
  header: string; // canonical header shown in the template
  required: boolean;
  aliases?: string[]; // accepted alternate spellings
};

const COMMON_COLUMNS: ColumnSpec[] = [
  { header: "SKU", required: false, aliases: ["sku", "code", "item code"] },
  { header: "Product Name", required: true, aliases: ["product", "name", "description", "item"] },
  { header: "Category", required: false, aliases: ["cat", "type"] },
  { header: "Price", required: true, aliases: ["selling price", "list price", "mrp", "rate"] },
  { header: "Currency", required: false, aliases: ["ccy"] },
  { header: "Spec Key", required: false, aliases: ["speckey", "key"] },
  { header: "Specs", required: false, aliases: ["specification", "specifications", "attributes"] },
];

export const TEMPLATES: Record<TemplateKind, { label: string; columns: ColumnSpec[] }> = {
  my_products: {
    label: "Maaef products",
    // SKU is required & unique for your own list (it's the edit key).
    columns: [
      { ...COMMON_COLUMNS[0], required: true },
      ...COMMON_COLUMNS.slice(1),
      // Cost is optional and only honored when the uploader has view_cost.
      { header: "Cost", required: false, aliases: ["cost floor", "floor"] },
    ],
  },
  competitor: {
    label: "Competitor list",
    columns: COMMON_COLUMNS,
  },
};

export type ParsedRow = {
  sku: string | null;
  product_name: string;
  category: string | null;
  price: number;
  currency: string;
  specs: Record<string, string>;
  spec_key: string;
  cost: number | null; // only ever populated for my_products + permitted uploader
};

export type ParseResult = {
  ok: boolean;
  rows: ParsedRow[];
  errors: string[]; // blocking problems
  warnings: string[]; // non-blocking notes
  detectedColumns: string[];
};

const norm = (s: unknown) => String(s ?? "").trim();
const normKey = (s: unknown) => norm(s).toLowerCase().replace(/\s+/g, " ");

/** Normalize a value into a stable matching key fragment. */
function normalizeForKey(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}

/**
 * Deterministic spec key (used by the phase-3 matcher's exact pass).
 * Prefer an explicit "Spec Key" column; otherwise derive from category + the
 * sorted spec values so the same physical product keys identically across lists.
 */
export function computeSpecKey(
  category: string | null,
  specs: Record<string, string>,
  explicit?: string | null,
): string {
  if (explicit && norm(explicit)) return normalizeForKey(norm(explicit));
  const parts = [category ?? ""].concat(
    Object.keys(specs)
      .sort()
      .map((k) => `${k}:${specs[k]}`),
  );
  return normalizeForKey(parts.join("|"));
}

/** Parse a "k=v; k2=v2" specs cell into an object. */
function parseSpecsCell(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (!raw) return out;
  for (const pair of raw.split(/[;\n]+/)) {
    const [k, ...rest] = pair.split(/[:=]/);
    if (k && rest.length) out[normKey(k)] = norm(rest.join(":"));
  }
  return out;
}

/** Map a detected header to its canonical column, or null if unknown. */
function resolveHeader(detected: string, columns: ColumnSpec[]): ColumnSpec | null {
  const d = normKey(detected);
  for (const col of columns) {
    if (normKey(col.header) === d) return col;
    if (col.aliases?.some((a) => normKey(a) === d)) return col;
  }
  return null;
}

/**
 * Parse + validate an uploaded workbook against a template. Never guesses:
 * unknown columns and missing required columns are reported, not worked around.
 */
export function parseWorkbook(
  buffer: ArrayBuffer | Buffer,
  kind: TemplateKind,
  opts: { includeCost: boolean },
): ParseResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const template = TEMPLATES[kind];

  let wb: XLSX.WorkBook;
  try {
    wb = XLSX.read(buffer, { type: "buffer" });
  } catch {
    return { ok: false, rows: [], errors: ["Could not read the file as a spreadsheet."], warnings: [], detectedColumns: [] };
  }
  const sheetName = wb.SheetNames[0];
  if (!sheetName) {
    return { ok: false, rows: [], errors: ["The workbook has no sheets."], warnings: [], detectedColumns: [] };
  }
  const sheet = wb.Sheets[sheetName];
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, blankrows: false });
  if (matrix.length === 0) {
    return { ok: false, rows: [], errors: ["The sheet is empty."], warnings: [], detectedColumns: [] };
  }

  const headerRow = (matrix[0] as unknown[]).map(norm);
  const detectedColumns = headerRow.filter(Boolean);

  // Map each detected header to a canonical column; flag unknowns.
  const colMap: (ColumnSpec | null)[] = headerRow.map((h) => (h ? resolveHeader(h, template.columns) : null));
  const unknown = headerRow.filter((h, i) => h && !colMap[i]);
  if (unknown.length) {
    errors.push(
      `Unrecognized column(s): ${unknown.join(", ")}. This file doesn't match the ${template.label} template.`,
    );
  }

  // Required columns present?
  const presentCanonical = new Set(colMap.filter(Boolean).map((c) => c!.header));
  for (const col of template.columns) {
    if (col.required && !presentCanonical.has(col.header)) {
      errors.push(`Missing required column: "${col.header}".`);
    }
  }

  if (errors.length) {
    return { ok: false, rows: [], errors, warnings, detectedColumns };
  }

  // Index of each canonical header within the row.
  const idx = (header: string) => colMap.findIndex((c) => c?.header === header);
  const iSku = idx("SKU");
  const iName = idx("Product Name");
  const iCat = idx("Category");
  const iPrice = idx("Price");
  const iCcy = idx("Currency");
  const iKey = idx("Spec Key");
  const iSpecs = idx("Specs");
  const iCost = idx("Cost");

  const rows: ParsedRow[] = [];
  const seenSku = new Set<string>();

  for (let r = 1; r < matrix.length; r++) {
    const row = matrix[r] as unknown[];
    const rowNo = r + 1; // 1-based, accounting for header
    const name = iName >= 0 ? norm(row[iName]) : "";
    const priceRaw = iPrice >= 0 ? norm(row[iPrice]) : "";
    if (!name && !priceRaw) continue; // skip fully blank rows

    if (!name) {
      warnings.push(`Row ${rowNo}: missing Product Name — skipped.`);
      continue;
    }
    const price = Number(String(priceRaw).replace(/[, ₹$]/g, ""));
    if (!Number.isFinite(price)) {
      warnings.push(`Row ${rowNo}: price "${priceRaw}" isn't a number — skipped.`);
      continue;
    }

    const sku = iSku >= 0 ? norm(row[iSku]) || null : null;
    if (kind === "my_products") {
      if (!sku) {
        warnings.push(`Row ${rowNo}: Maaef rows need a SKU — skipped.`);
        continue;
      }
      if (seenSku.has(sku.toLowerCase())) {
        warnings.push(`Row ${rowNo}: duplicate SKU "${sku}" — skipped.`);
        continue;
      }
      seenSku.add(sku.toLowerCase());
    }

    const category = iCat >= 0 ? norm(row[iCat]) || null : null;
    const currency = (iCcy >= 0 ? norm(row[iCcy]) : "").toUpperCase() || "INR";
    const specs = iSpecs >= 0 ? parseSpecsCell(norm(row[iSpecs])) : {};
    const explicitKey = iKey >= 0 ? norm(row[iKey]) : "";
    const spec_key = computeSpecKey(category, specs, explicitKey);

    let cost: number | null = null;
    if (kind === "my_products" && opts.includeCost && iCost >= 0) {
      const costRaw = norm(row[iCost]);
      if (costRaw) {
        const c = Number(costRaw.replace(/[, ₹$]/g, ""));
        if (Number.isFinite(c)) cost = c;
      }
    }

    rows.push({ sku, product_name: name, category, price, currency, specs, spec_key, cost });
  }

  if (rows.length === 0) errors.push("No valid data rows found.");

  return { ok: errors.length === 0, rows, errors, warnings, detectedColumns };
}

/** Build a downloadable .xlsx template (headers + one example row). */
export function buildTemplateWorkbook(kind: TemplateKind): Buffer {
  const template = TEMPLATES[kind];
  const headers = template.columns.map((c) => c.header);
  const example =
    kind === "my_products"
      ? ["MAAEF-LH-A4", "Letterhead A4 100gsm", "Stationery", 500, "INR", "", "gsm=100; size=A4", 300]
      : ["RIV-204", "Letterhead A4", "Stationery", 450, "INR", "", "gsm=100; size=A4"];
  const ws = XLSX.utils.aoa_to_sheet([headers, example]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, template.label.slice(0, 31));
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}
