import { formatPrice } from "@/lib/utils";

/**
 * Branded A5 Maaef price-list template (HTML). Pure function — no Playwright,
 * no DB — so it can be unit-tested and previewed in a browser. NEVER includes
 * cost (invariant 1): this is the client-facing document.
 *
 * NOTE: this is a clean, on-brand default. When the final Maaef A5 template
 * lands (per the brief, it arrives in this last stage), swap the markup here —
 * the data shape and the render/route layers stay unchanged.
 */

export type PdfItem = {
  sku: string | null;
  product_name: string;
  category: string | null;
  price: number;
  currency: string;
};

export type PdfListData = {
  title: string; // list name
  subtitle?: string; // e.g. competitor name, or "Price list"
  items: PdfItem[];
  generatedAt: Date;
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function buildListHtml(data: PdfListData): string {
  // Group items by category, preserving a stable order.
  const groups = new Map<string, PdfItem[]>();
  for (const it of data.items) {
    const cat = it.category?.trim() || "Other";
    const arr = groups.get(cat) ?? [];
    arr.push(it);
    groups.set(cat, arr);
  }
  const orderedCategories = [...groups.keys()].sort();

  const rows = orderedCategories
    .map((cat) => {
      const items = groups
        .get(cat)!
        .map(
          (it) => `
            <tr>
              <td class="sku">${escapeHtml(it.sku ?? "")}</td>
              <td class="name">${escapeHtml(it.product_name)}</td>
              <td class="price">${escapeHtml(formatPrice(it.price, it.currency))}</td>
            </tr>`,
        )
        .join("");
      return `
        <tr class="cat-row"><td colspan="3">${escapeHtml(cat)}</td></tr>
        ${items}`;
    })
    .join("");

  const dateStr = data.generatedAt.toLocaleDateString("en-IN", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<style>
  @page { size: A5; margin: 0; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    color: #1A1A1A;
    font-size: 9.5pt;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .page { padding: 14mm 12mm; }
  header {
    display: flex; align-items: center; justify-content: space-between;
    border-bottom: 2.5pt solid #8B0000; padding-bottom: 8pt; margin-bottom: 12pt;
  }
  .brand { display: flex; align-items: center; gap: 8pt; }
  .logo {
    width: 26pt; height: 26pt; border-radius: 5pt; background: #8B0000;
    color: #fff; font-weight: 700; font-size: 14pt;
    display: flex; align-items: center; justify-content: center;
  }
  .brand h1 { font-size: 13pt; margin: 0; letter-spacing: 0.2pt; }
  .brand .sub { font-size: 7.5pt; color: #2B1B2E; margin-top: 1pt; }
  .meta { text-align: right; font-size: 7.5pt; color: #555; }
  .list-title { font-size: 11pt; font-weight: 600; color: #2B1B2E; margin: 0 0 8pt; }
  table { width: 100%; border-collapse: collapse; }
  thead th {
    text-align: left; font-size: 7.5pt; text-transform: uppercase; letter-spacing: 0.4pt;
    color: #8B0000; border-bottom: 0.75pt solid #e7d4d8; padding: 3pt 4pt;
  }
  th.price, td.price { text-align: right; white-space: nowrap; }
  tbody td { padding: 3.2pt 4pt; border-bottom: 0.5pt solid #f0e6e8; vertical-align: top; }
  td.sku { color: #777; font-size: 8pt; width: 22%; }
  td.name { width: 56%; }
  td.price { width: 22%; font-weight: 600; }
  tr.cat-row td {
    background: #F4E1E4; color: #2B1B2E; font-weight: 700; font-size: 8pt;
    text-transform: uppercase; letter-spacing: 0.4pt; padding: 4pt; border: none;
  }
  footer {
    margin-top: 14pt; padding-top: 6pt; border-top: 0.75pt solid #e7d4d8;
    font-size: 7pt; color: #888; display: flex; justify-content: space-between;
  }
</style>
</head>
<body>
  <div class="page">
    <header>
      <div class="brand">
        <div class="logo">M</div>
        <div>
          <h1>Maaef</h1>
          <div class="sub">${escapeHtml(data.subtitle ?? "Price list")}</div>
        </div>
      </div>
      <div class="meta">
        <div>${escapeHtml(dateStr)}</div>
        <div>${data.items.length} items</div>
      </div>
    </header>

    <h2 class="list-title">${escapeHtml(data.title)}</h2>

    <table>
      <thead>
        <tr><th>SKU</th><th>Product</th><th class="price">Price</th></tr>
      </thead>
      <tbody>
        ${rows || `<tr><td colspan="3" style="padding:12pt;text-align:center;color:#999">No items.</td></tr>`}
      </tbody>
    </table>

    <footer>
      <span>Maaef — confidential pricing</span>
      <span>Generated ${escapeHtml(dateStr)}</span>
    </footer>
  </div>
</body>
</html>`;
}
