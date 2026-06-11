import { describe, it, expect } from 'vitest';
import {
  CRITICAL_ACTIONS, CRITICAL_ACTIONS_BY_KEY, getCriticalActionSpec,
  type RiskLevel, type ReversalPolicy, type WireStatus,
} from './critical-actions-catalog';
import { DICTIONARIES } from '../i18n/dictionaries';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

function resolve(locale: 'ar' | 'en', key: string): unknown {
  return key.split('.').reduce<unknown>(
    (acc, part) => (acc && typeof acc === 'object' ? (acc as Record<string, unknown>)[part] : undefined),
    DICTIONARIES[locale],
  );
}

const RISK: RiskLevel[] = ['low', 'medium', 'high', 'critical'];
const REVERSAL: ReversalPolicy[] = ['reversible', 'reverse_entry', 'approval_to_reverse', 'irreversible'];
const STATUS: WireStatus[] = ['wired', 'ready', 'planned'];

describe('FMCG critical-action catalog', () => {
  it('covers the full 22-action FMCG catalog', () => {
    expect(CRITICAL_ACTIONS.length).toBe(22);
  });

  it('has unique, stable keys', () => {
    const keys = CRITICAL_ACTIONS.map((a) => a.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(Object.keys(CRITICAL_ACTIONS_BY_KEY).length).toBe(22);
  });

  it('uses valid enum values everywhere', () => {
    for (const a of CRITICAL_ACTIONS) {
      expect(RISK, a.key).toContain(a.risk);
      expect(REVERSAL, a.key).toContain(a.reversalPolicy);
      expect(STATUS, a.key).toContain(a.status);
      expect(a.requiredPermission.length, a.key).toBeGreaterThan(0);
      expect(a.requiredRole.length, a.key).toBeGreaterThan(0);
      expect(a.auditFields.length, a.key).toBeGreaterThan(0);
    }
  });

  it('every action verb label resolves in both ar and en', () => {
    for (const a of CRITICAL_ACTIONS) {
      expect(resolve('ar', a.labelKey), `ar ${a.labelKey}`).toBeTypeOf('string');
      expect(resolve('en', a.labelKey), `en ${a.labelKey}`).toBeTypeOf('string');
    }
  });

  it('every wired/ready action points at a server action', () => {
    for (const a of CRITICAL_ACTIONS) {
      if (a.status === 'wired' || a.status === 'ready') {
        expect(a.actionRef, a.key).toMatch(/#\w+$/);
      }
    }
  });

  it('irreversible financial actions never claim a plain reversible policy', () => {
    for (const a of CRITICAL_ACTIONS) {
      if (a.irreversible) expect(a.reversalPolicy, a.key).not.toBe('reversible');
    }
  });

  it('getCriticalActionSpec resolves a known key and ignores unknowns', () => {
    expect(getCriticalActionSpec('invoice.finalize')?.domain).toBe('sales');
    expect(getCriticalActionSpec('does.not.exist')).toBeUndefined();
  });

  it('the erp_action_policies seed (0272) covers exactly the catalog keys', () => {
    // Guards DB-default ↔ TS-catalog drift: every catalog action must be seeded
    // by erp_seed_action_policies, and the seed must not reference stale keys.
    const sql = readFileSync(
      join(process.cwd(), 'supabase/migrations/0272_action_policies.sql'),
      'utf8',
    );
    const seeded = new Set<string>();
    for (const m of sql.matchAll(/\(\s*'([a-zA-Z]+\.[a-zA-Z]+)'\s*,\s*'(?:low|medium|high|critical)'/g)) {
      seeded.add(m[1]);
    }
    const catalogKeys = new Set(CRITICAL_ACTIONS.map((a) => a.key));
    expect([...seeded].sort()).toEqual([...catalogKeys].sort());
  });
});
