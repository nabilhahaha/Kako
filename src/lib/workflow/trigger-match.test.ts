import { describe, it, expect } from 'vitest';
import { matchesTrigger, selectTriggeredDefinitions } from './trigger-match';
import type { DomainEvent, WorkflowDefinition } from './types';

const baseDef = (over: Partial<WorkflowDefinition> = {}): WorkflowDefinition => ({
  id: 'd1', companyId: 'co1', branchId: null, key: 'k', entity: 'invoice',
  nameEn: null, nameAr: null, description: null, trigger: 'manual',
  triggerEvent: 'invoice.issued', triggerConfig: {}, isActive: true, version: 1, ...over,
});
const ev = (over: Partial<DomainEvent> = {}): DomainEvent => ({
  id: 'e1', companyId: 'co1', branchId: 'b1', eventType: 'invoice.issued', entity: 'invoice',
  recordId: 'inv1', payload: {}, actorId: null, source: 'app', occurredAt: '', ...over,
});

describe('matchesTrigger', () => {
  it('matches on event_type + entity', () => {
    expect(matchesTrigger(baseDef(), ev())).toBe(true);
  });
  it('rejects inactive definitions', () => {
    expect(matchesTrigger(baseDef({ isActive: false }), ev())).toBe(false);
  });
  it('rejects a different event_type', () => {
    expect(matchesTrigger(baseDef(), ev({ eventType: 'invoice.paid' }))).toBe(false);
  });
  it('rejects a different entity', () => {
    expect(matchesTrigger(baseDef(), ev({ entity: 'customer' }))).toBe(false);
  });
  it('honors a where payload filter (with JSONB string/number coercion)', () => {
    const d = baseDef({ triggerConfig: { where: { net_amount: 100, status: 'issued' } } });
    expect(matchesTrigger(d, ev({ payload: { net_amount: '100', status: 'issued' } }))).toBe(true);
    expect(matchesTrigger(d, ev({ payload: { net_amount: 50, status: 'issued' } }))).toBe(false);
  });
  it('honors branchScoped only when the definition is branch-bound', () => {
    const d = baseDef({ branchId: 'b1', triggerConfig: { branchScoped: true } });
    expect(matchesTrigger(d, ev({ branchId: 'b1' }))).toBe(true);
    expect(matchesTrigger(d, ev({ branchId: 'b2' }))).toBe(false);
  });
  it('trigger_config.entity overrides the definition entity', () => {
    const d = baseDef({ entity: 'invoice', triggerConfig: { entity: 'order' } });
    expect(matchesTrigger(d, ev({ entity: 'order' }))).toBe(true);
    expect(matchesTrigger(d, ev({ entity: 'invoice' }))).toBe(false);
  });
});

describe('selectTriggeredDefinitions', () => {
  it('prefers a company-specific definition over a global template of the same key', () => {
    const global = baseDef({ id: 'g', companyId: null });
    const local = baseDef({ id: 'l', companyId: 'co1' });
    const out = selectTriggeredDefinitions([global, local], ev());
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe('l');
  });
  it('returns nothing when no definition matches', () => {
    expect(selectTriggeredDefinitions([baseDef({ triggerEvent: 'other' })], ev())).toEqual([]);
  });
});
