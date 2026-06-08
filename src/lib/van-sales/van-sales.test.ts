import { describe, it, expect } from 'vitest';
import {
  VAN_SALES_ENABLED,
  transition, canSell, allowedActions, primaryAction,
  EMPTY_DAY_CONTEXT, type VanDayContext, type VanDayState,
} from './index';

const ctx = (over: Partial<VanDayContext> = {}): VanDayContext => ({ ...EMPTY_DAY_CONTEXT, ...over });

describe('van-sales/flag', () => {
  it('defaults OFF', () => { expect(VAN_SALES_ENABLED()).toBe(false); });
});

describe('van-sales/day · transitions', () => {
  it('start_day opens a load-pending day, once', () => {
    expect(transition('not_started', 'start_day', ctx())).toEqual({ ok: true, state: 'load_pending' });
    expect(transition('load_pending', 'start_day', ctx())).toEqual({ ok: false, reason: 'day_already_started' });
  });

  it('confirm_load requires a confirmed load AND a cash float', () => {
    expect(transition('load_pending', 'confirm_load', ctx())).toEqual({ ok: false, reason: 'load_not_confirmed' });
    expect(transition('load_pending', 'confirm_load', ctx({ loadConfirmed: true }))).toEqual({ ok: false, reason: 'cash_float_required' });
    expect(transition('load_pending', 'confirm_load', ctx({ loadConfirmed: true, cashFloatEntered: true }))).toEqual({ ok: true, state: 'open' });
  });

  it('begin_close requires an open day with nothing unsynced', () => {
    expect(transition('open', 'begin_close', ctx({ unsyncedDocs: 2 }))).toEqual({ ok: false, reason: 'unsynced_documents' });
    expect(transition('open', 'begin_close', ctx())).toEqual({ ok: true, state: 'closing' });
    expect(transition('load_pending', 'begin_close', ctx())).toEqual({ ok: false, reason: 'day_not_open' });
  });

  it('settle requires a complete count and a balanced settlement', () => {
    expect(transition('closing', 'settle', ctx({ countComplete: true }))).toEqual({ ok: false, reason: 'settlement_unbalanced' });
    expect(transition('closing', 'settle', ctx({ countComplete: true, settlementBalanced: true }))).toEqual({ ok: true, state: 'closed' });
  });
});

describe('van-sales/day · gates', () => {
  it('selling is only allowed while OPEN', () => {
    const states: VanDayState[] = ['not_started', 'load_pending', 'open', 'closing', 'closed'];
    expect(states.filter(canSell)).toEqual(['open']);
  });

  it('primaryAction drives the one Today CTA', () => {
    expect(primaryAction('not_started', ctx())).toBe('start_day');
    expect(primaryAction('load_pending', ctx({ loadConfirmed: true, cashFloatEntered: true }))).toBe('confirm_load');
    expect(primaryAction('open', ctx())).toBe('begin_close');
    expect(primaryAction('closed', ctx())).toBeNull();
    expect(allowedActions('load_pending', ctx())).toEqual([]); // load not confirmed → nothing actionable yet
  });
});
