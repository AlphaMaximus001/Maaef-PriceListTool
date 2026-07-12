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
};

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/**
 * The employee footer, as Chromium `footerTemplate` HTML. Chromium renders this
 * inside every page's bottom margin (a real per-page footer), so it always sits
 * at the bottom. Styles must be inline and a font-size must be set explicitly
 * (Chromium resets it to 0 otherwise). Table layout for robustness.
 */
export function buildFooterTemplate(f: PdfFooter): string {
  const phone = f.phone ? `<div>${escapeHtml(f.phone)}</div>` : "";
  const sig = f.signatureDataUri
    ? `<img src="${f.signatureDataUri}" style="max-height:10mm;max-width:32mm;object-fit:contain;" />`
    : "";
  return `<div style="width:100%;box-sizing:border-box;padding:2mm 10mm 0;font-size:7pt;font-family:Arial,Helvetica,sans-serif;color:#666;">
  <table style="width:100%;border-top:0.75pt solid #e7d4d8;border-collapse:collapse;">
    <tr>
      <td style="text-align:left;padding-top:3pt;width:30%;vertical-align:middle;">Maaef — confidential pricing</td>
      <td style="text-align:center;padding-top:3pt;width:40%;vertical-align:middle;line-height:1.35;"><div>${escapeHtml(f.name)} · ${escapeHtml(f.email)}</div>${phone}</td>
      <td style="text-align:right;padding-top:3pt;width:30%;vertical-align:middle;">${sig}</td>
    </tr>
  </table>
</div>`;
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

  // NOTE: page size + margins + the per-page employee footer are set by the
  // renderer (page.pdf), not here — that's what keeps the footer pinned to the
  // bottom of every page instead of floating into the content.
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<style>
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
</style>
</head>
<body>
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
