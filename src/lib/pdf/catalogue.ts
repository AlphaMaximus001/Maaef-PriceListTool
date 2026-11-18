/**
 * Branded catalogue PDF — the body (index + priced pages) that gets merged
 * between the fixed cover pages (public/pdf/front.pdf) and back pages
 * (public/pdf/back.pdf). Mirrors the Maaef Enterprises price-list format:
 *
 *   • a computed CATEGORY INDEX (two columns: number · category · page range)
 *   • catalogue pages: S.NO | ITEM DESCRIPTION | PAGES / LEAVES | RATE, with a
 *     dark category bar (repeated + "CONTINUED" when a category spans pages) and
 *     a "PAGE N" footer.
 *
 * Text is never truncated: long descriptions and Devanagari names wrap onto as
 * many lines as they need. That means rows have different heights, so a fixed
 * "N rows per page" can't be used. Instead every row is MEASURED in the same
 * Chromium that prints the PDF (buildMeasureHtml → Metrics), and pages are
 * packed by real height (layoutCatalogue). The index page numbers therefore stay
 * exact, whatever the list contains.
 */

export type CatalogueItem = {
  name: string;
  category: string;
  pagesLeaves: string; // specs.pages || specs.unit, already normalised
  price: number;
  currency: string;
};

export type Group = { category: string; items: CatalogueItem[] };
type Row = { sno: number; name: string; pagesLeaves: string; price: number; h: number };
type Block = { category: string; continued: boolean; rows: Row[] };
/** `free`: blank height (px) left under the last row — filled with the watermark. */
export type Page = { number: number; blocks: Block[]; free: number };
export type IndexEntry = { n: number; category: string; from: number; to: number; h: number };

/** Heights (CSS px) measured in Chromium. */
export type Metrics = {
  avail: number; // usable tbody height on a catalogue page
  idxAvail: number; // usable column height on an index page
  bar: [number, number][]; // per group: [first bar, "CONTINUED" bar]
  rows: number[][]; // per group, per item
  idx: number[]; // per group's index entry
};

/** indexFree mirrors indexPages: blank height (px) under each index column. */
export type Layout = { pages: Page[]; index: IndexEntry[]; indexPages: IndexEntry[][][]; indexFree: number[][] };

/** Shown top-right of every priced page and on the index footer. */
export const PRICE_LIST_LABEL = "PRICE LIST 2026-27";

const DEVANAGARI = /[ऀ-ॿ꣠-ꣿ᳐-᳿]/;

function money(n: number, currency: string): string {
  const sym = currency === "INR" ? "₹" : "";
  return `${sym} ${Math.round(n).toLocaleString("en-IN")}`;
}
function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
/** Mark Devanagari text so it gets room for its matras (taller line box). */
function dv(s: string): string {
  return DEVANAGARI.test(s) ? " dv" : "";
}

/** Group items into ordered categories, preserving incoming order. */
export function groupItems(items: CatalogueItem[]): Group[] {
  const out: Group[] = [];
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

// ── Styles ───────────────────────────────────────────────────────────────────

/**
 * Devanagari is drawn with Noto Sans Devanagari (bundled — the server's fallback
 * font, FreeSans, draws Hindi noticeably smaller than the Latin beside it).
 * unicode-range limits it to Devanagari codepoints, so Latin text keeps Arial;
 * size-adjust scales the Hindi up wherever it appears (names, category bars,
 * index) without touching the Latin.
 */
export function fontFaceCss(regularWoff2: string, boldWoff2: string): string {
  const range = "U+0900-097F, U+1CD0-1CFF, U+A8E0-A8FF, U+200C-200D, U+25CC";
  const face = (family: string, b64: string, weight: number, unicode: string, adjust: string) =>
    `@font-face { font-family: "${family}"; font-weight: ${weight}; font-style: normal;` +
    ` src: url(data:font/woff2;base64,${b64}) format("woff2");` +
    ` unicode-range: ${unicode}; size-adjust: ${adjust}; }`;
  return (
    face("MaaefDeva", regularWoff2, 400, range, "118%") +
    face("MaaefDeva", boldWoff2, 700, range, "118%") +
    // The rupee sign isn't in Arial; without this it falls back to whatever the
    // server has installed. Pin it to the bundled font, at its natural size.
    face("MaaefRupee", regularWoff2, 400, "U+20B9", "100%") +
    face("MaaefRupee", boldWoff2, 700, "U+20B9", "100%")
  );
}

/**
 * Anti-tamper watermark for the blank space on a page (below the last row, and
 * under the index columns). A printed list is posted to offices, so empty space
 * must not be usable to hand-write extra items: it gets a diagonal hatch with a
 * staggered "MAAEF" mark. It appears ONLY in blank space — never behind items.
 *
 * Drawn as inline SVG shapes, not a CSS background: Chromium rasterises tiled
 * background images into a full-page bitmap per page (it took the PDF from
 * ~1.5 MB to 10–18 MB). The mark is a fixed outline ("MAAEF" in Arial Bold),
 * not text, so it never shows up when the PDF is searched or copied. Solid
 * tints rather than opacity keep it vector.
 *
 * Design tile: 140×80 units, two marks per tile, hatch every 10 units (divides
 * the tile, so tiles join seamlessly). It is scaled so whole tiles span the
 * width — no mark is ever cut at the edge.
 */
const MARK_PATH =
  "M-26.74 -1.25V5H-28.66V-5.32H-25.77L-23.92 0.45Q-23.8 0.94 -23.67 1.42Q-23.53 1.91 -23.41 2.39Q-23.33 2.11 -23.26 1.84Q-23.18 1.56 -23.1 1.29Q-23.03 1.01 -22.95 0.74L-21.05 -5.32H-18.17V5H-20.09V-1.25Q-20.09 -1.47 -20.07 -2.11Q-20.05 -2.75 -20.02 -3.5Q-20.27 -2.52 -20.47 -1.83Q-20.66 -1.15 -20.79 -0.76L-22.65 5H-24.19L-26.05 -0.76L-26.83 -3.5Q-26.79 -2.65 -26.76 -2.09Q-26.74 -1.53 -26.74 -1.25ZM-12.22 2.36 -13.13 5H-15.3L-11.53 -5.32H-8.98L-5.23 5H-7.37L-8.29 2.36ZM-10.26 -3.73Q-10.33 -3.44 -10.46 -3.03Q-10.59 -2.62 -10.65 -2.45L-11.74 0.74H-8.77L-9.88 -2.51Q-9.99 -2.81 -10.07 -3.12Q-10.16 -3.43 -10.26 -3.73ZM0.11 2.36 -0.8 5H-2.96L0.8 -5.32H3.35L7.1 5H4.96L4.05 2.36ZM2.08 -3.73Q2 -3.44 1.87 -3.03Q1.74 -2.62 1.68 -2.45L0.6 0.74H3.56L2.45 -2.51Q2.35 -2.81 2.26 -3.12Q2.17 -3.43 2.08 -3.73ZM18.42 3.33V5H10V-5.32H18.11V-3.65H12.16V-1.06H17.67V0.61H12.16V3.33ZM23.67 1.21V5H21.5V-5.32H29.11V-3.65H23.67V-0.46H28.95V1.21Z";
const HATCH = "#eed9d9";
const MARK = "#d9a8a8";
/** Blank space shorter than this (CSS px, ≈7pt) is left plain — too thin to write in. */
const MIN_VOID = 9.5;
/** Inner width (CSS px) of a catalogue page, and of one index column. */
const PAGE_INNER_W = ((419.25 - 32) * 4) / 3;
const INDEX_COL_W = ((419.25 - 32 - 14) / 2) * 4 / 3;

function watermarkSvg(width: number, across: number, height: number): string {
  const k = width / across / 140; // design units → px
  const tw = 140 * k;
  const th = 80 * k;
  const rows = Math.ceil(height / th) + 1;
  const h = rows * th;
  const r = (n: number) => Math.round(n * 100) / 100;
  let hatch = "";
  for (let x = -h; x <= width; x += 10 * k) hatch += `M${r(x)} 0l${r(h)} ${r(h)}`;
  let marks = "";
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < across; col++) {
      for (const [cx, cy] of [[35, 21], [105, 61]]) {
        marks += `<use href="#wm-mark" transform="translate(${r(col * tw + cx * k)} ${r(row * th + cy * k)}) rotate(-20) scale(${r(k)})"/>`;
      }
    }
  }
  return (
    `<svg class="wm" width="${r(width)}" height="${r(h)}" viewBox="0 0 ${r(width)} ${r(h)}" aria-hidden="true">` +
    `<defs><path id="wm-mark" d="${MARK_PATH}" fill="${MARK}"/></defs>` +
    `<path d="${hatch}" stroke="${HATCH}" stroke-width="${r(0.9 * k)}" fill="none"/>${marks}</svg>`
  );
}

/** Filler that takes the blank space left on a page / in an index column. */
function voidHtml(width: number, across: number, free: number): string {
  return `<div class="void">${free >= MIN_VOID ? watermarkSvg(width, across, free) : ""}</div>`;
}

const STYLES = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: "MaaefDeva", "MaaefRupee", Arial, Helvetica, sans-serif; color: #1a1a1a;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
  .page {
    width: 419.25pt; height: 595.5pt; overflow: hidden;
    padding: 14pt 16pt 12pt; page-break-after: always;
    display: flex; flex-direction: column;
  }
  .page:last-child { page-break-after: auto; }
  .page table { flex: 0 0 auto; }
  /* Measuring sheet: same width and padding as a page, unbounded height. */
  .sheet { width: 419.25pt; padding: 0 16pt; }

  /* Catalogue page chrome */
  .brand { display: flex; align-items: baseline; justify-content: space-between; margin-bottom: 6pt; }
  .brand .logo { font-size: 13pt; font-weight: 800; letter-spacing: .3pt; }
  .brand .logo b { color: #8B0000; }
  .brand .logo span { color: #9a9a9a; }
  .brand .doc { font-size: 9pt; font-weight: 700; color: #111; }

  table { width: 100%; border-collapse: collapse; table-layout: fixed; }
  col.sno { width: 30pt; } col.desc { width: auto; } col.pl { width: 92pt; } col.rate { width: 58pt; }

  /* Column header uses the grey of "ENTERPRISES" with black text. */
  thead th {
    background: #9a9a9a; color: #000; font-size: 6.5pt; font-weight: 700;
    text-transform: uppercase; letter-spacing: .4pt; text-align: left; padding: 4pt 6pt;
  }
  thead th.rate { text-align: right; }

  /* Rows wrap instead of clipping — nothing is cut off with an ellipsis. Heights
     vary, which is why pagination is done from measured heights. */
  tbody td {
    font-size: 7.5pt; line-height: 1.3; padding: 2pt 6pt; border-bottom: .4pt solid #eee;
    vertical-align: middle; white-space: normal; overflow-wrap: break-word;
  }
  /* Devanagari needs a taller line box for its matras above and below. */
  tbody td.dv { line-height: 1.55; }
  tbody tr:nth-child(odd) td { background: #fbeef0; }
  /* Category bar defined AFTER striping so it always wins (same specificity). */
  tbody tr.cat td {
    background: #4a0d0d; color: #fff; font-weight: 800; font-size: 7pt; line-height: 1.3;
    text-transform: uppercase; letter-spacing: .4pt; padding: 3.5pt 6pt; border-bottom: none;
  }
  tbody tr.cat td.dv { line-height: 1.55; padding: 2.5pt 6pt; }
  tr.cat .cont { float: right; margin-left: 8pt; font-size: 6pt; font-weight: 700; color: #e6b8b8; letter-spacing: .5pt; }
  td.sno { text-align: center; color: #444; font-size: 7pt; }
  td.pl { color: #666; font-size: 7pt; }
  td.rate { text-align: right; color: #8B0000; font-weight: 700; white-space: nowrap; }

  /* Blank space → watermark. Size containment means the filler never adds to the
     content height (pagination and the overflow check are unaffected); it just
     takes whatever room is left and clips the watermark to it. */
  .void { flex: 1 1 0; container-type: size; overflow: hidden; }
  .void .wm { display: block; }

  .foot {
    margin-top: auto; display: flex; justify-content: space-between; align-items: center;
    border-top: .6pt solid #8B0000; padding-top: 3pt; font-size: 6.5pt; color: #777;
  }
  .foot .c { color: #999; letter-spacing: .5pt; font-variant: small-caps; }
  .foot .r { color: #8B0000; font-weight: 700; letter-spacing: .3pt; }

  /* Index page */
  .idx-head { border-bottom: 1pt solid #8B0000; padding-bottom: 5pt; margin-bottom: 8pt; }
  .idx-head .ent { font-size: 8pt; font-weight: 700; color: #333; }
  .idx-title { display: flex; align-items: baseline; gap: 8pt; margin-top: 3pt; }
  .idx-title h1 { font-size: 18pt; font-weight: 800; color: #111; letter-spacing: .3pt; }
  .idx-title .pg { margin-left: auto; font-size: 7pt; font-weight: 700; color: #8B0000; letter-spacing: 1pt; }
  .idx-cols { display: flex; gap: 14pt; align-items: flex-start; }
  .idx-col { flex: 1 1 0; min-width: 0; }
  /* On real index pages the columns stretch to the footer so the space under
     the last entry of each column can carry the watermark. */
  .page .idx-cols { flex: 1 1 auto; align-items: stretch; }
  .page .idx-col { display: flex; flex-direction: column; }
  .idx-row { display: flex; align-items: center; gap: 5pt; padding: 2.3pt 0; border-bottom: .4pt solid #eee; }
  .idx-row .num { flex: 0 0 auto; font-size: 6.5pt; font-weight: 800; color: #8B0000; background: #f4e1e4; border-radius: 2pt; padding: 1.5pt 3pt; }
  .idx-row .cat { flex: 1 1 auto; min-width: 0; font-size: 7.2pt; line-height: 1.3; color: #222; overflow-wrap: break-word; }
  .idx-row .cat.dv { line-height: 1.55; }
  .idx-row .rng { flex: 0 0 auto; font-size: 7pt; font-weight: 700; color: #7a1f1f; }
  .idx-foot { margin-top: auto; display: flex; justify-content: space-between; align-items: center; font-size: 7pt; font-weight: 700; color: #8B0000; letter-spacing: 1pt; padding-top: 4pt; }
  .idx-foot .code { color: #999; font-weight: 700; letter-spacing: .5pt; font-variant: small-caps; }
`;

function codeTag(code?: string): string {
  return code ? `Ref: ${esc(code)}` : "";
}

function doc(fontCss: string, body: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"/><style>${fontCss}${STYLES}</style></head><body>${body}</body></html>`;
}

// ── Fragments shared by the measuring sheet and the real pages ──────────────

const COLGROUP = `<colgroup><col class="sno"/><col class="desc"/><col class="pl"/><col class="rate"/></colgroup>`;
const THEAD = `<thead><tr><th>S.NO.</th><th>ITEM DESCRIPTION</th><th>PAGES / LEAVES</th><th class="rate">RATE</th></tr></thead>`;

function barHtml(category: string, continued: boolean, attr = ""): string {
  return (
    `<tr class="cat"${attr}><td colspan="4" class="${dv(category).trim()}">${esc(category)}` +
    `${continued ? `<span class="cont">CONTINUED</span>` : ""}</td></tr>`
  );
}

function rowHtml(sno: number, name: string, pl: string, price: number, currency: string, attr = ""): string {
  return (
    `<tr${attr}><td class="sno">${sno}</td><td class="desc${dv(name)}">${esc(name)}</td>` +
    `<td class="pl${dv(pl)}">${esc(pl)}</td><td class="rate">${money(price, currency)}</td></tr>`
  );
}

function idxRowHtml(n: number, category: string, range: string, attr = ""): string {
  return (
    `<div class="idx-row"${attr}><span class="num">${String(n).padStart(2, "0")}</span>` +
    `<span class="cat${dv(category)}">${esc(category)}</span><span class="rng">${range}</span></div>`
  );
}

function brandHtml(): string {
  return `<div class="brand"><div class="logo"><b>MAAEF</b> <span>ENTERPRISES</span></div><div class="doc">${PRICE_LIST_LABEL}</div></div>`;
}

function indexHeadHtml(): string {
  return `<div class="idx-head"><div class="ent">MAAEF ENTERPRISES</div><div class="idx-title"><h1>CATEGORY INDEX</h1><span class="pg">PAGE</span></div></div>`;
}

// ── 1. Measuring sheet ───────────────────────────────────────────────────────

/**
 * One document holding: an empty catalogue page and an empty index page (to read
 * the usable heights), plus every category bar (both variants), every row and
 * every index entry at their real widths. Read back with MEASURE_SCRIPT.
 */
export function buildMeasureHtml(groups: Group[], fontCss: string): string {
  const currency = groups[0]?.items[0]?.currency ?? "INR";
  const probePage =
    `<section class="page" id="probe">${brandHtml()}` +
    `<table id="probe-table">${COLGROUP}${THEAD}<tbody></tbody></table>` +
    `<div class="foot" id="probe-foot"><span>Available at : Maaef Enterprises</span><span class="c">Ref: MXXX99X99</span><span class="r">PAGE 99</span></div></section>`;
  const probeIndex =
    `<section class="page" id="iprobe">${indexHeadHtml()}` +
    `<div class="idx-cols" id="iprobe-cols"><div class="idx-col"></div><div class="idx-col"></div></div>` +
    `<div class="idx-foot" id="iprobe-foot"><span class="code">Ref: MXXX99X99</span><span>${PRICE_LIST_LABEL}</span></div></section>`;

  const rows = groups
    .map((g, gi) => {
      const bars = barHtml(g.category, false, ` data-m="b0:${gi}"`) + barHtml(g.category, true, ` data-m="b1:${gi}"`);
      const items = g.items
        .map((it, ii) => rowHtml(ii + 1, it.name, it.pagesLeaves, it.price, currency, ` data-m="r:${gi}:${ii}"`))
        .join("");
      return bars + items;
    })
    .join("");
  const sheet = `<div class="sheet"><table>${COLGROUP}${THEAD}<tbody>${rows}</tbody></table></div>`;

  // Index entries at real column width; "88-88" is the widest range they can show.
  const idx = groups.map((g, gi) => idxRowHtml(gi + 1, g.category, "88-88", ` data-m="i:${gi}"`)).join("");
  const idxSheet = `<div class="sheet"><div class="idx-cols"><div class="idx-col">${idx}</div><div class="idx-col"></div></div></div>`;

  return doc(fontCss, probePage + probeIndex + sheet + idxSheet);
}

/**
 * Runs inside the browser (page.evaluate), so it must be self-contained: no
 * outer-scope references and no syntax a bundler would turn into helper calls
 * (destructuring, spread). Returns Metrics.
 */
export function measureInPage(arg: { groupCount: number; itemCounts: number[] }): Metrics {
  const groupCount = arg.groupCount;
  const itemCounts = arg.itemCounts;
  const q = (sel: string) => document.querySelector(sel) as HTMLElement;
  const h = (el: Element | null) => (el ? el.getBoundingClientRect().height : 0);
  const avail = q("#probe-foot").getBoundingClientRect().top - q("#probe-table").getBoundingClientRect().bottom;
  const idxAvail = q("#iprobe-foot").getBoundingClientRect().top - q("#iprobe-cols").getBoundingClientRect().top;
  const get = (k: string) => h(document.querySelector(`[data-m="${k}"]`));
  const bar: [number, number][] = [];
  const rows: number[][] = [];
  const idx: number[] = [];
  for (let g = 0; g < groupCount; g++) {
    bar.push([get(`b0:${g}`), get(`b1:${g}`)]);
    const r: number[] = [];
    for (let i = 0; i < itemCounts[g]; i++) r.push(get(`r:${g}:${i}`));
    rows.push(r);
    idx.push(get(`i:${g}`));
  }
  return { avail, idxAvail, bar, rows, idx };
}

// ── 2. Layout from measured heights ──────────────────────────────────────────

/** Pack rows into pages by real height; pack index entries into columns likewise. */
export function layoutCatalogue(groups: Group[], m: Metrics): Layout {
  // A hair of slack absorbs sub-pixel rounding between measuring and printing.
  const AVAIL = m.avail - 1.5;
  const pages: Page[] = [];
  let cur: Page = { number: 1, blocks: [], free: 0 };
  let used = 0;
  const flush = () => {
    cur.free = Math.max(0, AVAIL - used);
    pages.push(cur);
    cur = { number: cur.number + 1, blocks: [], free: 0 };
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
      const barH = m.bar[gi][continued ? 1 : 0];
      // Never leave a category bar alone at the bottom of a page.
      if (used > 0 && used + barH + m.rows[gi][i] > AVAIL) flush();

      const block: Block = { category: g.category, continued, rows: [] };
      used += barH;
      while (i < g.items.length && (block.rows.length === 0 || used + m.rows[gi][i] <= AVAIL)) {
        const it = g.items[i];
        block.rows.push({ sno: sno++, name: it.name, pagesLeaves: it.pagesLeaves, price: it.price, h: m.rows[gi][i] });
        used += m.rows[gi][i];
        i += 1;
      }

      cur.blocks.push(block);
      if (from === 0) from = cur.number;
      to = cur.number;
      continued = true;
      if (i < g.items.length) flush(); // category overflows → continue on the next page
    }
    index.push({ n: gi + 1, category: g.category, from, to, h: m.idx[gi] });
  });
  if (cur.blocks.length) flush();

  // Index: fill the left column, then the right, then a new page.
  const IDX_AVAIL = m.idxAvail - 1.5;
  const indexPages: IndexEntry[][][] = [];
  const indexFree: number[][] = [];
  let page: IndexEntry[][] = [[], []];
  let free = [IDX_AVAIL, IDX_AVAIL];
  let col = 0;
  let colUsed = 0;
  for (const e of index) {
    if (colUsed > 0 && colUsed + e.h > IDX_AVAIL) {
      col += 1;
      colUsed = 0;
      if (col > 1) {
        indexPages.push(page);
        indexFree.push(free);
        page = [[], []];
        free = [IDX_AVAIL, IDX_AVAIL];
        col = 0;
      }
    }
    page[col].push(e);
    colUsed += e.h;
    free[col] = Math.max(0, IDX_AVAIL - colUsed);
  }
  if (page[0].length) {
    indexPages.push(page);
    indexFree.push(free);
  }

  return { pages, index, indexPages, indexFree };
}

function pageRange(e: IndexEntry): string {
  return e.from === e.to ? `${e.from}` : `${e.from}-${e.to}`;
}

// ── 3. Final pages ───────────────────────────────────────────────────────────

function indexPagesHtml(indexPages: IndexEntry[][][], indexFree: number[][], code?: string): string {
  return indexPages
    .map((cols, pi) => {
      const col = (entries: IndexEntry[], ci: number) =>
        `<div class="idx-col">${entries.map((e) => idxRowHtml(e.n, e.category, pageRange(e))).join("")}` +
        `${voidHtml(INDEX_COL_W, 2, indexFree[pi][ci])}</div>`;
      return `<section class="page">${indexHeadHtml()}
        <div class="idx-cols">${col(cols[0], 0)}${col(cols[1], 1)}</div>
        <div class="idx-foot"><span class="code">${codeTag(code)}</span><span>${PRICE_LIST_LABEL}</span></div>
      </section>`;
    })
    .join("");
}

function cataloguePagesHtml(pages: Page[], currency: string, code?: string): string {
  return pages
    .map((pg) => {
      const rowsHtml = pg.blocks
        .map((b) => barHtml(b.category, b.continued) + b.rows.map((r) => rowHtml(r.sno, r.name, r.pagesLeaves, r.price, currency)).join(""))
        .join("");
      return `<section class="page">${brandHtml()}
        <table>${COLGROUP}${THEAD}<tbody>${rowsHtml}</tbody></table>${voidHtml(PAGE_INNER_W, 5, pg.free)}
        <div class="foot"><span>Available at : Maaef Enterprises</span><span class="c">${codeTag(code)}</span><span class="r">PAGE ${pg.number}</span></div>
      </section>`;
    })
    .join("");
}

/**
 * Build the merge-ready body HTML: index page(s) followed by catalogue pages.
 * `code` is stamped on every generated page footer so an admin can trace the PDF
 * back to its creator.
 */
export function buildCatalogueHtml(layout: Layout, currency: string, fontCss: string, code?: string): string {
  return doc(fontCss, indexPagesHtml(layout.indexPages, layout.indexFree, code) + cataloguePagesHtml(layout.pages, currency, code));
}

/**
 * Runs inside the browser on the FINAL pages: how far (px) the worst page's
 * footer is pushed past the bottom of its page. Each page is a fixed-height flex
 * column with the footer pinned by margin-top:auto, so content that is too tall
 * shoves the footer down out of the page (it never overlaps it). <= 0 means every
 * page fits. Same self-contained rules as measureInPage.
 */
export function overflowInPage(): number {
  let worst = -Infinity;
  const pages = document.querySelectorAll("section.page");
  for (let i = 0; i < pages.length; i++) {
    const p = pages[i] as HTMLElement;
    const foot = p.querySelector(".foot, .idx-foot");
    if (!foot) continue;
    const inner = p.getBoundingClientRect().bottom - parseFloat(getComputedStyle(p).paddingBottom);
    const over = foot.getBoundingClientRect().bottom - inner;
    if (over > worst) worst = over;
  }
  return worst === -Infinity ? 0 : worst;
}
