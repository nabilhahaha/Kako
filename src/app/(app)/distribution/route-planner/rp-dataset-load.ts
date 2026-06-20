// ============================================================================
// Wave D — dataset rehydration loader (client). Fetches a persisted dataset's rows
// (paged) and converts them into the planner's customer models so a saved dataset can be
// reopened in Route Builder, Day Planner, Customers, Territories, and the Journey Planner.
// Reuses the pure converters in route-planner-dataset.ts (no parallel mapping).
// ============================================================================
import { getActiveDataset, getDatasetPage, type DatasetHeader } from './rp-dataset-actions';
import { datasetRowsToDpCustomers, datasetRowsToTisDataset, type PersistedRow } from '@/lib/erp/route-planner-dataset';
import type { DpCustomer } from '@/lib/tis/day-planner-import';
import type { TisDataset } from '@/lib/tis/dataset';

export interface LoadedDataset {
  header: DatasetHeader;
  dpCustomers: DpCustomer[];
  tis: TisDataset;
}

const PAGE = 2000;

async function fetchAllRows(id: string): Promise<PersistedRow[]> {
  const rows: PersistedRow[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const res = await getDatasetPage(id, offset, PAGE);
    if (!res.ok || !res.data) break;
    rows.push(...(res.data.rows as unknown as PersistedRow[]));
    if (res.data.rows.length === 0 || rows.length >= res.data.total) break;
  }
  return rows;
}

/** Load a dataset by id and convert it to both customer models. */
export async function loadDatasetById(header: DatasetHeader): Promise<LoadedDataset> {
  const rows = await fetchAllRows(header.id);
  return { header, dpCustomers: datasetRowsToDpCustomers(rows), tis: datasetRowsToTisDataset(rows) };
}

/** Load the owner's active dataset (or null when none is active). */
export async function loadActiveDataset(): Promise<LoadedDataset | null> {
  const res = await getActiveDataset();
  if (!res.ok || !res.data) return null;
  return loadDatasetById(res.data);
}
