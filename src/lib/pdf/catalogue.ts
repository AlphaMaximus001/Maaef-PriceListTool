/**
 * Branded catalogue PDF — the body (index + priced pages) that gets merged
 * between the fixed cover pages (public/pdf/front.pdf) and back pages
 * (public/pdf/back.pdf). Mirrors the Maaef Enterprises price-list format:
 *
 *   • a computed CATEGORY INDEX (two columns: number · category · page range)
 *   • catalogue pages: S.NO | ITEM DESCRIPTION | PAGES / LEAVES | RATE, with a
 *     dark category bar (repeated + "CONTINUED" when a category spans pages) and
 *     a "CATALOGUE PAGE N" footer.
 *
 * Pagination is done here in code (not by CSS auto-breaks) so the index page
 * numbers are exact and always reflect the current list's additions/removals.
 */

export type CatalogueItem = {
  name: string;
  category: string;
  pagesLeaves: string; // specs.pages || specs.unit
  price: number;
  currency: string;
};

type Row = { sno: number; name: string; pagesLeaves: string; price: number };
type Block = { category: string; continued: boolean; rows: Row[] };
type Page = { number: number; blocks: Block[] };
type IndexEntry = { n: number; category: string; from: number; to: number };

// Row-slots per catalogue page (a category bar counts as one slot). Tuned to A5.
const ROWS_PER_PAGE = 37;
// Index entries per column; two columns per index page.
const INDEX_PER_COL = 26;

function money(n: number, currency: string): string {
  const sym = currency === "INR" ? "₹" : "";
  return `${sym} ${Math.round(n).toLocaleString("en-IN")}`;
}
function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Group items into ordered categories, preserving incoming order. */
function group(items: CatalogueItem[]): { category: string; items: CatalogueItem[] }[] {
  const out: { category: string; items: CatalogueItem[] }[] = [];
  const idx = new Map<string, number>();
  for (const it of items) {
    const cat = it.category?.trim() || "Other";
    let i = idx.get(cat);
    if (i === undefined) {
      i = out.length;
      idx.set(cat, i);
      out.push({ category: cat, items: [] });
    }
    out[i].items.push(it);
  }
  return out;
}

/** Pack categories into fixed-capacity pages and compute each category's range. */
function paginate(items: CatalogueItem[]): { pages: Page[]; index: IndexEntry[] } {
  const groups = group(items);
  const pages: Page[] = [];
  let cur: Page = { number: 1, blocks: [] };
  let used = 0;
  const flush = () => {
    pages.push(cur);
    cur = { number: cur.number + 1, blocks: [] };
    used = 0;
  };

  const index: IndexEntry[] = [];

  groups.forEach((g, gi) => {
    let sno = 1;
    let i = 0;
    let continued = false;
    let from = 0;
    let to = 0;

    while (i < g.items.length) {
      // Need room for a header + at least one row; else start a new page.
      if (used > 0 && used + 2 > ROWS_PER_PAGE) flush();

      const block: Block = { category: g.category, continued, rows: [] };
      used += 1; // category bar slot

      while (i < g.items.length && used < ROWS_PER_PAGE) {
        const it = g.items[i];
        block.rows.push({ sno: sno++, name: it.name, pagesLeaves: it.pagesLeaves, price: it.price });
        used += 1;
        i += 1;
      }

      cur.blocks.push(block);
      if (from === 0) from = cur.number;
      to = cur.number;
      continued = true;

      if (i < g.items.length) flush(); // category overflows -> continue next page
    }

    index.push({ n: gi + 1, category: g.category, from, to });
  });

  if (cur.blocks.length) pages.push(cur);
  return { pages, index };
}

function pageRange(e: IndexEntry): string {
  return e.from === e.to ? `${e.from}` : `${e.from}-${e.to}`;
}

// ── HTML ─────────────────────────────────────────────────────────────────────

const STYLES = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, Helvetica, sans-serif; color: #1a1a1a; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .page {
    width: 419.25pt; height: 595.5pt; position: relative; overflow: hidden;
    padding: 14pt 16pt 26pt; page-break-after: always;
  }
  .page:last-child { page-break-after: auto; }

  /* Catalogue page chrome */
  .brand { display: flex; align-items: baseline; justify-content: space-between; margin-bottom: 6pt; }
  .brand .logo { font-size: 13pt; font-weight: 800; letter-spacing: .3pt; }
  .brand .logo b { color: #8B0000; }
  .brand .logo span { color: #9a9a9a; }
  .brand .doc { font-size: 9pt; font-weight: 700; color: #111; }

  table { width: 100%; border-collapse: collapse; table-layout: fixed; }
  col.sno { width: 32pt; } col.desc { width: auto; } col.pl { width: 96pt; } col.rate { width: 62pt; }

  thead th {
    background: #2b0a0a; color: #cfc4c4; font-size: 6.5pt; font-weight: 700;
    text-transform: uppercase; letter-spacing: .4pt; text-align: left; padding: 4pt 6pt;
  }
  thead th.rate { text-align: right; }

  tbody td { font-size: 7.5pt; padding: 2.6pt 6pt; border-bottom: .4pt solid #eee; vertical-align: middle; }
  tbody tr:nth-child(odd) td { background: #fbeef0; }
  /* Category bar defined AFTER striping so it always wins (same specificity). */
  tbody tr.cat td {
    background: #4a0d0d; color: #fff; font-weight: 800; font-size: 7pt;
    text-transform: uppercase; letter-spacing: .4pt; padding: 3.5pt 6pt; border-bottom: none;
  }
  tr.cat .cont { float: right; font-size: 6pt; font-weight: 700; color: #e6b8b8; letter-spacing: .5pt; }
  td.sno { text-align: center; color: #444; font-size: 7pt; }
  td.pl { color: #666; font-size: 7pt; }
  td.rate { text-align: right; color: #8B0000; font-weight: 700; white-space: nowrap; }

  .foot {
    position: absolute; left: 16pt; right: 16pt; bottom: 10pt;
    display: flex; justify-content: space-between; align-items: center;
    border-top: .6pt solid #8B0000; padding-top: 3pt; font-size: 6.5pt; color: #777;
  }
  .foot .r { color: #8B0000; font-weight: 700; letter-spacing: .3pt; }

  /* Index page */
  .idx-head { border-bottom: 1pt solid #8B0000; padding-bottom: 5pt; margin-bottom: 8pt; }
  .idx-head .ent { font-size: 8pt; font-weight: 700; color: #333; }
  .idx-title { display: flex; align-items: baseline; gap: 8pt; margin-top: 3pt; }
  .idx-title h1 { font-size: 18pt; font-weight: 800; color: #111; letter-spacing: .3pt; }
  .idx-title .pg { margin-left: auto; font-size: 7pt; font-weight: 700; color: #8B0000; letter-spacing: 1pt; }
  .idx-cols { display: flex; gap: 14pt; }
  .idx-col { flex: 1; }
  .idx-row { display: flex; align-items: center; gap: 5pt; padding: 3pt 0; border-bottom: .4pt solid #eee; }
  .idx-row .num { flex: 0 0 auto; font-size: 6.5pt; font-weight: 800; color: #8B0000; background: #f4e1e4; border-radius: 2pt; padding: 1.5pt 3pt; }
  .idx-row .cat { flex: 1; font-size: 7.2pt; color: #222; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .idx-row .rng { flex: 0 0 auto; font-size: 7pt; font-weight: 700; color: #7a1f1f; }
  .idx-foot { position: absolute; right: 16pt; bottom: 12pt; font-size: 7pt; font-weight: 700; color: #8B0000; letter-spacing: 1pt; }
`;

function indexPagesHtml(index: IndexEntry[]): string {
  const perPage = INDEX_PER_COL * 2;
  const pages: string[] = [];
  for (let p = 0; p < index.length; p += perPage) {
    const slice = index.slice(p, p + perPage);
    const left = slice.slice(0, INDEX_PER_COL);
    const right = slice.slice(INDEX_PER_COL);
    const col = (entries: IndexEntry[]) =>
      `<div class="idx-col">${entries
        .map(
          (e) =>
            `<div class="idx-row"><span class="num">${String(e.n).padStart(2, "0")}</span>` +
            `<span class="cat">${esc(e.category)}</span><span class="rng">${pageRange(e)}</span></div>`,
        )
        .join("")}</div>`;
    pages.push(
      `<section class="page">
        <div class="idx-head">
          <div class="ent">MAAEF ENTERPRISES</div>
          <div class="idx-title"><h1>CATEGORY INDEX</h1><span class="pg">PAGE</span></div>
        </div>
        <div class="idx-cols">${col(left)}${col(right)}</div>
        <div class="idx-foot">PRICE LIST 2026</div>
      </section>`,
    );
  }
  return pages.join("");
}

function cataloguePagesHtml(pages: Page[], currency: string): string {
  return pages
    .map((pg) => {
      const rowsHtml = pg.blocks
        .map((b) => {
          const bar =
            `<tr class="cat"><td colspan="4">${esc(b.category)}` +
            `${b.continued ? `<span class="cont">CONTINUED</span>` : ""}</td></tr>`;
          const items = b.rows
            .map(
              (r) =>
                `<tr><td class="sno">${r.sno}</td><td class="desc">${esc(r.name)}</td>` +
                `<td class="pl">${esc(r.pagesLeaves)}</td><td class="rate">${money(r.price, currency)}</td></tr>`,
            )
            .join("");
          return bar + items;
        })
        .join("");

      return `<section class="page">
        <div class="brand">
          <div class="logo"><b>MAAEF</b> <span>ENTERPRISES</span></div>
          <div class="doc">PRICE LIST 2026</div>
        </div>
        <table>
          <colgroup><col class="sno"/><col class="desc"/><col class="pl"/><col class="rate"/></colgroup>
          <thead><tr><th>S.NO.</th><th>ITEM DESCRIPTION</th><th>PAGES / LEAVES</th><th class="rate">RATE</th></tr></thead>
          <tbody>${rowsHtml}</tbody>
        </table>
        <div class="foot"><span>Available at : Maaef Enterprises</span><span class="r">CATALOGUE PAGE ${pg.number}</span></div>
      </section>`;
    })
    .join("");
}

/** Build the merge-ready body HTML: index page(s) followed by catalogue pages. */
export function buildCatalogueHtml(items: CatalogueItem[]): string {
  const currency = items[0]?.currency ?? "INR";
  const { pages, index } = paginate(items);
  const body = indexPagesHtml(index) + cataloguePagesHtml(pages, currency);
  return `<!doctype html><html><head><meta charset="utf-8"/><style>${STYLES}</style></head><body>${body}</body></html>`;
}
