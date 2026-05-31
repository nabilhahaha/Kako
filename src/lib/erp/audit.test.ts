import { describe, it, expect, vi } from 'vitest';
import { logAudit, AUDIT_ACTION_LABELS, AUDIT_ENTITY_LABELS } from './audit';

describe('logAudit', () => {
  it('calls the erp_log_audit RPC with mapped parameters', async () => {
    const rpc = vi.fn(async () => ({ error: null }));
    await logAudit({ rpc } as never, { action: 'create', entity: 'customer', entityId: 'id1', details: { a: 1 }, companyId: 'co1' });
    expect(rpc).toHaveBeenCalledWith('erp_log_audit', {
      p_action: 'create', p_entity: 'customer', p_entity_id: 'id1', p_details: { a: 1 }, p_company_id: 'co1',
    });
  });

  it('defaults optional fields to null', async () => {
    const rpc = vi.fn(async () => ({ error: null }));
    await logAudit({ rpc } as never, { action: 'x', entity: 'y' });
    expect(rpc).toHaveBeenCalledWith('erp_log_audit', {
      p_action: 'x', p_entity: 'y', p_entity_id: null, p_details: null, p_company_id: null,
    });
  });

  it('never throws even if the RPC rejects (auditing must not block the op)', async () => {
    const rpc = vi.fn(async () => { throw new Error('boom'); });
    await expect(logAudit({ rpc } as never, { action: 'x', entity: 'y' })).resolves.toBeUndefined();
  });
});

describe('audit label maps', () => {
  it('are populated with ar + en for each entry', () => {
    for (const map of [AUDIT_ACTION_LABELS, AUDIT_ENTITY_LABELS]) {
      expect(Object.keys(map).length).toBeGreaterThan(0);
      for (const v of Object.values(map)) {
        expect(v.en.length).toBeGreaterThan(0);
        expect(v.ar.length).toBeGreaterThan(0);
      }
    }
  });
});
