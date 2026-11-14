#!/usr/bin/env node
/**
 * Rebuilds page 2 of public/pdf/front.pdf (the "For / सेवा में" contact page).
 *
 * The page is the original artwork with every word removed
 * (front-page2-artwork.png, 300 dpi) plus live, vector text typeset on top, so
 * the text prints sharp at any size and is edited as text — not by retouching
 * pixels.
 *
 *   To change wording, size or position: edit front-page2.layout.json, then run
 *     node scripts/covers/build-front-page2.cjs
 *
 * Layout units are pixels of the 1747×2482 artwork (300 dpi; 1 px = 0.24 pt).
 * Each text item: x/y is the baseline origin; "anchor": "end" means x is the
 * right edge (the line grows leftwards). Page 1 of front.pdf is kept untouched.
 *
 * Fonts (all SIL Open Font License, see fonts/LICENSE-*.txt) are embedded and
 * subset by Chromium.
 */
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");
const { PDFDocument } = require("pdf-lib");

const DIR = __dirname;
const FRONT = path.join(DIR, "..", "..", "public", "pdf", "front.pdf");
const PAGE_W = 419.25; // pt — matches the existing cover pages
const PAGE_H = 595.5;

const FACES = {
  anton: ["Anton", "anton-latin-400-normal.woff2", 400],
  arimo: ["Arimo", "arimo-latin-700-normal.woff2", 700],
  inter: ["Inter", "inter-latin-700-normal.woff2", 700],
  roboto: ["Roboto", "roboto-latin-700-normal.woff2", 700],
  mont: ["Montserrat", "montserrat-latin-500-normal.woff2", 500],
  narrow: ["PT Sans Narrow", "pt-sans-narrow-latin-400-normal.woff2", 400],
  deva: ["Noto Sans Devanagari", "noto-sans-devanagari-devanagari-700-normal.woff2", 700],
};

const b64 = (file) => fs.readFileSync(path.join(DIR, file)).toString("base64");
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");

function buildHtml(layout) {
  const css = Object.values(FACES)
    .map(([family, file, weight]) =>
      `@font-face{font-family:"${family}";font-weight:${weight};src:url(data:font/woff2;base64,${b64(`fonts/${file}`)}) format("woff2")}`)
    .join("\n");
  const icons = layout.icons
    .map((i) => `<image x="${i.x}" y="${i.y}" width="${i.w}" height="${i.h}" href="data:image/png;base64,${b64(`icon-${i.name}.png`)}"/>`)
    .join("\n");
  const texts = layout.elements
    .map((e) => {
      const face = FACES[e.font];
      if (!face) throw new Error(`Unknown font "${e.font}" for "${e.text}"`);
      const anchor = e.anchor === "end" ? ` text-anchor="end"` : "";
      return `<text x="${e.x}" y="${e.y}"${anchor} font-family="${face[0]}" font-weight="${face[2]}" font-size="${e.size}" fill="${e.fill}">${esc(e.text)}</text>`;
    })
    .join("\n");
  return `<!doctype html><html><head><meta charset="utf-8"><style>${css}
@page{size:${PAGE_W}pt ${PAGE_H}pt;margin:0}
html,body{margin:0;padding:0}
svg{display:block;width:${PAGE_W}pt;height:${PAGE_H}pt}
text{font-kerning:normal;text-rendering:geometricPrecision}
</style></head><body>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1747 2482">
<image x="0" y="0" width="1747" height="2482" href="data:image/png;base64,${b64("front-page2-artwork.png")}"/>
${icons}
${texts}
</svg></body></html>`;
}

async function main() {
  const layout = JSON.parse(fs.readFileSync(path.join(DIR, "front-page2.layout.json"), "utf8"));
  const browser = await chromium.launch(
    process.env.CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.CHROMIUM_EXECUTABLE_PATH } : {},
  );
  let page2;
  try {
    const page = await browser.newPage();
    await page.setContent(buildHtml(layout), { waitUntil: "load" });
    await page.evaluate(() => document.fonts.ready);
    const missing = await page.evaluate((families) =>
      families.filter((f) => !document.fonts.check(`12px "${f}"`)), Object.values(FACES).map((f) => f[0]));
    if (missing.length) throw new Error(`Fonts failed to load: ${missing.join(", ")}`);
    await page.emulateMedia({ media: "print" });
    page2 = await page.pdf({ preferCSSPageSize: true, printBackground: true });
  } finally {
    await browser.close();
  }

  const front = await PDFDocument.load(fs.readFileSync(FRONT));
  const rendered = await PDFDocument.load(page2);
  if (rendered.getPageCount() !== 1) throw new Error(`Page 2 rendered to ${rendered.getPageCount()} pages`);

  const out = await PDFDocument.create();
  const [cover] = await out.copyPages(front, [0]);
  out.addPage(cover);
  // Chromium rounds the page to whole CSS pixels; draw it onto the exact cover size.
  const [embedded] = await out.embedPdf(rendered, [0]);
  out.addPage([PAGE_W, PAGE_H]).drawPage(embedded, { x: 0, y: 0, width: PAGE_W, height: PAGE_H });
  fs.writeFileSync(FRONT, await out.save());
  console.log(`Rebuilt page 2 of ${path.relative(process.cwd(), FRONT)}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
