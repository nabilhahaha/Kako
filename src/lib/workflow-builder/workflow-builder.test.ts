import { describe, it, expect } from 'vitest';
import {
  WORKFLOW_BUILDER_ENABLED,
  filterTemplates, validateTemplateDefinition, catalogIsValid,
  type WorkflowTemplate, type TemplateDefinition,
} from './index';

const def = (over: Partial<TemplateDefinition> = {}): TemplateDefinition => ({
  entity: 'customer_change_request',
  trigger: 'manual',
  steps: [
    { stepNo: 1, stepType: 'approval', name: 'Review', approverType: 'role', approverRef: 'supervisor', mode: 'sequential', requiredApprovals: 1, slaHours: 24, escalateTo: 'manager', config: {} },
    { stepNo: 2, stepType: 'notification', name: 'Notify', approverType: 'system', approverRef: null, mode: 'sequential', requiredApprovals: 0, slaHours: null, escalateTo: null, config: {} },
  ],
  ...over,
});

const tpl = (over: Partial<WorkflowTemplate> = {}): WorkflowTemplate => ({
  id: 'T1', companyId: null, code: 'c', nameEn: 'C', nameAr: 'ج', category: 'data_update',
  entity: 'customer_change_request', definition: def(), isActive: true, ...over,
});

describe('workflow-builder/flags', () => {
  it('defaults OFF', () => { expect(WORKFLOW_BUILDER_ENABLED()).toBe(false); });
});

describe('workflow-builder/templates', () => {
  it('filterTemplates filters by category + active', () => {
    const all = [tpl({ id: 'a', category: 'data_update' }), tpl({ id: 'b', category: 'trade_spend' }), tpl({ id: 'c', category: 'data_update', isActive: false })];
    expect(filterTemplates(all, { category: 'data_update' }).map((t) => t.id)).toEqual(['a']);
    expect(filterTemplates(all, {}).map((t) => t.id)).toEqual(['a', 'b']);          // inactive dropped
    expect(filterTemplates(all, { activeOnly: false }).length).toBe(3);
  });

  it('validateTemplateDefinition accepts a good def', () => {
    expect(validateTemplateDefinition(def())).toEqual([]);
  });

  it('catches missing approverRef, weak approval, non-contiguous steps, no steps', () => {
    expect(validateTemplateDefinition(def({ steps: [] }))).toContain('no steps');
    const bad = def({ steps: [
      { stepNo: 1, stepType: 'approval', name: 'x', approverType: 'role', approverRef: null, mode: 'sequential', requiredApprovals: 0, slaHours: null, escalateTo: null, config: {} },
      { stepNo: 3, stepType: 'notification', name: 'y', approverType: 'system', approverRef: null, mode: 'sequential', requiredApprovals: 0, slaHours: null, escalateTo: null, config: {} },
    ] });
    const problems = validateTemplateDefinition(bad);
    expect(problems.some((p) => p.includes('requiredApprovals'))).toBe(true);
    expect(problems.some((p) => p.includes('approverRef'))).toBe(true);
    expect(problems.some((p) => p.includes('contiguous'))).toBe(true);
  });

  it('catalogIsValid is true for a clean catalog', () => {
    expect(catalogIsValid([tpl(), tpl({ id: 'T2', code: 'd' })])).toBe(true);
  });
});
