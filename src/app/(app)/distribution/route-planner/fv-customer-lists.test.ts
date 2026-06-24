import { describe, it, expect } from 'vitest';
import { deriveListRow, buildListRows, partitionLists, type FvDatasetRow, type FvDatasetStat } from './fv-customer-lists';

const ds = (over: Partial<FvDatasetRow> = {}): FvDatasetRow => ({
  id: 'd1', name: 'List', created_at: '2026-06-24T08:00:00Z', owner_id: 'u1', status: 'active', archived_at: null, ...over,
});
const stat = (over: Partial<FvDatasetStat> = {}): FvDatasetStat => ({
  dataset_id: 'd1', total_customers: 150, assigned_reps: 3, completed: 48, ...over,
});

describe('fv-customer-lists', () => {
  it('deriveListRow: pending = total - completed; maps fields + owner name', () => {
    const r = deriveListRow(ds(), stat(), 'Admin');
    expect(r).toMatchObject({ id: 'd1', name: 'List', total: 150, assignedReps: 3, completed: 48, pending: 102, status: 'active', uploadedBy: 'Admin' });
  });

  it('deriveListRow: missing stats → zeros; pending never negative; completed capped at total', () => {
    expect(deriveListRow(ds(), undefined, null)).toMatchObject({ total: 0, completed: 0, pending: 0, assignedReps: 0, uploadedBy: null });
    // completed cannot exceed total (defensive)
    expect(deriveListRow(ds(), stat({ total_customers: 10, completed: 99 }), null)).toMatchObject({ total: 10, completed: 10, pending: 0 });
  });

  it('deriveListRow: archived status + archived_at carried through', () => {
    const r = deriveListRow(ds({ status: 'archived', archived_at: '2026-06-24T09:00:00Z' }), stat(), 'A');
    expect(r.status).toBe('archived');
    expect(r.archivedAt).toBe('2026-06-24T09:00:00Z');
  });

  it('buildListRows: active first (newest upload first), then archived; owner lookup by id', () => {
    const rows = buildListRows(
      [
        ds({ id: 'a', created_at: '2026-06-01T00:00:00Z', owner_id: 'u1' }),
        ds({ id: 'b', created_at: '2026-06-10T00:00:00Z', owner_id: 'u2' }),
        ds({ id: 'c', status: 'archived', created_at: '2026-06-20T00:00:00Z', owner_id: 'u1' }),
      ],
      [stat({ dataset_id: 'a' }), stat({ dataset_id: 'b' }), stat({ dataset_id: 'c' })],
      { u1: 'Admin', u2: 'Sara' },
    );
    expect(rows.map((r) => r.id)).toEqual(['b', 'a', 'c']); // active(newest→oldest) then archived
    expect(rows.find((r) => r.id === 'b')!.uploadedBy).toBe('Sara');
  });

  it('partitionLists: splits active vs archived', () => {
    const rows = buildListRows(
      [ds({ id: 'a' }), ds({ id: 'c', status: 'archived' })],
      [stat({ dataset_id: 'a' }), stat({ dataset_id: 'c' })],
      { u1: 'Admin' },
    );
    const { active, archived } = partitionLists(rows);
    expect(active.map((r) => r.id)).toEqual(['a']);
    expect(archived.map((r) => r.id)).toEqual(['c']);
  });
});
