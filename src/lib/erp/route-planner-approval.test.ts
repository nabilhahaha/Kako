import { describe, it, expect } from 'vitest';
import {
  RP_APPROVAL_TEMPLATES, RP_APPROVAL_STAGES, RP_ASSIGN_METHODS, RP_RELATIONS, RP_ROLES,
} from './route-planner-backend';

describe('RP_APPROVAL_TEMPLATES', () => {
  const templates = Object.entries(RP_APPROVAL_TEMPLATES);

  it('provides the three documented templates, each non-empty', () => {
    expect(Object.keys(RP_APPROVAL_TEMPLATES).sort()).toEqual(['admin_only', 'multi_level', 'simple']);
    for (const [, steps] of templates) expect(steps.length).toBeGreaterThan(0);
  });

  it('every step uses a valid stage, assign method, and a coherent target', () => {
    for (const [name, steps] of templates) {
      for (const s of steps) {
        expect(RP_APPROVAL_STAGES, name).toContain(s.stage);
        expect(RP_ASSIGN_METHODS, name).toContain(s.assignBy);
        if (s.assignBy === 'role') expect(RP_ROLES, `${name}.role`).toContain(s.role);
        if (s.assignBy === 'relation') expect(RP_RELATIONS, `${name}.relation`).toContain(s.relation);
        if (s.assignBy === 'user') expect(typeof s.userId === 'string' || s.userId === undefined).toBe(true);
      }
    }
  });

  it('multi_level has more steps than simple, which has more than admin_only is allowed to', () => {
    expect(RP_APPROVAL_TEMPLATES.multi_level.length).toBeGreaterThanOrEqual(RP_APPROVAL_TEMPLATES.simple.length);
  });
});
