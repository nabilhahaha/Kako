#!/usr/bin/env node
/**
 * Commercial Data Layer — pipeline verification.
 *
 * Exercises the shared ingestion codepath (verbatim header repair → frozen
 * RawParser → frozen invoicesFromParsed) under Node with a synthetic export
 * using messy real-world headers (English variants, Arabic variants, a
 * title row) and asserts:
 *   - header repair renames to the canonical labels
 *   - the frozen parser accepts the repaired matrix
 *   - FREE/PAID/return classification matches the reference rules
 *   - the missing-columns failure lists the file's actual headers
 *
 * Usage: node scripts/verify-data-layer.mjs
 */
import { repairHeaders } from '../src/lib/promotions/frozen/header-repair.js';
import { RawParser } from '../src/lib/promotions/frozen/raw-parser.js';
import { invoicesFromParsed } from '../src/lib/promotions/frozen/data-pool.js';

let failures = 0;
function check(label, cond, detail = '') {
  if (cond) console.log(`OK   ${label}${detail ? ` (${detail})` : ''}`);
  else { console.error(`FAIL ${label}${detail ? ` (${detail})` : ''}`); failures++; }
}

/* Messy export: title row + English/Arabic header variants. */
const matrix = [
  ['Roshen KSA — Monthly Sales Export', '', '', '', '', '', '', '', '', '', ''],
  ['Invoice No', 'رقم العميل', 'Customer Name', 'Bill Date', 'Item Code', 'Product Description', 'Net Sales', 'إجمالي المبيعات', 'Qty in Cases', 'Qty EA', 'Sales Rep'],
  ['INV-1001', '10-000001', 'Test Trading Co', '2026-06-05', 'ROS21635', 'Roshen Wafers Milk 22 X 72G', 1200, 1380, 10, 220, 'Ahmed'],
  ['INV-1001', '10-000001', 'Test Trading Co', '2026-06-05', 'ROS21635', 'Roshen Wafers Milk 22 X 72G', 0, 138, 1, 22, 'Ahmed'],
  ['INV-1002', '10-000002', 'Second Market', '2026-06-12', 'ROS48038', 'JK Coconut 4×1Kg', 800, 920, 4, 16, 'Salem'],
  ['CN-2001', '10-000001', 'Test Trading Co', '2026-06-20', 'ROS21635', 'Roshen Wafers Milk 22 X 72G', -240, -276, -2, -44, 'Ahmed'],
];

const { rows, renamed } = repairHeaders(matrix);
check('title row skipped (header row promoted)', String(rows[0][0]) === 'Invoice', String(rows[0][0]));
check('renames applied', renamed.length >= 6, `${renamed.length} renamed`);
check('Arabic gross header mapped', renamed.some((r) => r.to === 'Gross Sales value'));
check('Arabic customer header mapped', renamed.some((r) => r.to === 'Cust Account'));

const parsed = RawParser.parse(rows);
check('parsed rows', parsed.nRows === 4, `${parsed.nRows}`);
check('parsed invoices', parsed.nInv === 3, `${parsed.nInv}`);
check('FREE line classified (net=0)', parsed.lines.filter((l) => l.type === 'FREE').length === 1);
check('return detected via CN prefix', parsed.lines.some((l) => l.isReturn && l.inv === 'CN-2001'));
check('pieces (Qty Each) captured', parsed.lines[0].each === 220, String(parsed.lines[0].each));

const invoices = invoicesFromParsed(parsed);
check('pool invoices assembled', invoices.length === 3, `${invoices.length}`);
const inv1 = invoices.find((i) => i.inv === 'INV-1001');
check('invoice net = paid lines only', inv1.net === 1200, String(inv1.net));
check('invoice free value from FREE gross', inv1.freeval === 138, String(inv1.freeval));
const cn = invoices.find((i) => i.inv === 'CN-2001');
check('credit note flagged', cn.isCN === true);

/* Validation failure: drop the Net column → reference error message. */
const broken = matrix.map((r) => r.filter((_, i) => i !== 6));
let threw = null;
try {
  RawParser.parse(repairHeaders(broken).rows);
} catch (e) {
  threw = e;
}
check('missing required column rejected', threw != null);
check('reference error message shape', /Missing required columns/.test(String(threw && threw.message)),
  String(threw && threw.message));

if (failures) {
  console.error(`\n${failures} data-layer check(s) FAILED.`);
  process.exit(1);
}
console.log('\nCommercial Data Layer pipeline verified against the reference behavior.');
