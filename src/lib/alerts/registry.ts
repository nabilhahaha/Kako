// Critical Alerts Framework — source + channel registries and rule parsing. PURE
// (no I/O). Modules register sources/channels at import; the engine reads the
// registry — no per-source branches. DB rules stay canonical; this parses them.

import type { AlertRule, AlertRuleRow, AlertSource, AlertChannelAdapter, AlertSeverity } from './types';

const SEVERITY_RANK: Record<AlertSeverity, number> = { info: 0, warning: 1, high: 2, critical: 3 };

/** The more urgent of two severities. */
export function maxSeverity(a: AlertSeverity, b: AlertSeverity): AlertSeverity {
  return SEVERITY_RANK[a] >= SEVERITY_RANK[b] ? a : b;
}

// ── Source registry ─────────────────────────────────────────────────────────
const sources = new Map<string, AlertSource>();
export function registerAlertSource(source: AlertSource): void { sources.set(source.key, source); }
export function getAlertSource(key: string): AlertSource | undefined { return sources.get(key); }
export function listAlertSources(): AlertSource[] { return [...sources.values()]; }

// ── Channel registry (in_app is handled directly; adapters add email/whatsapp/sms) ──
const channels = new Map<string, AlertChannelAdapter>();
export function registerAlertChannel(adapter: AlertChannelAdapter): void { channels.set(adapter.key, adapter); }
export function getAlertChannel(key: string): AlertChannelAdapter | undefined { return channels.get(key); }

// ── Rule parsing (DB row → typed) ───────────────────────────────────────────
function asStringArray(v: unknown, fallback: string[]): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : fallback;
}
function asObject(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

export function parseAlertRule(row: AlertRuleRow): AlertRule {
  return {
    companyId: row.company_id ?? null,
    ruleKey: row.rule_key,
    sourceKey: row.source_key,
    severity: row.severity ?? 'warning',
    threshold: asObject(row.threshold),
    recipientType: row.recipient_type ?? 'company_admin',
    recipientRef: row.recipient_ref ?? null,
    channels: asStringArray(row.channels, ['in_app']),
    snoozeDefaultHours: row.snooze_default_hours ?? 24,
    isActive: row.is_active ?? true,
  };
}

/** Resolve effective rules for a company: a company override wins over the global
 *  default with the same rule_key. Returns only active rules. */
export function effectiveRules(rows: AlertRuleRow[], companyId: string): AlertRule[] {
  const byKey = new Map<string, AlertRuleRow>();
  for (const r of rows) {
    const prev = byKey.get(r.rule_key);
    // company-specific row wins over a global (company_id null) one
    if (!prev || (prev.company_id === null && r.company_id === companyId)) byKey.set(r.rule_key, r);
  }
  return [...byKey.values()].map(parseAlertRule).filter((r) => r.isActive);
}
