import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { effectiveRules, getAlertSource, getAlertChannel, maxSeverity } from './registry';
import { planAlertSync } from './evaluator';
import { resolveRecipients } from './recipients-server';
import type { AlertRule, AlertRuleRow, AlertCandidate, AlertSeverity } from './types';

// Server-side alert evaluation for ONE company (run by the cron with a service
// client → company_id is set explicitly on every read/write for tenant isolation).
// For each active rule: evaluate its source against existing data, upsert firing
// candidates (raise new / refresh existing / re-open resolved), auto-resolve alerts
// whose condition cleared, and dispatch + audit only the genuinely NEW ones.

export interface CompanyEvalResult { raised: number; refreshed: number; resolved: number }

const LIVE = ['open', 'acknowledged', 'snoozed'];

/** Await a Supabase builder/promise, swallowing errors (dispatch + audit are best-effort). */
const ignore = (p: PromiseLike<unknown>): Promise<void> => Promise.resolve(p).then(() => {}, () => {});

async function loadRules(db: SupabaseClient, companyId: string): Promise<AlertRule[]> {
  const { data } = await db
    .from('erp_alert_rules')
    .select('company_id, rule_key, source_key, severity, threshold, recipient_type, recipient_ref, channels, snooze_default_hours, is_active')
    .or(`company_id.eq.${companyId},company_id.is.null`);
  return effectiveRules((data ?? []) as unknown as AlertRuleRow[], companyId);
}

async function dispatch(db: SupabaseClient, companyId: string, rule: AlertRule, alert: { id: string; severity: AlertSeverity; title: string; body: string; entity: string | null; recordId: string | null }) {
  const userIds = await resolveRecipients(db, companyId, rule.recipientType, rule.recipientRef);
  for (const uid of userIds) {
    await ignore(db.rpc('erp_notify', {
      p_company: companyId, p_user: uid, p_type: `alert:${rule.sourceKey}`,
      p_title_ar: alert.title, p_title_en: alert.title, p_body: alert.body,
      p_link: '/alerts', p_entity: alert.entity, p_record_id: alert.recordId,
    }));
  }
  for (const ch of rule.channels) {
    if (ch === 'in_app') continue;
    const adapter = getAlertChannel(ch);
    if (adapter) await adapter.deliver({ companyId, userIds, severity: alert.severity, title: alert.title, body: alert.body, link: '/alerts' }).catch(() => {});
  }
}

export async function runCompanyAlerts(db: SupabaseClient, companyId: string, now: () => number = Date.now): Promise<CompanyEvalResult> {
  const out: CompanyEvalResult = { raised: 0, refreshed: 0, resolved: 0 };
  const rules = await loadRules(db, companyId);

  for (const rule of rules) {
    const source = getAlertSource(rule.sourceKey);
    if (!source) continue;

    let candidates: AlertCandidate[] = [];
    try {
      candidates = await source.evaluate({ db, companyId, now }, rule);
    } catch {
      continue; // a misbehaving source never breaks the run
    }

    // This rule's still-live alerts (to plan auto-resolve).
    const { data: live } = await db
      .from('erp_alerts')
      .select('dedupe_key')
      .eq('company_id', companyId).eq('rule_key', rule.ruleKey).in('status', LIVE);
    const liveKeys = ((live ?? []) as { dedupe_key: string }[]).map((r) => r.dedupe_key);

    const plan = planAlertSync(candidates, liveKeys);

    for (const cand of plan.raise) {
      const severity = maxSeverity(rule.severity, cand.severity ?? rule.severity);
      const { data: existing } = await db
        .from('erp_alerts')
        .select('id, status')
        .eq('company_id', companyId).eq('dedupe_key', cand.dedupeKey).maybeSingle();

      if (!existing) {
        const { data: ins } = await db.from('erp_alerts').insert({
          company_id: companyId, rule_key: rule.ruleKey, source_key: rule.sourceKey, severity,
          status: 'open', entity: cand.entity ?? null, record_id: cand.recordId ?? null,
          dedupe_key: cand.dedupeKey, title: cand.title, body: cand.body, payload: cand.payload ?? {},
        }).select('id').single();
        const id = (ins as { id: string } | null)?.id;
        if (id) {
          out.raised++;
          await ignore(db.rpc('erp_log_audit', { p_action: 'alert.raise', p_entity: 'alert', p_entity_id: id, p_details: { rule_key: rule.ruleKey, source_key: rule.sourceKey, severity, dedupe_key: cand.dedupeKey }, p_company_id: companyId }));
          await dispatch(db, companyId, rule, { id, severity, title: cand.title, body: cand.body, entity: cand.entity ?? null, recordId: cand.recordId ?? null });
        }
        continue;
      }

      const ex = existing as { id: string; status: string };
      const reopen = ex.status === 'resolved';
      await db.from('erp_alerts').update({
        severity, title: cand.title, body: cand.body, payload: cand.payload ?? {},
        ...(reopen ? { status: 'open', resolved_at: null, resolved_by: null, resolved_reason: null } : {}),
      }).eq('id', ex.id);
      if (reopen) {
        out.raised++;
        await ignore(db.rpc('erp_log_audit', { p_action: 'alert.raise', p_entity: 'alert', p_entity_id: ex.id, p_details: { rule_key: rule.ruleKey, reopened: true }, p_company_id: companyId }));
        await dispatch(db, companyId, rule, { id: ex.id, severity, title: cand.title, body: cand.body, entity: cand.entity ?? null, recordId: cand.recordId ?? null });
      } else {
        out.refreshed++;
      }
    }

    if (plan.resolveDedupeKeys.length) {
      const { data: res } = await db.from('erp_alerts')
        .update({ status: 'resolved', resolved_at: new Date(now()).toISOString(), resolved_reason: 'cleared' })
        .eq('company_id', companyId).eq('rule_key', rule.ruleKey).in('status', LIVE).in('dedupe_key', plan.resolveDedupeKeys)
        .select('id');
      out.resolved += ((res ?? []) as unknown[]).length;
    }
  }
  return out;
}
