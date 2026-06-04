import { describe, it, expect, afterEach } from 'vitest';
import { parseFlag, isCopilotAiEnabled } from './flags';

describe('copilot AI · feature flag', () => {
  const original = process.env.COPILOT_AI_ENABLED;
  afterEach(() => {
    if (original === undefined) delete process.env.COPILOT_AI_ENABLED;
    else process.env.COPILOT_AI_ENABLED = original;
  });

  it('parseFlag is OFF for undefined / empty / anything but "true"', () => {
    expect(parseFlag(undefined)).toBe(false);
    expect(parseFlag('')).toBe(false);
    expect(parseFlag('false')).toBe(false);
    expect(parseFlag('1')).toBe(false);
    expect(parseFlag('on')).toBe(false);
  });

  it('parseFlag is ON only for "true" (case/space-insensitive)', () => {
    expect(parseFlag('true')).toBe(true);
    expect(parseFlag('TRUE')).toBe(true);
    expect(parseFlag('  true  ')).toBe(true);
  });

  it('isCopilotAiEnabled defaults OFF when env is unset', () => {
    delete process.env.COPILOT_AI_ENABLED;
    expect(isCopilotAiEnabled()).toBe(false);
  });

  it('isCopilotAiEnabled honours the env var', () => {
    process.env.COPILOT_AI_ENABLED = 'true';
    expect(isCopilotAiEnabled()).toBe(true);
    process.env.COPILOT_AI_ENABLED = 'false';
    expect(isCopilotAiEnabled()).toBe(false);
  });
});
