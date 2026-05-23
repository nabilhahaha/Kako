import * as XLSX from 'xlsx';
import type { SalesDataset } from './salesTypes';

const REQUIRED_COLS = [
  'Invoice Date', 'Cust Account', 'Item Description',
  'Sales Man', 'Inv Qty Cases', 'Invoice Amount ex Vat',
];

const NORMALIZE_MAP: Record<string, Record<string, string>> = {
  'Customer Channel': {
    'sweet shop': 'Sweet Shop', 'SWEET SHOP': 'Sweet Shop',
    'Sweetshop': 'Sweet Shop', 'sweetshop': 'Sweet Shop',
    'wholesale': 'Wholesale', 'WHOLESALE': 'Wholesale',
  },
  'NSM': {
    'ahmed ghaleb': 'Ahmed Ghaleb', 'Ahmed ghaleb': 'Ahmed Ghaleb',
    'Ahmed Ghaled': 'Ahmed Ghaleb', 'ahmed Ghaleb': 'Ahmed Ghaleb',
    'ameen': 'Ameen', 'AMEEN': 'Ameen',
  },
};

function norm(col: string, val: unknown): string {
  if (val == null || val === '') return '';
  const v = String(val);
  return NORMALIZE_MAP[col]?.[v] ?? v;
}

function excelDateToISO(val: unknown): string | null {
  if (val == null) return null;
  if (typeof val === 'number') {
    const ms = (val - 25569) * 86400 * 1000;
    const d = new Date(ms);
    const y = d.getUTCFullYear();
    const mo = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    return `${y}-${mo}-${day}`;
  }
  if (typeof val === 'string') {
    const m = val.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (m) return `${m[1]}-${String(parseInt(m[2])).padStart(2, '0')}-${String(parseInt(m[3])).padStart(2, '0')}`;
    const m2 = val.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
    if (m2) return `${m2[3]}-${String(parseInt(m2[1])).padStart(2, '0')}-${String(parseInt(m2[2])).padStart(2, '0')}`;
  }
  return null;
}

const MONTH_NAMES: Record<string, number> = {
  january: 1, jan: 1, february: 2, feb: 2, march: 3, mar: 3,
  april: 4, apr: 4, may: 5, june: 6, jun: 6, july: 7, jul: 7,
  august: 8, aug: 8, september: 9, sep: 9, sept: 9,
  october: 10, oct: 10, november: 11, nov: 11, december: 12, dec: 12,
};

function buildDateFromColumns(row: Record<string, unknown>): string | null {
  const day = row['Day'];
  const monthRaw = row['Month'];
  const year = row['Year'];
  if (day == null || monthRaw == null || year == null) return null;

  let monthNum: number | undefined;
  if (typeof monthRaw === 'number') monthNum = monthRaw;
  else if (typeof monthRaw === 'string') monthNum = MONTH_NAMES[monthRaw.toLowerCase().trim()];
  if (!monthNum || monthNum < 1 || monthNum > 12) return null;

  const dayNum = Number(day);
  const yearNum = Number(year);
  if (!dayNum || dayNum < 1 || dayNum > 31 || !yearNum || yearNum < 2000) return null;

  return `${yearNum}-${String(monthNum).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
}

function getOrAdd(map: Map<string, number>, key: string): number {
  if (!key) return -1;
  const existing = map.get(key);
  if (existing !== undefined) return existing;
  const idx = map.size;
  map.set(key, idx);
  return idx;
}

function dominant(counts: Record<string, number>): string | null {
  let best = '', bestCount = 0;
  for (const [k, v] of Object.entries(counts)) {
    if (v > bestCount) { best = k; bestCount = v; }
  }
  return best || null;
}

export type UploadProgress = {
  stage: string;
  percent: number;
};

export async function parseExcelToDataset(
  file: File,
  onProgress?: (p: UploadProgress) => void
): Promise<SalesDataset> {
  onProgress?.({ stage: 'Reading file...', percent: 5 });

  const arrayBuffer = await file.arrayBuffer();
  onProgress?.({ stage: 'Parsing Excel...', percent: 20 });

  const workbook = XLSX.read(arrayBuffer, {
    type: 'array', cellDates: false, cellNF: false, cellText: false,
  });
  const sheetName = workbook.SheetNames.includes('Dashboard')
    ? 'Dashboard' : workbook.SheetNames[0];
  if (!sheetName) throw new Error('No sheets found in workbook');

  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: null, raw: true });

  onProgress?.({ stage: `Loaded ${rows.length.toLocaleString()} rows...`, percent: 30 });

  if (rows.length === 0) throw new Error('Empty file');
  const sample = rows[0];
  for (const col of REQUIRED_COLS) {
    if (!(col in sample)) throw new Error(`Missing column: "${col}"`);
  }

  // Pre-pass: dominant branch/city/channel/manager per customer
  const custPrimary: Record<string, Record<string, Record<string, number>>> = {};
  const smPrimary: Record<string, Record<string, Record<string, number>>> = {};
  for (const r of rows) {
    const acct = String(r['Cust Account'] ?? '').trim();
    const sm = String(r['Sales Man'] ?? '').trim();
    if (acct) {
      if (!custPrimary[acct]) custPrimary[acct] = { br: {}, ci: {}, ch: {}, mg: {} };
      for (const [field, key] of [['Branch', 'br'], ['City', 'ci'], ['Customer Channel', 'ch'], ['Roshen Manager', 'mg']] as const) {
        const v = r[field]; if (v) custPrimary[acct][key][String(v)] = (custPrimary[acct][key][String(v)] || 0) + 1;
      }
    }
    if (sm) {
      if (!smPrimary[sm]) smPrimary[sm] = { mg: {}, br: {} };
      const mgr = r['Roshen Manager']; if (mgr) smPrimary[sm].mg[String(mgr)] = (smPrimary[sm].mg[String(mgr)] || 0) + 1;
      const br = r['Branch']; if (br) smPrimary[sm].br[String(br)] = (smPrimary[sm].br[String(br)] || 0) + 1;
    }
  }

  onProgress?.({ stage: 'Building dataset...', percent: 50 });

  const dims = {
    regions: new Map<string, number>(),
    channels: new Map<string, number>(),
    branches: new Map<string, number>(),
    cities: new Map<string, number>(),
    categories: new Map<string, number>(),
    managers: new Map<string, number>(),
    nsms: new Map<string, number>(),
    supervisors: new Map<string, number>(),
  };

  const customers = new Map<string, {
    id: number; acct: string; n: string; ch: number; br: number; ci: number; rg: number;
    mg: number; sup: number; nsm: number; sm: number;
    first: string; last: string; invSet: Set<string>; skuSet: Set<string>; ts: number; tq: number;
  }>();
  const skus = new Map<string, { id: number; iid: string; d: string; c: number }>();
  const salesmen = new Map<string, { id: number; n: string; mg: number; br: number }>();

  const EPOCH = Date.UTC(2025, 0, 1);
  const factCu: number[] = [], factSk: number[] = [], factSm: number[] = [];
  const factM: number[] = [], factD: number[] = [], factS: number[] = [];
  const factQ: number[] = [], factQx: number[] = [], factWg: number[] = [];
  const factDi: number[] = [], factR: number[] = [], factRc: number[] = [];

  let dateMin: string | null = null, dateMax: string | null = null;
  const monthSet = new Set<string>();

  for (const r of rows) {
    let dateStr = buildDateFromColumns(r) ?? excelDateToISO(r['Invoice Date']);
    if (!dateStr) continue;

    if (!dateMin || dateStr < dateMin) dateMin = dateStr;
    if (!dateMax || dateStr > dateMax) dateMax = dateStr;
    monthSet.add(dateStr.slice(0, 7));

    const acct = String(r['Cust Account'] ?? '').trim();
    const itemId = String(r['Item Id'] ?? '').trim();
    const itemDesc = String(r['Item Description'] ?? '').trim();
    const smName = String(r['Sales Man'] ?? '').trim();
    if (!acct || !itemDesc || !smName) continue;

    const cp = custPrimary[acct];
    const region = norm('Region2', r['Region2']) || '';
    const channel = norm('Customer Channel', cp ? dominant(cp.ch) ?? r['Customer Channel'] : r['Customer Channel']);
    const branch = String(cp ? dominant(cp.br) ?? r['Branch'] ?? '' : r['Branch'] ?? '');
    const city = String(cp ? dominant(cp.ci) ?? r['City'] ?? '' : r['City'] ?? '');
    const category = norm('Item Category', r['Item Category']);
    const sp = smPrimary[smName];
    const manager = norm('Roshen Manager', cp ? dominant(cp.mg) ?? (sp ? dominant(sp.mg) : r['Roshen Manager']) : r['Roshen Manager']);
    const nsm = norm('NSM', r['NSM']);
    const supervisor = String(r['Supervisor'] ?? '');

    const rgIdx = getOrAdd(dims.regions, region || '(Unknown)');
    const chIdx = getOrAdd(dims.channels, channel || '(Unknown)');
    const brIdx = getOrAdd(dims.branches, branch || '(Unknown)');
    const ciIdx = getOrAdd(dims.cities, city || '(Unknown)');
    const catIdx = getOrAdd(dims.categories, category || '(Unknown)');
    const mgIdx = manager ? getOrAdd(dims.managers, manager) : 0;
    const nsmIdx = nsm ? getOrAdd(dims.nsms, nsm) : 0;
    const supIdx = supervisor ? getOrAdd(dims.supervisors, supervisor) : 0;

    if (!customers.has(acct)) {
      customers.set(acct, {
        id: customers.size, acct, n: String(r['Cust Name'] ?? '').trim() || '?',
        ch: chIdx, br: brIdx, ci: ciIdx, rg: rgIdx, mg: mgIdx, sup: supIdx, nsm: nsmIdx, sm: -1,
        first: dateStr, last: dateStr, invSet: new Set(), skuSet: new Set(), ts: 0, tq: 0,
      });
    }
    const cu = customers.get(acct)!;
    if (dateStr < cu.first) cu.first = dateStr;
    if (dateStr > cu.last) cu.last = dateStr;

    if (!skus.has(itemId)) skus.set(itemId, { id: skus.size, iid: itemId, d: itemDesc, c: catIdx });
    if (!salesmen.has(smName)) {
      let smBrIdx = brIdx;
      if (sp) { const pb = dominant(sp.br); if (pb && dims.branches.has(pb)) smBrIdx = dims.branches.get(pb)!; }
      salesmen.set(smName, { id: salesmen.size, n: smName, mg: mgIdx, br: smBrIdx });
    }

    const cuIdx = cu.id;
    const skIdx = skus.get(itemId)!.id;
    const smIdx = salesmen.get(smName)!.id;
    if (cu.sm === -1) cu.sm = smIdx;

    const sales = Number(r['Invoice Amount ex Vat']) || 0;
    const qty = Number(r['Inv Qty Cases']) || 0;
    const isReturn = (String(r['IsReturn'] ?? '').toUpperCase() === 'YES') ||
                     (String(r['SO/Return'] ?? '') === 'ReturnItem') ? 1 : 0;

    cu.ts += sales;
    cu.tq += qty;
    cu.invSet.add(String(r['Invoice'] ?? ''));
    cu.skuSet.add(itemId);

    const dayIdx = Math.floor((Date.UTC(
      parseInt(dateStr.slice(0, 4)), parseInt(dateStr.slice(5, 7)) - 1, parseInt(dateStr.slice(8, 10))
    ) - EPOCH) / 86400000);

    factCu.push(cuIdx); factSk.push(skIdx); factSm.push(smIdx);
    factM.push(0); // filled later
    factD.push(dayIdx); factS.push(Math.round(sales));
    factQ.push(qty); factQx.push(Number(r['Inv Qty Units'] ?? r['Qty Units']) || 0);
    factWg.push(Number(r['Line wight'] ?? r['Line Weight']) || 0);
    factDi.push(Math.round(Number(r['Total Line Discount']) || 0));
    factR.push(isReturn); factRc.push(rgIdx);
  }

  onProgress?.({ stage: 'Finalizing...', percent: 85 });

  const months = [...monthSet].sort();
  const monthIdxMap: Record<string, number> = {};
  months.forEach((m, i) => { monthIdxMap[m] = i; });

  for (let i = 0; i < factD.length; i++) {
    const d = new Date(EPOCH + factD[i] * 86400000);
    const mKey = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    factM[i] = monthIdxMap[mKey] ?? 0;
  }

  const toArr = (m: Map<string, number>) => {
    const arr = new Array(m.size);
    for (const [k, v] of m) arr[v] = k;
    return arr;
  };

  const custArr = [...customers.values()].map(c => ({
    id: c.id, acct: c.acct, n: c.n, ch: c.ch, br: c.br, ci: c.ci, rg: c.rg,
    mg: c.mg, sup: c.sup, nsm: c.nsm, sm: c.sm,
    first: c.first, last: c.last, inv: c.invSet.size, nsk: c.skuSet.size,
    ts: Math.round(c.ts), tq: c.tq,
  }));

  const result: SalesDataset = {
    meta: {
      dateMin: dateMin || '', dateMax: dateMax || '',
      months, generated: new Date().toISOString(),
      rows: factCu.length, processed: factCu.length, skipped: 0,
    },
    dims: {
      regions: toArr(dims.regions), channels: toArr(dims.channels),
      branches: toArr(dims.branches), cities: toArr(dims.cities),
      categories: toArr(dims.categories), managers: toArr(dims.managers),
      nsms: toArr(dims.nsms), supervisors: toArr(dims.supervisors),
    },
    data: {
      cu: factCu, sk: factSk, sm: factSm, m: factM, d: factD, s: factS,
      q: factQ, qx: factQx, wg: factWg, di: factDi, r: factR, rc: factRc,
    },
    customers: custArr,
    skus: [...skus.values()],
    salesmen: [...salesmen.values()],
  };

  onProgress?.({ stage: 'Done!', percent: 100 });
  return result;
}
