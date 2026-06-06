import { describe, it, expect } from 'vitest';
import { resolveReviewRow, type ReviewItem } from './review';

const item: ReviewItem = {
  id: 1, companyId: 'co', entity: 'inventory_counts', pk: 'i1', clientOpId: 'A',
  baseVersion: 1, proposed: { qty: 90 }, remoteVersion: 3, remote: { qty: 100 },
};

describe('inventory conflict-review resolution', () => {
  it('keep-local commits the counted value as the next version (idempotent op id)', () => {
    const r = resolveReviewRow('keep-local', item, 500);
    expect(r.action).toBe('commit');
    if (r.action === 'commit') {
      expect(r.ingestClientOpId).toBe('A');
      expect(r.row).toMatchObject({ pk: 'i1', version: 4, data: { qty: 90 }, updatedAt: 500 });
    }
  });

  it('keep-cloud discards the local op (client will pull cloud)', () => {
    expect(resolveReviewRow('keep-cloud', item, 500)).toEqual({ action: 'discard' });
  });
});
