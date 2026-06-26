// Preview/analysis for an agent raw-data file (item 9 of the mapping review).
// Usage:  node scripts/preview-import.mjs <path-to-file.xlsx> [sheetName]
// Requires: npm i xlsx   (not added to the app; run ad hoc)
//
// Produces: row count, unique invoices/customers/items, date range,
// channel breakdown, return-row count, SLA-actual sum, and discount/VAT
// reconciliation hints (to confirm whether Total Line Discount is already
// reflected in Invoice Amount ex Vat).

import { readFileSync } from "node:fs";
import * as XLSX from "xlsx";

const file = process.argv[2];
const sheetName = process.argv[3] || "Row Data";
if (!file) {
  console.error("Usage: node scripts/preview-import.mjs <file.xlsx> [sheet]");
  process.exit(1);
}

const wb = XLSX.read(readFileSync(file), { cellDates: false });
const ws = wb.Sheets[sheetName];
if (!ws) {
  console.error(`Sheet "${sheetName}" not found. Sheets: ${wb.SheetNames.join(", ")}`);
  process.exit(1);
}
const rows = XLSX.utils.sheet_to_json(ws, { defval: null, raw: true });

const C = {
  invoice: "Invoice", invoiceKey: "Invoice_Key", cust: "Cust Account",
  item: "Item Id", date: "Invoice Date", channel: "Channel", depot: "Depot",
  exVat: "Invoice Amount ex Vat", vat: "Sales_Total_Tax", net: "Net Amount",
  disc: "Total Line Discount", isReturn: "IsReturn",
};

const excelSerialToISO = (n) => {
  if (typeof n !== "number" || !isFinite(n)) return null;
  const ms = Math.round((n - 25569) * 86400 * 1000); // 1899-12-30 epoch
  return new Date(ms).toISOString().slice(0, 10);
};

const uniq = (k) => new Set(rows.map((r) => r[k]).filter((v) => v != null)).size;
const num = (v) => (typeof v === "number" ? v : parseFloat(String(v ?? "").replace(/[^0-9.\-]/g, "")) || 0);

const dates = rows.map((r) => excelSerialToISO(r[C.date])).filter(Boolean).sort();
const channelBreak = {};
let returnRows = 0, slaSum = 0, reconcileOff = 0;
for (const r of rows) {
  const ch = r[C.channel] ?? "(blank)";
  channelBreak[ch] = (channelBreak[ch] || 0) + 1;
  const isRet = String(r[C.isReturn] ?? "").trim().toLowerCase();
  if (isRet === "yes" || isRet === "y" || num(r[C.exVat]) < 0) returnRows++;
  slaSum += num(r[C.exVat]);
  // reconciliation: does Net ≈ exVat + VAT (discount already in exVat) ?
  const expectNet = num(r[C.exVat]) + num(r[C.vat]);
  if (Math.abs(expectNet - num(r[C.net])) > 0.05) reconcileOff++;
}

console.log("=== Import preview ===");
console.log("Sheet:", sheetName);
console.log("Row count:", rows.length);
console.log("Unique invoices:", uniq(C.invoice));
console.log("Unique invoice keys:", uniq(C.invoiceKey));
console.log("Unique customers:", uniq(C.cust));
console.log("Unique items:", uniq(C.item));
console.log("Date range:", dates[0], "→", dates[dates.length - 1]);
console.log("Return rows:", returnRows);
console.log("SLA actual (SUM ex-VAT, incl negative returns):", slaSum.toFixed(2));
console.log("Channel breakdown:", channelBreak);
console.log(
  `Net vs (exVat+VAT) mismatches: ${reconcileOff}/${rows.length}`,
  reconcileOff === 0
    ? "→ Net = exVat + VAT, so discount is already reflected in ex-VAT (use discount_already_deducted)."
    : "→ mismatches found; inspect whether discount sits outside ex-VAT."
);
console.log("Duplicate-line check: compare Row count vs Unique invoice keys above.");
