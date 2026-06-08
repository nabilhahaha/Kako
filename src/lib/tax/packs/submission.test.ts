import { describe, it, expect } from 'vitest';
import { canTransition, transition, isTerminal, onRejected, InvalidTransitionError, DEFAULT_MAX_ATTEMPTS } from './submission';

describe('submission state machine', () => {
  it('allows the happy path draft→generated→signed→submitted→cleared', () => {
    let s = transition('draft', 'generated');
    s = transition(s, 'signed');
    s = transition(s, 'submitted');
    expect(transition(s, 'cleared')).toBe('cleared');
  });

  it('allows submitted→reported (B2C reporting path)', () => {
    expect(canTransition('submitted', 'reported')).toBe(true);
  });

  it('rejects illegal transitions', () => {
    expect(canTransition('draft', 'submitted')).toBe(false);
    expect(canTransition('cleared', 'generated')).toBe(false);
    expect(() => transition('draft', 'cleared')).toThrow(InvalidTransitionError);
  });

  it('allows cancel from any non-terminal and detects terminals', () => {
    for (const s of ['draft', 'generated', 'signed'] as const) expect(canTransition(s, 'cancelled')).toBe(true);
    expect(isTerminal('cleared')).toBe(true);
    expect(isTerminal('reported')).toBe(true);
    expect(isTerminal('cancelled')).toBe(true);
    expect(isTerminal('submitted')).toBe(false);
  });

  it('retries a rejection until max attempts, then cancels', () => {
    expect(onRejected(0)).toEqual({ retry: true, nextStatus: 'generated', attempts: 1 });
    expect(onRejected(DEFAULT_MAX_ATTEMPTS - 2)).toMatchObject({ retry: true, nextStatus: 'generated' });
    expect(onRejected(DEFAULT_MAX_ATTEMPTS - 1)).toEqual({ retry: false, nextStatus: 'cancelled', attempts: DEFAULT_MAX_ATTEMPTS });
  });

  it('rejected can be regenerated (retry loop)', () => {
    expect(canTransition('rejected', 'generated')).toBe(true);
    expect(canTransition('rejected', 'cancelled')).toBe(true);
  });
});
