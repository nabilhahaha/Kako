// Excel parsing + aggregation.
import * as XLSX from 'xlsx';

// Try to find the right column by trying several common header variants.
const pick = (row, ...keys) => {
  for (const k of keys) {
    if (row[k] !== undefined && row[k] !== null && row[k] !== '') return row[k];
  }
  // Case-insensitive fallback.
  const lower = {};
  for (const rk of Object.keys(row)) lower[rk.toLowerCase().trim()] = row[rk];
  for (const k of keys) {
    const v = lower[k.toLowerCase().trim()];
    if (v !== undefined && v !== null && v !== '') return v;
  }
  return '';
};

const toNum = (v) => {
  if (typeof v === 'number') return v;
  if (v === null || v === undefined || v === '') return 0;
  const n = parseFloat(String(v).replace(/,/g, '').trim());
  return isFinite(n) ? n : 0;
};

const cleanStr = (v) => (v === null || v === undefined ? '' : String(v).trim());

// Returns:
//  { agg: nested object, stats: { salesmen, customers, items, rows } }
export const parseExcel = async (file) => {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });

  // First pass: build a sum map keyed by salesman|cust|item.
  const sumMap = new Map();
  const meta = new Map(); // key → { salesman, custAcc, custName, itemId, itemDesc }

  for (const row of rows) {
    const salesman = cleanStr(pick(row, 'Sales Man', 'SalesMan', 'Salesman', 'sales_man'));
    const custAcc = cleanStr(pick(row, 'Cust Account', 'CustAccount', 'Customer Account', 'cust_account'));
    const custName = cleanStr(pick(row, 'Cust Name', 'CustName', 'Customer Name', 'cust_name'));
    const itemId = cleanStr(pick(row, 'Item Id', 'ItemId', 'Item ID', 'SKU', 'item_id'));
    const itemDesc = cleanStr(pick(row, 'Item Description', 'ItemDescription', 'Description', 'item_description'));
    const qty = toNum(pick(row, 'Inv Qty Cases', 'InvQtyCases', 'Qty Cases', 'Qty', 'inv_qty_cases'));

    if (!salesman || !custAcc || !itemId) continue;

    const key = `${salesman}||${custAcc}||${itemId}`;
    sumMap.set(key, (sumMap.get(key) || 0) + qty);
    if (!meta.has(key)) meta.set(key, { salesman, custAcc, custName, itemId, itemDesc });
  }

  // Second pass: build the nested aggregation, skipping net <= 0.
  const agg = {};
  let salesmenSet = new Set();
  let customersSet = new Set();
  let itemsCount = 0;

  for (const [key, qty] of sumMap.entries()) {
    if (qty <= 0) continue;
    const m = meta.get(key);
    if (!m) continue;

    if (!agg[m.salesman]) agg[m.salesman] = {};
    if (!agg[m.salesman][m.custAcc]) {
      agg[m.salesman][m.custAcc] = { name: m.custName, items: {} };
    }
    // Update customer name if we have a better one.
    if (m.custName && !agg[m.salesman][m.custAcc].name) {
      agg[m.salesman][m.custAcc].name = m.custName;
    }
    agg[m.salesman][m.custAcc].items[m.itemId] = {
      desc: m.itemDesc,
      qty: Math.round(qty * 1000) / 1000,
    };

    salesmenSet.add(m.salesman);
    customersSet.add(`${m.salesman}||${m.custAcc}`);
    itemsCount += 1;
  }

  return {
    agg,
    stats: {
      salesmen: salesmenSet.size,
      customers: customersSet.size,
      items: itemsCount,
      rows: rows.length,
    },
  };
};

// Convenience helpers used by the salesman flow.
export const getSalesmen = (agg) => Object.keys(agg || {}).sort((a, b) => a.localeCompare(b));

export const getCustomersFor = (agg, salesman) => {
  const customers = agg?.[salesman] || {};
  return Object.entries(customers)
    .map(([acc, c]) => ({ acc, name: c.name || acc }))
    .sort((a, b) => a.name.localeCompare(b.name));
};

export const getItemsFor = (agg, salesman, custAcc) => {
  const items = agg?.[salesman]?.[custAcc]?.items || {};
  return Object.entries(items)
    .map(([id, it]) => ({ id, desc: it.desc || id, qty: it.qty }))
    .sort((a, b) => (b.qty || 0) - (a.qty || 0));
};
