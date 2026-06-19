/**
 * TIS adapters — uploaded rows → canonical dataset (TIS-0-4, pure half). Maps a
 * parsed spreadsheet / Google-Sheet / connector row onto a TisCustomer, reusing
 * the FR lenient frequency parser. Pure, no I/O — this is the Mode-A entry point
 * (Sheet/Excel → dataset) of the single data model (strategy §4a / §4b).
 */
import { coerceFrequencyToken, parseFrequency } from '@/lib/route-optimization/visit-frequency';
import type { CoverageStatus } from '@/lib/distribution/coverage-engine';
import { buildTisCustomer, buildTisDataset, type TisCustomer, type TisDataset, type TisSource } from './dataset';

export interface TisUploadRow {
  id?: string | null;
  code?: string | null;
  name?: string | null;
  lat?: number | string | null;
  lng?: number | string | null;
  salesmanId?: string | null;
  supervisorId?: string | null;
  routeId?: string | null;
  regionId?: string | null;
  areaId?: string | null;
  grade?: string | null;
  /** Free-text cadence (weekly/biweekly/monthly/annual/3/…) → FR token. */
  frequency?: string | null;
  salesValue?: number | string | null;
  coverage?: string | null;
  health?: number | string | null;
  channel?: string | null;
  branch?: string | null;
  city?: string | null;
  address?: string | null;
}

const COVERAGE_VALUES: CoverageStatus[] = ['on_track', 'under_covered', 'over_covered', 'never_visited'];

function num(v: number | string | null | undefined): number | null {
  if (v == null || v === '') return null;
  const n = typeof v === 'number' ? v : Number(String(v).trim());
  return Number.isFinite(n) ? n : null;
}

const str = (v: string | null | undefined): string | null => {
  const s = (v ?? '').toString().trim();
  return s ? s : null;
};

/** Map one upload row → TisCustomer (identity synthesized when absent). Pure. */
export function rowToTisCustomer(row: TisUploadRow, index = 0): TisCustomer {
  const id = str(row.id) ?? str(row.code) ?? `row-${index + 1}`;
  const lat = num(row.lat);
  const lng = num(row.lng);
  const freqTok = coerceFrequencyToken(row.frequency ?? null);
  const covRaw = str(row.coverage)?.toLowerCase() ?? null;
  const coverage = covRaw && (COVERAGE_VALUES as string[]).includes(covRaw) ? (covRaw as CoverageStatus) : null;
  return buildTisCustomer({
    id,
    code: str(row.code),
    name: str(row.name) ?? id,
    geo: lat != null && lng != null ? { lat, lng } : null,
    ownership: {
      salesmanId: str(row.salesmanId),
      supervisorId: str(row.supervisorId),
      areaId: str(row.areaId),
      regionId: str(row.regionId),
      routeId: str(row.routeId),
    },
    grade: str(row.grade),
    frequency: freqTok ? parseFrequency(freqTok) : null,
    salesValue: num(row.salesValue),
    coverage,
    health: num(row.health),
    channel: str(row.channel),
    branch: str(row.branch),
    city: str(row.city),
    address: str(row.address),
  });
}

/** Aliases per canonical field → tolerant of real-world spreadsheet headers
 *  (case / spacing / underscores are normalised away before matching). */
const HEADER_ALIASES: Record<keyof TisUploadRow, string[]> = {
  id: ['id', 'customerid', 'outletid'],
  code: ['code', 'customercode', 'outletcode'],
  name: ['name', 'customername', 'outletname', 'customer', 'outlet'],
  lat: ['lat', 'latitude'],
  lng: ['lng', 'lon', 'long', 'longitude'],
  salesmanId: ['salesmanid', 'salesman', 'repid', 'rep', 'salesrep'],
  supervisorId: ['supervisorid', 'supervisor'],
  areaId: ['areaid', 'area'],
  regionId: ['regionid', 'region'],
  routeId: ['routeid', 'route'],
  grade: ['grade', 'class', 'classification', 'outletgrade'],
  frequency: ['frequency', 'cadence', 'visitfrequency', 'visitfreq', 'freq'],
  salesValue: ['salesvalue', 'sales', 'value', 'revenue', 'turnover'],
  coverage: ['coverage', 'coveragestatus', 'status'],
  health: ['health', 'healthscore', 'score'],
  channel: ['channel', 'tradechannel', 'outlettype'],
  branch: ['branch', 'branchname', 'depot', 'warehouse'],
  city: ['city', 'town'],
  address: ['address', 'street', 'location', 'addressline'],
};

const normHeader = (h: string): string => h.toLowerCase().replace(/[\s_\-./]/g, '');

/**
 * Map generic spreadsheet records (header-keyed strings, as produced by the CSV /
 * XLSX / JSON parsers) onto canonical upload rows — tolerant of header casing,
 * spacing, and common aliases (latitude, rep, cadence, …). Unknown columns are
 * ignored. Pure.
 */
export function mapRecordsToUploadRows(records: readonly Record<string, string>[]): TisUploadRow[] {
  if (records.length === 0) return [];
  // Resolve, once, which source header feeds each canonical field.
  const headers = Object.keys(records[0]);
  const normed = headers.map((h) => [h, normHeader(h)] as const);
  const pick: Partial<Record<keyof TisUploadRow, string>> = {};
  for (const field of Object.keys(HEADER_ALIASES) as (keyof TisUploadRow)[]) {
    const aliases = HEADER_ALIASES[field];
    const hit = normed.find(([, n]) => aliases.includes(n));
    if (hit) pick[field] = hit[0];
  }
  return records.map((rec) => {
    const row: TisUploadRow = {};
    for (const field of Object.keys(pick) as (keyof TisUploadRow)[]) {
      const src = pick[field]!;
      const v = (rec[src] ?? '').toString().trim();
      (row as Record<string, string | null>)[field] = v ? v : null;
    }
    return row;
  });
}

// ── Flexible column mapping (manager maps their headers → canonical fields) ─────

/** A user-mappable field. `required` ones must be mapped before import. */
export interface TisMapField { key: TisFieldKey; required?: boolean }
export type TisFieldKey =
  | 'name' | 'lat' | 'lng' | 'code' | 'route' | 'frequency' | 'salesman'
  | 'branch' | 'city' | 'channel' | 'class' | 'address';

/** The mappable fields in display order (Name/Lat/Lng required; the rest optional). */
export const TIS_MAP_FIELDS: TisMapField[] = [
  { key: 'name', required: true }, { key: 'lat', required: true }, { key: 'lng', required: true },
  { key: 'code' }, { key: 'route' }, { key: 'frequency' }, { key: 'salesman' },
  { key: 'branch' }, { key: 'city' }, { key: 'channel' }, { key: 'class' }, { key: 'address' },
];

/** Field → the TisUploadRow property it fills. */
const FIELD_TO_ROW: Record<TisFieldKey, keyof TisUploadRow> = {
  name: 'name', lat: 'lat', lng: 'lng', code: 'code', route: 'routeId', frequency: 'frequency',
  salesman: 'salesmanId', branch: 'branch', city: 'city', channel: 'channel', class: 'grade', address: 'address',
};

/** Header aliases per field (normalised: lower-cased, spaces/underscores/dashes/dots
 *  stripped) for auto-suggesting a mapping — including English synonyms, GPS-prefixed
 *  variants, and Arabic headers. e.g. "GPS Latitude" → "gpslatitude", "Account Code"
 *  → "accountcode", "اسم العميل" → "اسمالعميل". */
const FIELD_ALIASES: Record<TisFieldKey, string[]> = {
  name: ['name', 'customername', 'custname', 'outletname', 'customer', 'outlet', 'shopname', 'storename', 'clientname', 'account', 'accountname', 'اسمالعميل', 'الاسم', 'العميل', 'اسمالمنفذ', 'اسمالمتجر'],
  lat: ['lat', 'latitude', 'gpslatitude', 'geolat', 'ycoord', 'ycoordinate', 'y', 'خطالعرض', 'العرض', 'دائرةالعرض'],
  lng: ['lng', 'lon', 'long', 'longitude', 'gpslongitude', 'geolng', 'geolong', 'xcoord', 'xcoordinate', 'x', 'خطالطول', 'الطول', 'خططول'],
  code: ['code', 'customercode', 'custcode', 'outletcode', 'id', 'customerid', 'custid', 'outletid', 'accountcode', 'accountid', 'accountno', 'clientcode', 'كودالعميل', 'الكود', 'رقمالعميل', 'رمزالعميل', 'معرفالعميل'],
  route: ['route', 'routeid', 'routename', 'routeno', 'journey', 'الخط', 'المسار', 'خطالسير', 'رقمالخط'],
  frequency: ['frequency', 'cadence', 'visitfrequency', 'visitfreq', 'freq', 'visitcadence', 'التكرار', 'تكرارالزيارة', 'معدلالزيارة', 'التردد'],
  salesman: ['salesman', 'salesmanid', 'salesmanname', 'rep', 'repid', 'salesrep', 'salesperson', 'salespersonid', 'agent', 'المندوب', 'مندوبالمبيعات', 'البائع', 'الممثل'],
  branch: ['branch', 'branchname', 'branchcode', 'depot', 'warehouse', 'الفرع', 'فرع', 'المستودع'],
  city: ['city', 'town', 'cityname', 'المدينة', 'مدينة', 'البلدة'],
  channel: ['channel', 'tradechannel', 'outlettype', 'channeltype', 'القناة', 'قناةالبيع', 'نوعالمنفذ'],
  class: ['class', 'classification', 'grade', 'outletgrade', 'category', 'tier', 'التصنيف', 'الفئة', 'الدرجة', 'تصنيفالعميل'],
  address: ['address', 'street', 'location', 'addressline', 'fulladdress', 'العنوان', 'عنوان', 'الشارع', 'الموقع'],
};

/** Auto-detect a header for each field (case/space/underscore-insensitive). Pure. */
export function suggestColumnMapping(headers: readonly string[]): Partial<Record<TisFieldKey, string>> {
  const normed = headers.map((h) => [h, normHeader(h)] as const);
  const out: Partial<Record<TisFieldKey, string>> = {};
  for (const f of TIS_MAP_FIELDS) {
    const hit = normed.find(([, n]) => FIELD_ALIASES[f.key].includes(n));
    if (hit) out[f.key] = hit[0];
  }
  return out;
}

/**
 * Build canonical upload rows from raw spreadsheet records using an explicit
 * field → source-header mapping (the manager's choices). Unmapped fields are left
 * empty; unknown headers ignored. Pure — feed into `buildTisDatasetFromRows`.
 */
export function applyColumnMapping(
  records: readonly Record<string, string>[],
  mapping: Partial<Record<TisFieldKey, string>>,
): TisUploadRow[] {
  const pairs = (Object.entries(mapping) as [TisFieldKey, string | undefined][])
    .filter(([, header]) => !!header)
    .map(([field, header]) => [FIELD_TO_ROW[field], header!] as const);
  return records.map((rec) => {
    const row: TisUploadRow = {};
    for (const [prop, header] of pairs) {
      const v = (rec[header] ?? '').toString().trim();
      (row as Record<string, string | null>)[prop] = v ? v : null;
    }
    return row;
  });
}

/** Build a dataset from uploaded rows. Pure. Ids are made UNIQUE: real files often
 *  repeat a customer code (JPFOOD has ~500), and two distinct outlets must never
 *  collapse into one record — duplicates get a `-2`, `-3`… suffix on the id (the
 *  code is left untouched). */
export function buildTisDatasetFromRows(
  rows: readonly TisUploadRow[],
  meta: { asOf?: string; source?: TisSource } = {},
): TisDataset {
  const customers = rows.map((r, i) => rowToTisCustomer(r, i));
  const used = new Set<string>();
  const unique = customers.map((c) => {
    if (!used.has(c.id)) { used.add(c.id); return c; }
    let n = 2, id = `${c.id}-${n}`;
    while (used.has(id)) { n++; id = `${c.id}-${n}`; }
    used.add(id);
    return { ...c, id };
  });
  return buildTisDataset(unique, { source: meta.source ?? 'upload', asOf: meta.asOf });
}
