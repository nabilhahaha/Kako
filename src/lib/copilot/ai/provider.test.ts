import { describe, it, expect, afterEach, vi } from 'vitest';
import { buildCatalog } from './catalog';
import { resolveIntent, registerLlmProvider } from './provider';
import type { CopilotAiProvider } from './types';

const catalog = buildCatalog();
const base = {
  question: "Why can't I add a customer?",
  locale: 'en' as const,
  catalog,
  context: { permissions: [], modules: ['sales'], privileged: false },
};

afterEach(() => registerLlmProvider(null));

describe('copilot AI · provider resolution (flag + fallback)', () => {
  it('feature flag OFF disables AI: the LLM provider is NEVER called', async () => {
    const spy = vi.fn(() => ({ kind: 'why_blocked' as const, key: 'customer.create', confidence: 1 }));
    registerLlmProvider({ name: 'spy', interpret: spy });

    const res = await resolveIntent({ ...base, aiEnabled: false });
    expect(spy).not.toHaveBeenCalled();
    expect(res.provider).toBe('deterministic');
    expect(res.fallbackUsed).toBe(false);
    expect(res.intent.kind).toBe('why_blocked'); // deterministic still answers
  });

  it('falls back to deterministic when the LLM provider THROWS', async () => {
    const thrower: CopilotAiProvider = {
      name: 'boom',
      interpret: () => { throw new Error('model unavailable'); },
    };
    registerLlmProvider(thrower);

    const res = await resolveIntent({ ...base, aiEnabled: true });
    expect(res.provider).toBe('deterministic');
    expect(res.fallbackUsed).toBe(true);
    expect(res.intent.key).toBe('customer.create'); // deterministic result
  });

  it('falls back when the LLM returns an unconfident "unknown"', async () => {
    registerLlmProvider({ name: 'weak', interpret: () => ({ kind: 'unknown', confidence: 0 }) });
    const res = await resolveIntent({ ...base, aiEnabled: true });
    expect(res.provider).toBe('deterministic');
    expect(res.fallbackUsed).toBe(true);
  });

  it('uses the LLM result when enabled and confident', async () => {
    registerLlmProvider({ name: 'good', interpret: () => ({ kind: 'training', key: 'create_route', confidence: 0.9 }) });
    const res = await resolveIntent({ ...base, aiEnabled: true });
    expect(res.provider).toBe('llm:good');
    expect(res.fallbackUsed).toBe(false);
    expect(res.intent.key).toBe('create_route');
  });

  it('with no LLM registered, AI-enabled still resolves deterministically', async () => {
    const res = await resolveIntent({ ...base, aiEnabled: true });
    expect(res.provider).toBe('deterministic');
  });
});
