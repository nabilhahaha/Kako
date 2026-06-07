import { describe, it, expect, afterEach } from 'vitest';
import { WF_CLAIM_DUE_RUNS, WF_EFFECT_IDEMPOTENCY, WF_DISPATCH_SWEEP, WF_CLAIM_LEASE_SECONDS } from './flags';

const KEYS = ['KAKO_WF_CLAIM', 'KAKO_WF_IDEMPOTENT', 'KAKO_WF_DISPATCH_SWEEP', 'KAKO_WF_CLAIM_LEASE_SECONDS'] as const;
const saved: Record<string, string | undefined> = {};
for (const k of KEYS) saved[k] = process.env[k];
afterEach(() => { for (const k of KEYS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; } });

describe('workflow V1.1 hardening flags — default OFF', () => {
  it('all hardening flags default OFF when unset', () => {
    for (const k of KEYS) delete process.env[k];
    expect(WF_CLAIM_DUE_RUNS()).toBe(false);
    expect(WF_EFFECT_IDEMPOTENCY()).toBe(false);
    expect(WF_DISPATCH_SWEEP()).toBe(false);
  });

  it('accepts "1" and "true" as ON, everything else OFF', () => {
    process.env.KAKO_WF_CLAIM = '1'; expect(WF_CLAIM_DUE_RUNS()).toBe(true);
    process.env.KAKO_WF_CLAIM = 'true'; expect(WF_CLAIM_DUE_RUNS()).toBe(true);
    process.env.KAKO_WF_CLAIM = 'yes'; expect(WF_CLAIM_DUE_RUNS()).toBe(false);
    process.env.KAKO_WF_CLAIM = '0'; expect(WF_CLAIM_DUE_RUNS()).toBe(false);
  });

  it('lease seconds defaults to 300 and parses positive overrides', () => {
    delete process.env.KAKO_WF_CLAIM_LEASE_SECONDS;
    expect(WF_CLAIM_LEASE_SECONDS()).toBe(300);
    process.env.KAKO_WF_CLAIM_LEASE_SECONDS = '60';
    expect(WF_CLAIM_LEASE_SECONDS()).toBe(60);
    process.env.KAKO_WF_CLAIM_LEASE_SECONDS = 'bad';
    expect(WF_CLAIM_LEASE_SECONDS()).toBe(300);
  });
});
