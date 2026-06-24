// Field Verification — Customer Lists: pure helpers (no I/O / no React) so the
// per-list count derivation and active/archived partition are unit-tested. The admin
// actions (rp-customer-lists-actions) and the panel (customer-lists-panel) consume these.

export type FvListStatus = 'active' | 'archived';

/** One uploaded FV customer list as shown on the admin screen. */
export interface FvCustomerList {
  id: string;
  name: string;
  uploadedAt: string;            // ISO (dataset created_at)
  uploadedBy: string | null;     // uploader display name (owner)
  total: number;                 // total customers in the list
  assignedReps: number;          // distinct assigned reps
  pending: number;               // total - completed
  completed: number;             // customers with a verification
  status: FvListStatus;
  archivedAt: string | null;
}

/** Raw dataset row (from erp_rp_datasets) the action reads. */
export interface FvDatasetRow {
  id: string;
  name: string;
  created_at: string;
  owner_id: string | null;
  status: string | null;
  archived_at: string | null;
}

/** Per-dataset stats (from erp_fv_dataset_stats RPC). */
export interface FvDatasetStat {
  dataset_id: string;
  total_customers: number;
  assigned_reps: number;
  completed: number;
}

const asStatus = (s: string | null | undefined): FvListStatus => (s === 'archived' ? 'archived' : 'active');

/** Build one display row from a dataset + its stats + the uploader's name. pending is
 *  derived as total - completed and floored at 0 (never negative). */
export function deriveListRow(
  d: FvDatasetRow,
  stat: FvDatasetStat | undefined,
  ownerName: string | null,
): FvCustomerList {
  const total = stat?.total_customers ?? 0;
  const completed = Math.min(stat?.completed ?? 0, total);
  return {
    id: d.id,
    name: d.name,
    uploadedAt: d.created_at,
    uploadedBy: ownerName,
    total,
    assignedReps: stat?.assigned_reps ?? 0,
    completed,
    pending: Math.max(0, total - completed),
    status: asStatus(d.status),
    archivedAt: d.archived_at,
  };
}

/** Build + sort the full list: active first (newest upload first), then archived. */
export function buildListRows(
  datasets: FvDatasetRow[],
  stats: FvDatasetStat[],
  ownerNameById: Record<string, string | null>,
): FvCustomerList[] {
  const statById = new Map(stats.map((s) => [s.dataset_id, s]));
  return datasets
    .map((d) => deriveListRow(d, statById.get(d.id), ownerNameById[d.owner_id ?? ''] ?? null))
    .sort((a, b) => {
      if (a.status !== b.status) return a.status === 'active' ? -1 : 1;
      return b.uploadedAt.localeCompare(a.uploadedAt);
    });
}

/** Partition into the Active / Archived sections the screen renders. */
export function partitionLists(rows: FvCustomerList[]): { active: FvCustomerList[]; archived: FvCustomerList[] } {
  return {
    active: rows.filter((r) => r.status === 'active'),
    archived: rows.filter((r) => r.status === 'archived'),
  };
}
