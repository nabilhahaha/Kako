import { describe, it, expect, afterEach } from 'vitest';
import { parseFlag, isInsightsEnabled } from './flags';

describe('insights · flag (OFF by default)', () => {
  const orig = process.env.VANTORA_INSIGHTS_ENABLED;
  afterEach(() => { if (orig === undefined) delete process.env.VANTORA_INSIGHTS_ENABLED; else process.env.VANTORA_INSIGHTS_ENABLED = orig; });

  it('parseFlag only true for "true"', () => {
    expect(parseFlag(undefined)).toBe(false);
    expect(parseFlag('')).toBe(false);
    expect(parseFlag('1')).toBe(false);
    expect(parseFlag('TRUE')).toBe(true);
    expect(parseFlag('  true ')).toBe(true);
  });
  it('isInsightsEnabled defaults OFF', () => {
    delete process.env.VANTORA_INSIGHTS_ENABLED;
    expect(isInsightsEnabled()).toBe(false);
  });
});
