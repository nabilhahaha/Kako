import type { SupabaseClient } from '@supabase/supabase-js';

// Critical Alerts Framework — typed model. Rules are DB-canonical (global default
// + per-company override); sources + channels are code registries any module
// contributes to.

export type AlertSeverity = 'info' | 'warning' | 'high' | 'critical';
export type AlertStatus = 'open' | 'acknowledged' | 'snoozed' | 'resolved';
export type RecipientType = 'role' | 'company_admin' | 'user' | 'permission';

/** A resolved alert rule (one erp_alert_rules row). */
export interface AlertRule {
  companyId: string | null;
  ruleKey: string;
  sourceKey: string;
  severity: AlertSeverity;
  threshold: Record<string, unknown>;
  recipientType: RecipientType;
  recipientRef: string | null;
  channels: string[];
  snoozeDefaultHours: number;
  isActive: boolean;
}

/** What a source yields when its condition fires for one subject. */
export interface AlertCandidate {
  dedupeKey: string;            // stable per (condition, subject) → one live alert
  entity?: string | null;
  recordId?: string | null;
  severity?: AlertSeverity;     // override the rule severity (e.g. escalate)
  title: string;
  body: string;
  payload?: Record<string, unknown>;
}

/** Dependencies an evaluator/dispatcher needs (kept minimal + injectable). */
export interface AlertDeps {
  db: SupabaseClient;
  companyId: string;
  now: () => number;
}

/** A registered alert source — evaluates a rule for a company against existing data. */
export interface AlertSource {
  key: string;
  /** Read tenant data and return the candidates whose condition currently fires. */
  evaluate(deps: AlertDeps, rule: AlertRule): Promise<AlertCandidate[]>;
}

/** A notification channel adapter (email/whatsapp/sms). `in_app` is built in. */
export interface AlertChannelAdapter {
  key: string;
  deliver(input: {
    companyId: string;
    userIds: string[];
    severity: AlertSeverity;
    title: string;
    body: string;
    link?: string;
  }): Promise<void>;
}

/** Raw erp_alert_rules row shape (snake_case). */
export interface AlertRuleRow {
  company_id: string | null;
  rule_key: string;
  source_key: string;
  severity: AlertSeverity | null;
  threshold: unknown;
  recipient_type: RecipientType | null;
  recipient_ref: string | null;
  channels: unknown;
  snooze_default_hours: number | null;
  is_active: boolean | null;
}
