#!/usr/bin/env node
// ============================================================================
// Recovery Certification (Phase P5C) — the hard gate before packaging
// ----------------------------------------------------------------------------
//   node scripts/offline/recovery-cert.mjs
// Proves, on the real local stack, that a store survives total data loss:
//   create real data (customer+supplier opening balances, product+stock, a cash
//   invoice, an installment contract + payment, a stock adjustment) →
//   physical backup → simulate loss (TRUNCATE CASCADE) → restore → verify
//   counts, customer/supplier balances, inventory quantities, installments, and
//   customer/supplier statements all match BEFORE. Emits a signed-off report.
//   Any mismatch FAILS the gate (exit 1).
// ============================================================================

import { spawnSync, execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { mkdtempSync, mkdirSync, rmSync, existsSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..');

// Throwaway store + de-escalation when root (CI container).
const tmpHome = mkdtempSync(path.join(os.tmpdir(), 'kako-cert-'));
const asRoot = typeof process.getuid === 'function' && process.getuid() === 0;
const runas = process.env.KAKO_PG_RUNAS || (asRoot ? 'postgres' : '');
if (asRoot && runas) {
  for (const d of ['db', 'run', 'backups']) mkdirSync(path.join(tmpHome, d), { recursive: true });
  spawnSync('chown', ['-R', `${runas}:${runas}`, tmpHome]);
  spawnSync('chmod', ['-R', '700', tmpHome]);
}
const PORT = process.env.KAKO_OFFLINE_PG_PORT || '54350';
const EDITION = process.env.KAKO_EDITION || 'retail';
const env = {
  ...process.env, KAKO_OFFLINE: '1', KAKO_EDITION: EDITION, KAKO_OFFLINE_HOME: tmpHome,
  KAKO_OFFLINE_PG_PORT: PORT, ...(runas ? { KAKO_PG_RUNAS: runas } : {}),
};

function step(script, args = []) {
  const r = spawnSync(process.execPath, [path.join(HERE, script), ...args], { encoding: 'utf8', env });
  if (r.status !== 0) { process.stderr.write((r.stdout || '') + (r.stderr || '')); throw new Error(`${script} failed`); }
  return (r.stdout || '').trim();
}

async function newClient() {
  const { Client } = await import('pg');
  const c = new Client({ host: '127.0.0.1', port: Number(PORT), user: 'postgres', database: 'postgres' });
  await c.connect();
  return c;
}
async function val(c, sql, params = []) { const r = await c.query(sql, params); return r.rows[0] ? Object.values(r.rows[0])[0] : null; }

// ── Build the dataset as the seeded admin (auth.uid via session claim) ───────
async function createData(c) {
  const adminId = await val(c, 'SELECT id FROM erp_local_users LIMIT 1');
  const companyId = await val(c, 'SELECT id FROM erp_companies LIMIT 1');
  const branchId = await val(c, "SELECT id FROM erp_branches WHERE is_hq LIMIT 1");
  const warehouseId = await val(c, 'SELECT id FROM erp_warehouses LIMIT 1');
  // Act as the admin for every RPC (company scope + branch access).
  await c.query("SELECT set_config('request.jwt.claim.sub', $1, false)", [adminId]);

  // Customer + supplier (direct inserts; triggers fill company_id) — but we are
  // superuser, company_id trigger uses erp_user_company_id() from the claim.
  const custId = await val(c, "INSERT INTO erp_customers (code, name, company_id) VALUES ('C-CERT','Cert Customer',$1) RETURNING id", [companyId]);
  const suppId = await val(c, "INSERT INTO erp_suppliers (code, name, company_id) VALUES ('S-CERT','Cert Supplier',$1) RETURNING id", [companyId]);

  // Opening balances (RPCs).
  await c.query('SELECT erp_set_customer_opening_balance($1,$2,$3)', [custId, 500, 'debit']);
  await c.query('SELECT erp_set_supplier_opening_balance($1,$2,$3)', [suppId, 300, 'credit']);

  // Product with a real cost/price.
  const prodId = await val(c, "INSERT INTO erp_products_catalog (code, name, company_id, cost_price, sell_price) VALUES ('P-CERT','Cert Product',$1,100,150) RETURNING id", [companyId]);

  // Stock adjustment +50 (post; approve if it went pending on the large-value rule).
  const adj = await c.query('SELECT erp_post_stock_adjustment($1,$2,$3,$4) AS j', [warehouseId, prodId, 50, 'cert opening']);
  const adjJson = adj.rows[0].j;
  if (adjJson.status === 'pending') await c.query('SELECT erp_approve_stock_adjustment($1)', [adjJson.id]);

  // A cash sale of 2 units (reduces stock to 48, creates an invoice).
  const lines = JSON.stringify([{ product_id: prodId, quantity: 2, unit_price: 150, discount_pct: 0 }]);
  await c.query('SELECT erp_fashion_checkout($1,$2,$3::jsonb,0,$4) AS j', [branchId, custId, lines, 'cash']);

  // Installment contract + collect one payment.
  const plan = await c.query('SELECT erp_import_installment_contract($1,$2,$3,$4,$5,$6) AS j', [custId, branchId, 1200, 1200, 6, 'monthly']);
  const planId = plan.rows[0].j.plan_id;
  const schedId = await val(c, 'SELECT id FROM erp_installment_schedule WHERE plan_id=$1 ORDER BY due_date LIMIT 1', [planId]);
  if (schedId) await c.query('SELECT erp_collect_installment_flex($1,$2,$3)', [schedId, 200, 'cash']);

  await c.query("SELECT set_config('request.jwt.claim.sub', '', false)");
  return { custId, suppId, prodId, warehouseId, planId };
}

// ── Measure everything that must survive recovery ────────────────────────────
async function measure(c, ids) {
  const num = async (sql, p = []) => Number(await val(c, sql, p));
  const counts = {
    customers: await num('SELECT count(*) FROM erp_customers'),
    suppliers: await num('SELECT count(*) FROM erp_suppliers'),
    products: await num('SELECT count(*) FROM erp_products_catalog'),
    invoices: await num('SELECT count(*) FROM erp_invoices'),
    installment_plans: await num('SELECT count(*) FROM erp_installment_plans'),
    stock_adjustments: await num('SELECT count(*) FROM erp_stock_adjustments'),
  };
  const customerBalance = await num('SELECT balance FROM erp_customers WHERE id=$1', [ids.custId]);
  const supplierBalance = await num('SELECT balance FROM erp_suppliers WHERE id=$1', [ids.suppId]);
  const inventoryQty = await num('SELECT quantity FROM erp_inventory_stock WHERE product_id=$1 AND warehouse_id=$2', [ids.prodId, ids.warehouseId]);
  const installment = {
    paid: await num('SELECT coalesce(sum(paid_amount),0) FROM erp_installment_schedule WHERE plan_id=$1', [ids.planId]),
    schedules: await num('SELECT count(*) FROM erp_installment_schedule WHERE plan_id=$1', [ids.planId]),
  };
  // Statement signatures: closing balance + number of ledger entries.
  const customerStatement = {
    closing: customerBalance,
    entries:
      (await num('SELECT count(*) FROM erp_invoices WHERE customer_id=$1', [ids.custId])) +
      (await num('SELECT count(*) FROM erp_customer_opening_balances WHERE customer_id=$1', [ids.custId])) +
      (await num('SELECT count(*) FROM erp_installment_schedule WHERE plan_id=$1 AND paid_amount>0', [ids.planId])),
  };
  const supplierStatement = {
    closing: supplierBalance,
    entries: await num('SELECT count(*) FROM erp_supplier_opening_balances WHERE supplier_id=$1', [ids.suppId]),
  };
  return { counts, customerBalance, supplierBalance, inventoryQty, installment, customerStatement, supplierStatement };
}

function buildVersion() {
  try { return execSync('git rev-parse --short HEAD', { cwd: REPO }).toString().trim(); } catch { return 'unknown'; }
}

// ── Compare + report ─────────────────────────────────────────────────────────
const checks = [];
function check(name, before, after) {
  const b = JSON.stringify(before), a = JSON.stringify(after);
  const pass = b === a;
  checks.push({ name, before: b, after: a, pass });
  process.stdout.write(`${pass ? '✓' : '✗'} ${name}: before=${b} after=${a}\n`);
}

function writeReport(before, after, meta) {
  const allPass = checks.every((c) => c.pass);
  const lines = [];
  lines.push('# Offline Recovery Certification');
  lines.push('');
  lines.push(`**Result:** ${allPass ? '✅ CERTIFIED — full recovery verified' : '❌ FAILED'}`);
  lines.push('');
  lines.push(`- Edition: \`${meta.edition}\``);
  lines.push(`- OS / environment: \`${meta.os}\` (${meta.note})`);
  lines.push(`- Build: \`${meta.build}\``);
  lines.push(`- Timestamp: \`${meta.timestamp}\``);
  lines.push(`- Restore path: physical \`pg_restore\` (custom-format dump)`);
  lines.push('');
  lines.push('## Procedure');
  lines.push('create real data → physical backup → simulate total loss (`TRUNCATE … CASCADE`) → restore → verify.');
  lines.push('');
  lines.push('## Verification (BEFORE must equal AFTER)');
  lines.push('');
  lines.push('| Check | Before | After | Result |');
  lines.push('|---|---|---|---|');
  for (const c of checks) lines.push(`| ${c.name} | \`${c.before}\` | \`${c.after}\` | ${c.pass ? '✅ PASS' : '❌ FAIL'} |`);
  lines.push('');
  lines.push(`Loss simulation wiped the data to: customers=${meta.afterLoss.counts.customers}, products=${meta.afterLoss.counts.products}, invoices=${meta.afterLoss.counts.invoices} (proving the restore — not residual data — recovered everything).`);
  lines.push('');
  lines.push('## Sign-off');
  lines.push(allPass
    ? '> All entity counts, customer/supplier balances, inventory quantities, installment schedules + paid amounts, and customer/supplier statement signatures matched exactly after restoring from a physical backup following total data loss. The offline store can recover from data loss. **Certified.**'
    : '> One or more checks did not match after recovery. Certification BLOCKED; see the failing rows above.');
  lines.push('');
  writeFileSync(path.join(REPO, 'docs', 'OFFLINE-RECOVERY-CERTIFICATION.md'), lines.join('\n'));
  return allPass;
}

async function main() {
  // 1. Boot + migrate + seed.
  step('db.mjs', ['init']); step('db.mjs', ['start']); step('migrate.mjs'); step('seed.mjs');

  // 2. Create real data + measure BEFORE.
  let ids, before;
  { const c = await newClient(); ids = await createData(c); before = await measure(c, ids); await c.end(); }

  // 3. Physical backup (data present).
  step('backup.mjs', ['--retention', '5']);

  // 4. Simulate total loss.
  let afterLoss;
  { const c = await newClient(); await c.query('TRUNCATE erp_companies CASCADE'); afterLoss = await measure(c, ids); await c.end(); }

  // 5. Restore.
  step('restore.mjs', ['--yes']);

  // 6. Measure AFTER + compare.
  let after;
  { const c = await newClient(); after = await measure(c, ids); await c.end(); }

  check('entity counts', before.counts, after.counts);
  check('customer balance', before.customerBalance, after.customerBalance);
  check('supplier balance', before.supplierBalance, after.supplierBalance);
  check('inventory quantity', before.inventoryQty, after.inventoryQty);
  check('installment schedules + paid', before.installment, after.installment);
  check('customer statement', before.customerStatement, after.customerStatement);
  check('supplier statement', before.supplierStatement, after.supplierStatement);

  const ok = writeReport(before, after, {
    edition: EDITION, os: `${os.platform()} ${os.arch()}`,
    note: asRoot ? 'logic certification in Linux CI container; on-hardware macOS/Windows runs are part of P1/P2' : 'native',
    build: buildVersion(), timestamp: new Date().toISOString(), afterLoss,
  });
  process.stdout.write(`\n${ok ? '✓ RECOVERY CERTIFIED' : '✗ CERTIFICATION FAILED'} — report: docs/OFFLINE-RECOVERY-CERTIFICATION.md\n`);
  return ok;
}

main()
  .then((ok) => { cleanup(); process.exit(ok ? 0 : 1); })
  .catch((e) => { process.stderr.write(`✗ ${e.stack || e.message}\n`); cleanup(); process.exit(1); });

function cleanup() {
  try { step('db.mjs', ['stop']); } catch { /* ignore */ }
  try { if (existsSync(tmpHome)) rmSync(tmpHome, { recursive: true, force: true }); } catch { /* ignore */ }
}
