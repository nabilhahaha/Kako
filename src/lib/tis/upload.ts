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
  });
}

/** Build a dataset from uploaded rows. Pure. */
export function buildTisDatasetFromRows(
  rows: readonly TisUploadRow[],
  meta: { asOf?: string; source?: TisSource } = {},
): TisDataset {
  return buildTisDataset(
    rows.map((r, i) => rowToTisCustomer(r, i)),
    { source: meta.source ?? 'upload', asOf: meta.asOf },
  );
}
