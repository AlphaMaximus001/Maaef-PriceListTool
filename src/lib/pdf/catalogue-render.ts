import "server-only";
import fs from "node:fs/promises";
import path from "node:path";
import { PDFDocument } from "pdf-lib";
import { launchBrowser } from "./render";
import {
  buildCatalogueHtml,
  buildMeasureHtml,
  fontFaceCss,
  groupItems,
  layoutCatalogue,
  measureInPage,
  overflowInPage,
  type CatalogueItem,
} from "./catalogue";

// Reference page geometry (419.25 x 595.5 pt) — Playwright's page.pdf only
// accepts px/in/cm/mm, so express it in inches (pt / 72). This matches the
// fixed cover/back pages exactly.
const PAGE_W = "5.8229in"; // 419.25pt
const PAGE_H = "8.2708in"; // 595.5pt

async function loadAsset(...parts: string[]): Promise<Buffer> {
  return fs.readFile(path.join(process.cwd(), "public", "pdf", ...parts));
}

let fontCssCache: string | null = null;
async function devanagariFontCss(): Promise<string> {
  if (fontCssCache) return fontCssCache;
  const [regular, bold] = await Promise.all([
    loadAsset("fonts", "noto-sans-devanagari-400.woff2"),
    loadAsset("fonts", "noto-sans-devanagari-700.woff2"),
  ]);
  fontCssCache = fontFaceCss(regular.toString("base64"), bold.toString("base64"));
  return fontCssCache;
}

/**
 * Produce the final catalogue PDF:
 *   front cover (fixed) + generated body (index + priced pages) + back (fixed).
 *
 * The body is laid out in three passes in one browser:
 *   1. measure every row / bar / index entry at its real width,
 *   2. pack pages by measured height and render them,
 *   3. verify no page's content pushes its footer off the page — if one does
 *      (sub-pixel drift between measuring and the real tables), re-pack with that
 *      overflow as extra margin. A row can never print under the footer.
 */
export async function renderCataloguePdf(items: CatalogueItem[], code?: string): Promise<Buffer> {
  const fontCss = await devanagariFontCss();
  const groups = groupItems(items);
  const currency = items[0]?.currency ?? "INR";

  const browser = await launchBrowser();
  let bodyPdf: Buffer;
  try {
    const page = await browser.newPage();
    // Measure and verify in the same media page.pdf() lays out in.
    await page.emulateMedia({ media: "print" });

    await page.setContent(buildMeasureHtml(groups, fontCss), { waitUntil: "load" });
    await page.evaluate(() => document.fonts.ready);
    const metrics = await page.evaluate(measureInPage, {
      groupCount: groups.length,
      itemCounts: groups.map((g) => g.items.length),
    });

    let slack = 0;
    for (let attempt = 0; ; attempt++) {
      const layout = layoutCatalogue(groups, {
        ...metrics,
        avail: metrics.avail - slack,
        idxAvail: metrics.idxAvail - slack,
      });
      await page.setContent(buildCatalogueHtml(layout, currency, fontCss, code), { waitUntil: "load" });
      await page.evaluate(() => document.fonts.ready);
      const over = await page.evaluate(overflowInPage);
      if (over <= 0.5) break;
      if (attempt >= 4) throw new Error(`Catalogue layout still overflows by ${over.toFixed(1)}px`);
      slack += over + 1;
    }

    bodyPdf = await page.pdf({
      width: PAGE_W,
      height: PAGE_H,
      printBackground: true,
      margin: { top: "0", right: "0", bottom: "0", left: "0" },
    });
  } finally {
    await browser.close();
  }

  const [frontBytes, backBytes] = await Promise.all([loadAsset("front.pdf"), loadAsset("back.pdf")]);
  const out = await PDFDocument.create();
  for (const bytes of [frontBytes, bodyPdf, backBytes]) {
    const src = await PDFDocument.load(bytes);
    const copied = await out.copyPages(src, src.getPageIndices());
    copied.forEach((p) => out.addPage(p));
  }
  return Buffer.from(await out.save());
}
