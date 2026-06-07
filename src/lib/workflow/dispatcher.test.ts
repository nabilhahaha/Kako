import { describe, it, expect } from 'vitest';
import { dispatchEvent, type DispatchDeps } from './dispatcher';
import type { DomainEvent, WorkflowDefinition } from './types';

const def = (over: Partial<WorkflowDefinition> = {}): WorkflowDefinition => ({
  id: 'd1', companyId: 'co1', branchId: null, key: 'customer_onboarding', entity: 'customer',
  nameEn: null, nameAr: null, description: null, trigger: 'manual',
  triggerEvent: 'customer.created', triggerConfig: {}, isActive: true, version: 1, ...over,
});
const event = (over: Partial<DomainEvent> = {}): DomainEvent => ({
  id: 'e1', companyId: 'co1', branchId: 'b1', eventType: 'customer.created', entity: 'customer',
  recordId: 'cust1', payload: { name: 'X' }, actorId: 'u1', source: 'app', occurredAt: '', ...over,
});

function deps(over: Partial<DispatchDeps> & { defs?: WorkflowDefinition[] } = {}): DispatchDeps & { linked: string[]; started: string[] } {
  const linked: string[] = []; const started: string[] = [];
  return {
    linked, started,
    candidates: over.candidates ?? (async () => over.defs ?? [def()]),
    start: over.start ?? (async (d) => { started.push(d.key); return { instanceId: `inst-${d.key}` }; }),
    link: over.link ?? (async (id) => { linked.push(id); }),
  };
}

describe('dispatchEvent', () => {
  it('starts a run for a matching definition and links it to the event', async () => {
    const d = deps();
    const out = await dispatchEvent(d, event());
    expect(out).toEqual([{ workflowKey: 'customer_onboarding', instanceId: 'inst-customer_onboarding' }]);
    expect(d.started).toEqual(['customer_onboarding']);
    expect(d.linked).toEqual(['inst-customer_onboarding']);
  });

  it('no-op for an entity-less event (no record id)', async () => {
    const d = deps();
    const out = await dispatchEvent(d, event({ recordId: null }));
    expect(out).toEqual([]);
    expect(d.started).toEqual([]);
  });

  it('records a skip (no throw) when the engine refuses to start (e.g. already active)', async () => {
    const d = deps({ start: async () => ({ instanceId: null, error: 'duplicate active workflow' }) });
    const out = await dispatchEvent(d, event());
    expect(out).toEqual([{ workflowKey: 'customer_onboarding', instanceId: null, skipped: 'duplicate active workflow' }]);
    expect(d.linked).toEqual([]);
  });

  it('does nothing when no definition matches', async () => {
    const d = deps({ defs: [] });
    expect(await dispatchEvent(d, event())).toEqual([]);
  });

  it('filters out non-matching definitions before starting (trigger_config where)', async () => {
    const gated = def({ key: 'big_orders', entity: 'customer', triggerConfig: { where: { vip: true } } });
    const d = deps({ defs: [gated] });
    const out = await dispatchEvent(d, event({ payload: { vip: false } }));
    expect(out).toEqual([]);     // selectTriggeredDefinitions drops it
    expect(d.started).toEqual([]);
  });

  it('starts multiple matched workflows', async () => {
    const d = deps({ defs: [def({ key: 'a' }), def({ key: 'b' })] });
    const out = await dispatchEvent(d, event());
    expect(out.map((o) => o.workflowKey).sort()).toEqual(['a', 'b']);
    expect(d.linked).toHaveLength(2);
  });
});
