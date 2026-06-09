import { describe, it, expect } from 'vitest';
import {
  ALERTS_ENABLED,
  maxSeverity,
  registerAlertSource,
  getAlertSource,
  listAlertSources,
  registerAlertChannel,
  getAlertChannel,
  parseAlertRule,
  effectiveRules,
} from './index';
import type { AlertRuleRow } from './types';

describe('alerts/flags', () => {
  it('defaults OFF; on for 1/true', () => {
    const prev = process.env.KAKO_ALERTS;
    delete process.env.KAKO_ALERTS;
    expect(ALERTS_ENABLED()).toBe(false);
    process.env.KAKO_ALERTS = '1';
    expect(ALERTS_ENABLED()).toBe(true);
    process.env.KAKO_ALERTS = 'nope';
    expect(ALERTS_ENABLED()).toBe(false);
    if (prev === undefined) delete process.env.KAKO_ALERTS; else process.env.KAKO_ALERTS = prev;
  });
});

describe('alerts/severity', () => {
  it('maxSeverity ranks info < warning < high < critical', () => {
    expect(maxSeverity('info', 'warning')).toBe('warning');
    expect(maxSeverity('critical', 'high')).toBe('critical');
    expect(maxSeverity('high', 'high')).toBe('high');
  });
});

describe('alerts/registries', () => {
  it('source + channel round-trip', () => {
    expect(getAlertSource('nope')).toBeUndefined();
    const src = { key: 'low_stock', evaluate: async () => [] };
    registerAlertSource(src);
    expect(getAlertSource('low_stock')).toBe(src);
    expect(listAlertSources().some((s) => s.key === 'low_stock')).toBe(true);

    const ch = { key: 'email', deliver: async () => {} };
    registerAlertChannel(ch);
    expect(getAlertChannel('email')).toBe(ch);
    expect(getAlertChannel('sms')).toBeUndefined();
  });
});

const row = (over: Partial<AlertRuleRow>): AlertRuleRow => ({
  company_id: null, rule_key: 'low_stock', source_key: 'low_stock', severity: null,
  threshold: {}, recipient_type: null, recipient_ref: null, channels: null,
  snooze_default_hours: null, is_active: null, ...over,
});

describe('alerts/rule parsing', () => {
  it('applies safe defaults + coerces', () => {
    const r = parseAlertRule(row({}));
    expect(r).toMatchObject({
      severity: 'warning', recipientType: 'company_admin', channels: ['in_app'],
      snoozeDefaultHours: 24, isActive: true, threshold: {},
    });
    const r2 = parseAlertRule(row({ severity: 'critical', channels: ['in_app', 'email', 1], threshold: { pct: 15 } }));
    expect(r2.severity).toBe('critical');
    expect(r2.channels).toEqual(['in_app', 'email']);   // non-strings dropped
    expect(r2.threshold).toEqual({ pct: 15 });
  });

  it('effectiveRules: company override wins over global; inactive dropped', () => {
    const rows = [
      row({ rule_key: 'low_stock', company_id: null, severity: 'warning' }),
      row({ rule_key: 'low_stock', company_id: 'c1', severity: 'high' }),
      row({ rule_key: 'credit', company_id: null }),
      row({ rule_key: 'gone', company_id: null, is_active: false }),
    ];
    const eff = effectiveRules(rows, 'c1');
    const low = eff.find((r) => r.ruleKey === 'low_stock');
    expect(low?.severity).toBe('high');                 // company override
    expect(eff.find((r) => r.ruleKey === 'credit')).toBeTruthy(); // global default kept
    expect(eff.find((r) => r.ruleKey === 'gone')).toBeUndefined(); // inactive dropped
  });
});
