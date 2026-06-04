import { describe, it, expect } from 'vitest';
import { buildCatalog } from './catalog';
import { interpret } from './intent';
import { resolveAnswer } from './resolve';
import type { CopilotContext } from '@/lib/erp/copilot/copilot-engine';
import type { InterpretContext } from './types';

const catalog = buildCatalog();
const ctxIC: InterpretContext = { permissions: [], modules: ['sales', 'inventory'], privileged: false };

const cctx = (over: Partial<CopilotContext> = {}): CopilotContext => ({
  permissions: [], modules: ['sales', 'inventory', 'accounting', 'field_ops', 'distribution'],
  roles: ['salesman'], topRole: 'salesman', isSuperAdmin: false, isPlatformOwner: false, companyActive: true, ...over,
});

describe('copilot AI · deterministic interpret (EN + AR)', () => {
  it('maps an English "why can\'t I…" to a why_blocked action', () => {
    const intent = interpret({ question: "Why can't I add a customer?", locale: 'en', catalog, context: ctxIC });
    expect(intent.kind).toBe('why_blocked');
    expect(intent.key).toBe('customer.create');
  });

  it('maps an Arabic "how do I…" to a training guide', () => {
    const intent = interpret({ question: 'كيف أنشئ عميل؟', locale: 'ar', catalog, context: ctxIC });
    expect(intent.kind).toBe('training');
    expect(intent.key).toBe('create_customer');
  });

  it('maps a permission question to a permission intent', () => {
    const intent = interpret({ question: 'what does the day close permission do', locale: 'en', catalog, context: ctxIC });
    expect(intent.kind).toBe('permission');
    expect(intent.key).toBe('day.close');
  });

  it('returns unknown for an unrelated question', () => {
    const intent = interpret({ question: 'what is the weather today', locale: 'en', catalog, context: ctxIC });
    expect(intent.kind).toBe('unknown');
  });
});

describe('copilot AI · permission-aware answers (via the deterministic engine)', () => {
  it('blocks when the caller lacks the permission, with a remedy', () => {
    const intent = interpret({ question: "Why can't I add a customer?", locale: 'en', catalog });
    const ans = resolveAnswer(intent, cctx({ permissions: [] }), 'en');
    expect(ans.answerKind).toBe('block');
    expect(ans.block?.allowed).toBe(false);
    expect(ans.block?.reasons.map((r) => r.code)).toContain('permission_missing');
  });

  it('allows the SAME question when the caller holds the permission', () => {
    const intent = interpret({ question: "Why can't I add a customer?", locale: 'en', catalog });
    const ans = resolveAnswer(intent, cctx({ permissions: ['customers.manage'] }), 'en');
    expect(ans.answerKind).toBe('block');
    expect(ans.block?.allowed).toBe(true);
    expect(ans.block?.reasons).toHaveLength(0);
  });

  it('unknown question yields a helpful message + suggestions, never tenant data', () => {
    const ans = resolveAnswer({ kind: 'unknown', confidence: 0 }, cctx(), 'ar');
    expect(ans.answerKind).toBe('unknown');
    expect(ans.suggestions && ans.suggestions.length).toBeGreaterThan(0);
    expect(ans.message).toBeTruthy();
  });
});
