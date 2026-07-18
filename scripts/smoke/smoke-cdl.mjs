/* Requires: npm i --no-save playwright-core; a vite preview on :4173; chromium at /opt/pw-browsers (CI image). */
/* End-to-end smoke for the Commercial Data Layer:
 * 1. Build a messy XLSX (title row, EN/AR header variants) in Node.
 * 2. Log in as admin, open /trade-spend/commercial-data, upload the file.
 * 3. Assert: stored summary + normalized headers surfaced + batch listed.
 * 4. Click "Use in Trade Spend" → transactions land in the trade-spend store.
 * 5. Open /trade-spend/promotions → Data Pool Batches KPI reflects the pool.
 */
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
const require = createRequire('/home/user/Kako/package.json');
const { chromium } = require('playwright-core');
const XLSX = require('xlsx');

const FILE = '/tmp/cdl-smoke-june-sales.xlsx';
const rows = [
  ['Roshen KSA — Monthly Sales Export', '', '', '', '', '', '', '', '', '', ''],
  ['Invoice No', 'رقم العميل', 'Customer Name', 'Bill Date', 'Item Code', 'Product Description', 'Net Sales', 'إجمالي المبيعات', 'Qty in Cases', 'Qty EA', 'Sales Rep'],
  ['INV-9001', '10-024446', 'Smoke Trading Co', '2026-06-05', 'ROS48038', 'JK Coconut 4×1Kg', 1600, 1840, 8, 32, 'Ahmed'],
  ['INV-9001', '10-024446', 'Smoke Trading Co', '2026-06-05', 'ROS48038', 'JK Coconut 4×1Kg', 0, 460, 2, 8, 'Ahmed'],
  ['INV-9002', '10-024447', 'Second Smoke Market', '2026-06-12', 'ROS21635', 'Roshen Wafers Milk 22 X 72G', 900, 1035, 6, 132, 'Salem'],
];
const ws = XLSX.utils.aoa_to_sheet(rows);
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
writeFileSync(FILE, XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));

const errors = [];
let failures = 0;
function check(label, cond, detail = '') {
  console.log((cond ? 'OK   ' : 'FAIL ') + label + (detail ? ` (${detail})` : ''));
  if (!cond) failures = 1;
}

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

// --- admin login ---
await page.goto('http://localhost:4173/trade-spend/login', { waitUntil: 'domcontentloaded' });
await page.selectOption('select:has(option[value="admin"])', 'admin');
await page.fill('input[placeholder="email@example.com"]', 'admin@demo.com');
await page.fill('input[placeholder="••••••••"]', 'Roshen2026');
await page.locator('button', { hasText: 'Login' }).last().click();
await page.waitForURL('**/trade-spend', { timeout: 15000 });

// --- upload through the Commercial Data screen (SPA navigation keeps the
// session user, which is deliberately not persisted) ---
await page.click('a[href="/trade-spend/commercial-data"]');
await page.waitForSelector('[data-testid="cdl-file-input"]', { timeout: 20000, state: 'attached' });
await page.setInputFiles('[data-testid="cdl-file-input"]', FILE);
await page.waitForSelector('text=june-sales.xlsx', { timeout: 20000 });
await page.waitForTimeout(600);
const body = await page.textContent('body');
check('stored summary shown', /added to the shared pool/.test(body));
check('rows/invoices counted', /3 rows/.test(body) && /2 invoices/.test(body));
check('normalized headers surfaced', /Normalized headers/.test(body) && /Cust Account/.test(body));
check('batch listed in pool', /june-sales\.xlsx/.test(body));

// --- hand the batch to Trade Spend (its own untouched pipeline) ---
const useBtn = page.locator('button', { hasText: 'Use in Trade Spend' }).first();
check('use-in-trade-spend button visible', await useBtn.count() === 1);
await useBtn.click();
await page.waitForTimeout(600);
const body2 = await page.textContent('body');
check('batch marked as imported', /In Trade Spend/.test(body2));
const txCount = await page.evaluate(() => {
  let imported = 0;
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && /^ts_.+_transactions$/.test(k)) {
      const tx = JSON.parse(localStorage.getItem(k) || '[]');
      imported += tx.filter((t) => String(t.id).startsWith('tx-')).length;
    }
  }
  return imported;
});
check('transactions appended to trade-spend store', txCount >= 3, `count=${txCount}`);

// double-import guarded
check('double import disabled', await page.locator('button', { hasText: 'Use in Trade Spend' }).count() === 0);

// --- promotions consume the same pool ---
await page.goto('http://localhost:4173/trade-spend/promotions', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('h1', { timeout: 20000 });
await page.waitForTimeout(800);
const body3 = await page.textContent('body');
check('promotions data-pool KPI = 1 batch', /Data Pool Batches/.test(body3));
const kpi = await page
  .locator('p.uppercase:has-text("Data Pool Batches")')
  .locator('xpath=following-sibling::p[1]')
  .first()
  .textContent();
check('pool batch count is 1', String(kpi).trim() === '1', String(kpi).trim());

const jsErrors = errors.filter((e) => !e.includes('Failed to load resource'));
check('zero JS errors across the flow', jsErrors.length === 0);
if (jsErrors.length) console.log('js errors:', jsErrors.slice(0, 5));

await browser.close();
console.log(failures ? '\nCDL SMOKE FAILED' : '\nCDL SMOKE PASSED');
process.exit(failures);
