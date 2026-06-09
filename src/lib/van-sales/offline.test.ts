import { describe, it, expect } from 'vitest';
import { APPLY_WHITELIST, isApplicable } from '@/lib/offline-sync';

// Van load confirmation is offline-first: queued on-device, applied EXACTLY-ONCE
// server-side on sync via the same atomic confirm RPC. Create-only — updates and
// deletes must never be auto-applied (the confirmation is immutable; the RPC is
// idempotent per manifest).
describe('van-sales/offline · whitelist', () => {
  it('van_load_confirmation is create-only', () => {
    expect(APPLY_WHITELIST.van_load_confirmation).toEqual(['create']);
    expect(isApplicable('van_load_confirmation', 'create')).toBe(true);
    expect(isApplicable('van_load_confirmation', 'update')).toBe(false);
    expect(isApplicable('van_load_confirmation', 'delete')).toBe(false);
  });
});
