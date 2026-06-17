import 'server-only';
import chromium from '@sparticuz/chromium';
import puppeteer, { type Browser } from 'puppeteer-core';

// Server-side document PDF renderer. The PDF is produced from the EXISTING print
// page (same template as Print) so the output is identical to the print view —
// Arabic/RTL, company logo, and all document details come for free. A single
// headless Chromium navigates to the authenticated print URL (the caller's auth
// cookies are forwarded) and emits an A4 PDF. Used by /api/pdf/[doc]/[id].
//
// Production (Vercel/serverless): @sparticuz/chromium provides the binary.
// Local dev: set PUPPETEER_EXECUTABLE_PATH to a local Chrome/Chromium.

export interface ForwardedCookie {
  name: string;
  value: string;
}

async function launch(): Promise<Browser> {
  const localPath = process.env.PUPPETEER_EXECUTABLE_PATH;
  if (localPath) {
    return puppeteer.launch({ executablePath: localPath, headless: true, args: ['--no-sandbox'] });
  }
  return puppeteer.launch({
    args: chromium.args,
    executablePath: await chromium.executablePath(),
    headless: true,
  });
}

/**
 * Render an absolute same-origin URL (a print page) to a PDF buffer, forwarding
 * the caller's cookies so the authenticated, RLS-scoped page renders correctly.
 * Throws on any failure — the caller must surface an error and NOT proceed.
 */
export async function renderUrlToPdf(url: string, cookies: ForwardedCookie[]): Promise<Uint8Array> {
  const origin = new URL(url).origin;
  let browser: Browser | null = null;
  try {
    browser = await launch();
    const page = await browser.newPage();
    if (cookies.length > 0) {
      await page.setCookie(...cookies.map((c) => ({ name: c.name, value: c.value, url: origin })));
    }
    await page.goto(url, { waitUntil: 'networkidle0', timeout: 30_000 });
    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '10mm', bottom: '12mm', left: '8mm', right: '8mm' },
    });
    return pdf;
  } finally {
    if (browser) await browser.close();
  }
}
