// Parser for the ERP "Van Stock" Excel export.
//
// The ERP sometimes emits a "metadata" row above the real header row, so we
// can't blindly use row 1 as headers. Instead we read the sheet as a raw
// matrix, scan the first ~15 rows for one containing "Item Number", and use
// that as the header. The detected index is reported in stats.header_row_index
// for downstream debugging.
//
// Only 9 columns out of 21 are read; everything else (incl. cost / financials)
// is discarded. Expiry dates are parsed STRICTLY as US format MM/DD/YYYY
// (or M/D/YYYY) — Excel numeric serials are also accepted.

import * as XLSX from 'xlsx';

const pick = (row, ...keys) => {
  for (const k of keys) {
    if (row[k] !== undefined && row[k] !== null && row[k] !== '') return row[k];
  }
  const lower = {};
  for (const rk of Object.keys(row)) lower[rk.toLowerCase().trim()] = row[rk];
  for (const k of keys) {
    const v = lower[k.toLowerCase().trim()];
    if (v !== undefined && v !== null && v !== '') return v;
  }
  return '';
};

const cleanStr = (v) =>
  v === null || v === undefined ? '' : String(v).trim();

const toNum = (v) => {
  if (typeof v === 'number') return v;
  if (v === null || v === undefined || v === '') return 0;
  const n = parseFloat(String(v).replace(/,/g, '').trim());
  return isFinite(n) ? n : 0;
};

// → YYYY-MM-DD or null
const parseMDY = (v) => {
  if (v === null || v === undefined || v === '') return null;
  if (v instanceof Date && !isNaN(v.getTime())) {
    return v.toISOString().slice(0, 10);
  }
  if (typeof v === 'number') {
    const d = XLSX.SSF.parse_date_code(v);
    if (d && d.y && d.m && d.d) {
      return `${String(d.y).padStart(4, '0')}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`;
    }
    return null;
  }
  const s = String(v).trim();
  const m = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})/);
  if (!m) return null;
  let [, mo, d, y] = m;
  const moI = parseInt(mo, 10);
  const dI = parseInt(d, 10);
  if (moI < 1 || moI > 12 || dI < 1 || dI > 31) return null;
  if (y.length === 2) y = (parseInt(y, 10) >= 70 ? '19' : '20') + y;
  return `${y.padStart(4, '0')}-${String(moI).padStart(2, '0')}-${String(dI).padStart(2, '0')}`;
};

// Scan up to `limit` rows for one containing "Item Number" (case-insensitive).
// Returns the index of the header row, or -1 if not found.
const findHeaderRow = (matrix, limit = 15) => {
  const HINT = 'item number';
  const stop = Math.min(limit, matrix.length);
  for (let i = 0; i < stop; i++) {
    const row = matrix[i] || [];
    for (const cell of row) {
      if (cell !== null && cell !== undefined) {
        if (String(cell).trim().toLowerCase() === HINT) return i;
      }
    }
  }
  return -1;
};

// Return { rows, stats } where:
//   rows  — array of column-mapped objects ready for INSERT into van_stock.
//   stats — { total, imported, skipped: { inactive, missing, bad_date },
//             warehouses_seen: [...], header_row_index: N,
//             header_row_preview: [...] }
export const parseVanStockExcel = async (file) => {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array', cellDates: true });
  const ws = wb.Sheets[wb.SheetNames[0]];

  // Read the sheet as a 2-D array of raw cells so we control where headers
  // start. defval keeps empty cells as '' so column positions are stable.
  const matrix = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

  const headerRowIdx = findHeaderRow(matrix, 15);
  if (headerRowIdx < 0) {
    throw new Error(
      'Could not find an "Item Number" header in the first 15 rows of the file.',
    );
  }

  const headers = (matrix[headerRowIdx] || []).map((h) =>
    String(h ?? '').trim(),
  );

  // Build objects from the rows below the header row.
  const dataRows = [];
  for (let i = headerRowIdx + 1; i < matrix.length; i++) {
    const row = matrix[i] || [];
    // Skip totally empty rows.
    if (row.every((c) => c === '' || c === null || c === undefined)) continue;
    const obj = {};
    headers.forEach((h, j) => {
      if (h) obj[h] = row[j] !== undefined ? row[j] : '';
    });
    dataRows.push(obj);
  }

  const out = [];
  const warehouses = new Set();
  let imported = 0;
  let skippedInactive = 0;
  let skippedMissing = 0;
  let skippedBadDate = 0;

  for (const row of dataRows) {
    const status = cleanStr(pick(row, 'Status'));
    if (status && status.toLowerCase() !== 'active') {
      skippedInactive++;
      continue;
    }

    const itemNumber = cleanStr(pick(row, 'Item Number', 'ItemNumber', 'item_number'));
    const itemName   = cleanStr(pick(row, 'Item Name', 'ItemName', 'item_name'));
    const warehouse  = cleanStr(pick(row, 'Warehouse', 'warehouse_code'));
    const expiryRaw  = pick(row, 'Expiry Date', 'ExpiryDate', 'expiry_date');

    if (!itemNumber || !warehouse || expiryRaw === '' || expiryRaw === null) {
      skippedMissing++;
      continue;
    }

    const expiryDate = parseMDY(expiryRaw);
    if (!expiryDate) {
      skippedBadDate++;
      continue;
    }

    out.push({
      item_number: itemNumber,
      item_name: itemName || itemNumber,
      sk_unit: cleanStr(pick(row, 'SK Unit', 'SKUnit', 'sk_unit')) || null,
      available_qty: toNum(pick(row, 'Available Physical', 'AvailablePhysical', 'available_qty')),
      site: cleanStr(pick(row, 'Site')) || null,
      warehouse_code: warehouse,
      batch_number: cleanStr(pick(row, 'Batch Number', 'BatchNumber', 'batch_number')) || null,
      expiry_date: expiryDate,
      salesman_name_from_excel:
        cleanStr(pick(row, 'Sales Man', 'SalesMan', 'salesman_name_from_excel')) || null,
    });

    warehouses.add(warehouse);
    imported++;
  }

  return {
    rows: out,
    stats: {
      total: dataRows.length,
      imported,
      skipped: {
        inactive: skippedInactive,
        missing: skippedMissing,
        bad_date: skippedBadDate,
      },
      warehouses_seen: [...warehouses],
      header_row_index: headerRowIdx,
      header_row_preview: headers.filter(Boolean).slice(0, 12),
    },
  };
};
