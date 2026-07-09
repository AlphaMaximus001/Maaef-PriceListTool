import { formatPrice } from "@/lib/utils";

/**
 * Branded A5 Maaef price-list template (HTML). Pure function — no Playwright,
 * no DB. NEVER includes cost (invariant 1). Optionally includes the pricing
 * intelligence columns (MUSP/MP) and a per-page employee footer.
 */

export type PdfItem = {
  sku: string | null;
  product_name: string;
  category: string | null;
  price: number;
  currency: string;
  musp?: number | null; // only when showIntel
  mp?: number | null;
};

export type PdfFooter = {
  name: string;
  email: string;
  phone?: string | null;
  signatureDataUri?: string | null;
};

export type PdfListData = {
  title: string;
  subtitle?: string;
  items: PdfItem[];
  generatedAt: Date;
  showIntel?: boolean; // include MUSP/MP columns (admin choice)
  footer?: PdfFooter; // repeated on every page
};

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function buildListHtml(data: PdfListData): string {
  const showIntel = !!data.showIntel;
  const colspan = 3 + (showIntel ? 2 : 0);

  const groups = new Map<string, PdfItem[]>();
  for (const it of data.items) {
    const cat = it.category?.trim() || "Other";
    (groups.get(cat) ?? groups.set(cat, []).get(cat)!).push(it);
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
              ${showIntel ? `<td class="intel">${it.musp == null ? "—" : escapeHtml(formatPrice(it.musp, it.currency))}</td>` : ""}
              ${showIntel ? `<td class="intel">${it.mp == null ? "—" : escapeHtml(formatPrice(it.mp, it.currency))}</td>` : ""}
            </tr>`,
        )
        .join("");
      return `<tr class="cat-row"><td colspan="${colspan}">${escapeHtml(cat)}</td></tr>${items}`;
    })
    .join("");

  const dateStr = data.generatedAt.toLocaleDateString("en-IN", { year: "numeric", month: "long", day: "numeric" });

  const f = data.footer;
  const footerHtml = f
    ? `<footer>
        <div class="f-left">Maaef — confidential pricing</div>
        <div class="f-mid">
          <div>${escapeHtml(f.name)} · ${escapeHtml(f.email)}</div>
          ${f.phone ? `<div>${escapeHtml(f.phone)}</div>` : ""}
        </div>
        <div class="f-right">
          ${f.signatureDataUri ? `<img class="sig" src="${f.signatureDataUri}" alt="signature" />` : ""}
        </div>
      </footer>`
    : "";

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<style>
  /* Bottom margin reserves space for the fixed (per-page) footer. */
  @page { size: A5; margin: 12mm 10mm ${f ? "24mm" : "12mm"} 10mm; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    color: #1A1A1A; font-size: 9.5pt;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
  header {
    display: flex; align-items: center; justify-content: space-between;
    border-bottom: 2.5pt solid #8B0000; padding-bottom: 8pt; margin-bottom: 12pt;
  }
  .brand { display: flex; align-items: center; gap: 8pt; }
  .logo { width: 26pt; height: 26pt; border-radius: 5pt; background: #8B0000; color: #fff; font-weight: 700; font-size: 14pt; display: flex; align-items: center; justify-content: center; }
  .brand h1 { font-size: 13pt; margin: 0; }
  .brand .sub { font-size: 7.5pt; color: #2B1B2E; margin-top: 1pt; }
  .meta { text-align: right; font-size: 7.5pt; color: #555; }
  .list-title { font-size: 11pt; font-weight: 600; color: #2B1B2E; margin: 0 0 8pt; }
  table { width: 100%; border-collapse: collapse; }
  thead th { text-align: left; font-size: 7.5pt; text-transform: uppercase; letter-spacing: 0.4pt; color: #8B0000; border-bottom: 0.75pt solid #e7d4d8; padding: 3pt 4pt; }
  th.price, td.price, th.intel, td.intel { text-align: right; white-space: nowrap; }
  td.intel { color: #2B1B2E; }
  tbody td { padding: 3.2pt 4pt; border-bottom: 0.5pt solid #f0e6e8; vertical-align: top; }
  td.sku { color: #777; font-size: 8pt; }
  tr.cat-row td { background: #F4E1E4; color: #2B1B2E; font-weight: 700; font-size: 8pt; text-transform: uppercase; letter-spacing: 0.4pt; padding: 4pt; border: none; }
  /* Fixed footer repeats on every printed page (Chromium print behavior). */
  footer {
    position: fixed; left: 0; right: 0; bottom: -18mm;
    display: flex; align-items: center; justify-content: space-between;
    border-top: 0.75pt solid #e7d4d8; padding-top: 4pt;
    font-size: 7pt; color: #666;
  }
  footer .f-mid { text-align: center; line-height: 1.3; }
  footer .sig { max-height: 16mm; max-width: 40mm; object-fit: contain; }
</style>
</head>
<body>
  ${footerHtml}
  <header>
    <div class="brand">
      <div class="logo">M</div>
      <div>
        <h1>Maaef</h1>
        <div class="sub">${escapeHtml(data.subtitle ?? "Price list")}</div>
      </div>
    </div>
    <div class="meta"><div>${escapeHtml(dateStr)}</div><div>${data.items.length} items</div></div>
  </header>
  <h2 class="list-title">${escapeHtml(data.title)}</h2>
  <table>
    <thead>
      <tr>
        <th>SKU</th><th>Product</th><th class="price">Price</th>
        ${showIntel ? `<th class="intel">MUSP</th><th class="intel">MP</th>` : ""}
      </tr>
    </thead>
    <tbody>
      ${rows || `<tr><td colspan="${colspan}" style="padding:12pt;text-align:center;color:#999">No items.</td></tr>`}
    </tbody>
  </table>
</body>
</html>`;
}
