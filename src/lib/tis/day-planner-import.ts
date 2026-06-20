/**
 * Day Planner import — flexible column mapping + validation for the standalone
 * "build today's visit sequence" tool. SELF-CONTAINED (does not touch the shared
 * TIS dataset model / Route Planner import): the Day Planner needs only a handful
 * of fields to sequence + export, but must accept real Excel/CSV files from many
 * companies with arbitrary column names. So the manager maps their own headers
 * onto our fields, we auto-detect the common ones, and we validate before the map.
 *
 * Pure — no I/O, no React. Feed `records` from `parseUploadColumns` (server) in.
 */

/** A Day Planner field the user can map a spreadsheet column onto. */
export type DpFieldKey =
  | 'name' | 'lat' | 'lng'
  | 'code' | 'phone' | 'address' | 'city' | 'area' | 'region'
  | 'salesman' | 'supervisor' | 'channel' | 'lastSales' | 'lastInvoiceDate' | 'notes';

export interface DpField { key: DpFieldKey; required?: boolean }

/** Mappable fields in display order. Name/Lat/Lng required; the rest optional. */
export const DP_FIELDS: DpField[] = [
  { key: 'name', required: true }, { key: 'lat', required: true }, { key: 'lng', required: true },
  { key: 'code' }, { key: 'phone' }, { key: 'address' }, { key: 'city' }, { key: 'area' },
  { key: 'region' }, { key: 'salesman' }, { key: 'supervisor' }, { key: 'channel' },
  { key: 'lastSales' }, { key: 'lastInvoiceDate' }, { key: 'notes' },
];

export const DP_REQUIRED_FIELDS: DpFieldKey[] = DP_FIELDS.filter((f) => f.required).map((f) => f.key);

/** Header aliases per field (normalised: lower-cased, spaces/underscores/dashes/
 *  dots/slashes stripped). English synonyms, GPS-prefixed variants and common
 *  Arabic headers. */
const DP_ALIASES: Record<DpFieldKey, string[]> = {
  name: ['name', 'customername', 'custname', 'customer', 'outlet', 'outletname', 'client', 'clientname', 'shopname', 'storename', 'accountname', 'اسمالعميل', 'الاسم', 'العميل', 'اسمالمنفذ', 'المنفذ'],
  lat: ['lat', 'latitude', 'gpslat', 'gpslatitude', 'geolat', 'ycoord', 'ycoordinate', 'y', 'خطالعرض', 'العرض', 'دائرةالعرض'],
  lng: ['lng', 'lon', 'long', 'longitude', 'gpslong', 'gpslongitude', 'geolng', 'geolong', 'xcoord', 'xcoordinate', 'x', 'خطالطول', 'الطول'],
  code: ['code', 'customercode', 'custcode', 'account', 'accountcode', 'accountno', 'customerid', 'custid', 'outletcode', 'clientcode', 'كودالعميل', 'الكود', 'رقمالعميل', 'رمزالعميل'],
  phone: ['phone', 'mobile', 'whatsapp', 'contact', 'telephone', 'tel', 'phoneno', 'mobileno', 'contactnumber', 'جوال', 'الجوال', 'هاتف', 'الهاتف', 'رقمالجوال', 'واتساب'],
  address: ['address', 'street', 'location', 'addressline', 'fulladdress', 'العنوان', 'عنوان', 'الشارع', 'الموقع'],
  city: ['city', 'town', 'cityname', 'المدينة', 'مدينة', 'البلدة'],
  area: ['area', 'district', 'zone', 'subarea', 'neighborhood', 'neighbourhood', 'المنطقة', 'منطقة', 'الحي', 'الحى', 'المقاطعة'],
  region: ['region', 'governorate', 'province', 'state', 'regionname', 'الإقليم', 'اقليم', 'المحافظة', 'محافظة'],
  salesman: ['salesman', 'salesrep', 'rep', 'salesperson', 'salespersonname', 'agent', 'salesmanname', 'المندوب', 'مندوب', 'البائع', 'الممثل'],
  supervisor: ['supervisor', 'manager', 'teamleader', 'المشرف', 'مشرف', 'المدير'],
  channel: ['channel', 'tradechannel', 'outlettype', 'channeltype', 'customertype', 'القناة', 'قناةالبيع', 'نوعالمنفذ', 'نوعالعميل'],
  lastSales: ['lastsales', 'sales', 'salesvalue', 'salesamount', 'lastsalesvalue', 'monthlysales', 'revenue', 'turnover', 'value', 'invoicevalue', 'netsales', 'المبيعات', 'مبيعات', 'آخرمبيعات', 'القيمة'],
  lastInvoiceDate: ['lastinvoicedate', 'lastinvoice', 'invoicedate', 'lastvisitdate', 'lastvisit', 'lastorderdate', 'تاريخآخرفاتورة', 'آخرفاتورة', 'تاريخالفاتورة', 'تاريخآخرزيارة'],
  notes: ['notes', 'note', 'remark', 'remarks', 'comment', 'comments', 'description', 'ملاحظات', 'ملاحظة', 'تعليق'],
};

export const normDpHeader = (h: string): string => h.toLowerCase().replace(/[\s_\-./]/g, '');

/** A reusable saved column mapping (a "format" the user named, e.g. "Roshen"). */
export type DpMapping = Partial<Record<DpFieldKey, string>>;

/**
 * Auto-detect a source header for each field (case/space/underscore-insensitive),
 * never assigning the same header to two fields (first field in display order wins).
 * Pure.
 */
export function suggestDpMapping(headers: readonly string[]): DpMapping {
  const normed = headers.map((h) => [h, normDpHeader(h)] as const);
  const used = new Set<string>();
  const out: DpMapping = {};
  for (const f of DP_FIELDS) {
    const hit = normed.find(([h, n]) => !used.has(h) && DP_ALIASES[f.key].includes(n));
    if (hit) { out[f.key] = hit[0]; used.add(hit[0]); }
  }
  return out;
}

/**
 * A stable fingerprint of a file's columns — sorted, normalised header set — used
 * to recognise "the same format" again and auto-apply a saved template. Pure.
 */
export function headersFingerprint(headers: readonly string[]): string {
  return [...new Set(headers.map(normDpHeader))].filter(Boolean).sort().join('|');
}

/** How well a saved template's columns overlap an uploaded file's columns (0..1). */
export function mappingMatchScore(templateHeaders: readonly string[], fileHeaders: readonly string[]): number {
  const a = new Set(templateHeaders.map(normDpHeader));
  const b = new Set(fileHeaders.map(normDpHeader));
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const h of a) if (b.has(h)) inter++;
  return inter / Math.max(a.size, b.size);
}

// ── Validation ──────────────────────────────────────────────────────────────

export interface DpCustomer {
  id: string;
  code: string | null;
  name: string;
  lat: number;
  lng: number;
  sales?: number;
  phone?: string | null;
  address?: string | null;
  city?: string | null;
  area?: string | null;
  region?: string | null;
  salesman?: string | null;
  supervisor?: string | null;
  channel?: string | null;
  lastInvoiceDate?: string | null;
  notes?: string | null;
}

export type DpRejectReason = 'missing_coords' | 'invalid_coords' | 'duplicate';

export interface DpRejectedRow {
  row: number; // 1-based row number in the uploaded file (excluding header)
  name: string;
  code: string | null;
  reason: DpRejectReason;
}

export interface DpValidation {
  total: number;
  valid: number;
  missingCoords: number;
  invalidCoords: number;
  duplicates: number;
  skipped: number;
  customers: DpCustomer[];
  rejected: DpRejectedRow[];
}

const cleanStr = (v: string | null | undefined): string | null => {
  const s = (v ?? '').toString().trim();
  return s ? s : null;
};
const parseNum = (v: string | null | undefined): number | null => {
  const s = cleanStr(v);
  if (s == null) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};

/** A coordinate is valid when both parse, are in range, and are not the 0,0 null-island. */
export function isValidLatLng(lat: number | null, lng: number | null): boolean {
  if (lat == null || lng == null) return false;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return false;
  if (lat === 0 && lng === 0) return false;
  return true;
}

/**
 * Apply a mapping to raw records and validate. Classifies every row as valid,
 * missing-coords, invalid-coords or duplicate (in that precedence), and returns the
 * clean customer list plus a downloadable rejected-rows list. Duplicates are keyed
 * by customer code when present, otherwise by normalised name + rounded coordinates.
 * Pure.
 */
export function validateDpImport(
  records: readonly Record<string, string>[],
  mapping: DpMapping,
): DpValidation {
  const get = (rec: Record<string, string>, key: DpFieldKey): string | null => {
    const header = mapping[key];
    return header ? cleanStr(rec[header]) : null;
  };

  const customers: DpCustomer[] = [];
  const rejected: DpRejectedRow[] = [];
  let missingCoords = 0, invalidCoords = 0, duplicates = 0;
  const seenKeys = new Set<string>();
  const usedIds = new Set<string>();

  records.forEach((rec, i) => {
    const rowNo = i + 1;
    const name = get(rec, 'name') ?? get(rec, 'code') ?? `Row ${rowNo}`;
    const code = get(rec, 'code');
    const latRaw = get(rec, 'lat');
    const lngRaw = get(rec, 'lng');
    const lat = parseNum(latRaw);
    const lng = parseNum(lngRaw);

    if (latRaw == null || lngRaw == null || lat == null || lng == null) {
      // Missing when either coordinate cell is empty; also non-numeric → treat as
      // missing only if blank, else invalid.
      if ((latRaw == null || lngRaw == null)) { missingCoords++; rejected.push({ row: rowNo, name, code, reason: 'missing_coords' }); return; }
      invalidCoords++; rejected.push({ row: rowNo, name, code, reason: 'invalid_coords' }); return;
    }
    if (!isValidLatLng(lat, lng)) { invalidCoords++; rejected.push({ row: rowNo, name, code, reason: 'invalid_coords' }); return; }

    const dupKey = code
      ? `c:${code.toLowerCase()}`
      : `n:${name.toLowerCase()}@${lat.toFixed(5)},${lng.toFixed(5)}`;
    if (seenKeys.has(dupKey)) { duplicates++; rejected.push({ row: rowNo, name, code, reason: 'duplicate' }); return; }
    seenKeys.add(dupKey);

    let id = code ?? `dp-${rowNo}`;
    while (usedIds.has(id)) id = `${id}-${rowNo}`;
    usedIds.add(id);

    customers.push({
      id, code, name, lat, lng,
      sales: parseNum(get(rec, 'lastSales')) ?? undefined,
      phone: get(rec, 'phone'),
      address: get(rec, 'address'),
      city: get(rec, 'city'),
      area: get(rec, 'area'),
      region: get(rec, 'region'),
      salesman: get(rec, 'salesman'),
      supervisor: get(rec, 'supervisor'),
      channel: get(rec, 'channel'),
      lastInvoiceDate: get(rec, 'lastInvoiceDate'),
      notes: get(rec, 'notes'),
    });
  });

  return {
    total: records.length,
    valid: customers.length,
    missingCoords,
    invalidCoords,
    duplicates,
    skipped: missingCoords + invalidCoords + duplicates,
    customers,
    rejected,
  };
}
