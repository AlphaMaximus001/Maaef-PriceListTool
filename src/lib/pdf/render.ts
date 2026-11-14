import "server-only";
import { chromium, type Browser } from "playwright";

/** Launch Chromium the same way every renderer here does. Caller must close it. */
export function launchBrowser(): Promise<Browser> {
  return chromium.launch({
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
    ...(process.env.CHROMIUM_EXECUTABLE_PATH
      ? { executablePath: process.env.CHROMIUM_EXECUTABLE_PATH }
      : {}),
  });
}

/**
 * Render HTML to an A5 PDF with Playwright/Chromium. Runs in the persistent
 * container (brief §2/§10: never on Vercel serverless — the launch + render
 * would time out / the binary isn't there).
 *
 * In this repo's environments Chromium is found via PLAYWRIGHT_BROWSERS_PATH;
 * the Dockerfile installs it for production. An optional explicit path override
 * is honored for images that pin a non-default location.
 *
 * (The catalogue has its own measure → layout → print pipeline in
 * catalogue-render.ts; this is the plain list export.)
 */
export async function renderPdf(
  html: string,
  opts?: { footerTemplate?: string },
): Promise<Buffer> {
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle" });
    const hasFooter = !!opts?.footerTemplate;
    // Chromium renders headerTemplate/footerTemplate inside the page margins on
    // EVERY page — that's the reliable way to pin the employee footer to the
    // bottom. Reserve enough bottom margin for it.
    const pdf = await page.pdf({
      format: "A5",
      printBackground: true,
      displayHeaderFooter: hasFooter,
      headerTemplate: "<div></div>",
      footerTemplate: opts?.footerTemplate ?? "<div></div>",
      margin: { top: "12mm", right: "10mm", bottom: hasFooter ? "22mm" : "12mm", left: "10mm" },
    });
    return pdf;
  } finally {
    await browser.close();
  }
}
