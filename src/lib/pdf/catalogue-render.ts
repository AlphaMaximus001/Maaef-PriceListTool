import "server-only";
import fs from "node:fs/promises";
import path from "node:path";
import { PDFDocument } from "pdf-lib";
import { renderSizedPdf } from "./render";

// Reference page geometry (419.25 x 595.5 pt) — Playwright's page.pdf only
// accepts px/in/cm/mm, so express it in inches (pt / 72). This matches the
// fixed cover/back pages exactly.
const PAGE_W = "5.8229in"; // 419.25pt
const PAGE_H = "8.2708in"; // 595.5pt

async function loadAsset(name: string): Promise<Buffer> {
  return fs.readFile(path.join(process.cwd(), "public", "pdf", name));
}

/**
 * Produce the final catalogue PDF:
 *   front cover (fixed) + generated body (index + priced pages) + back (fixed).
 * The cover/back pages are copied verbatim from the reference PDFs (vector,
 * unchanged); only the middle is generated from live data.
 */
export async function renderCataloguePdf(bodyHtml: string): Promise<Buffer> {
  const [bodyPdf, frontBytes, backBytes] = await Promise.all([
    renderSizedPdf(bodyHtml, PAGE_W, PAGE_H),
    loadAsset("front.pdf"),
    loadAsset("back.pdf"),
  ]);

  const out = await PDFDocument.create();
  for (const bytes of [frontBytes, bodyPdf, backBytes]) {
    const src = await PDFDocument.load(bytes);
    const copied = await out.copyPages(src, src.getPageIndices());
    copied.forEach((p) => out.addPage(p));
  }
  return Buffer.from(await out.save());
}
