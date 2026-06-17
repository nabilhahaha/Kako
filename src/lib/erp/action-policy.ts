import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  CRITICAL_ACTIONS, CRITICAL_ACTIONS_BY_KEY,
  type CriticalActionSpec, type RiskLevel, type ReversalPolicy,
} from './critical-actions-catalog';

/**
 * VANTORA — Critical Action policy resolver (tenant-scoped).
 *
 * Resolves the EFFECTIVE policy for an action in a company: the currently-active
 * override row in `erp_action_policies` (RLS-scoped) if present, else the code
 * default from the FMCG catalog. This is the single read path the wired flows and
 * the admin screen consume, so behaviour is configurable per tenant instead of
 * hard-coded. Server-only (reads the DB under the caller's RLS).
 */

export interface ResolvedActionPolicy {
  actionKey: string;
  enabled: boolean;
  risk: RiskLevel;
  reasonRequired: boolean;
  approvalRequired: boolean;
  notifyTargets: string[];
  escalationTargets: string[];
  reversalAllowed: boolean;
  reversalPolicy: ReversalPolicy;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  /** Whether the values came from a tenant override or the catalog default. */
  source: 'policy' | 'catalog';
  policyId: string | null;
}

interface PolicyRow {
  id: string;
  action_key: string;
  enabled: boolean;
  risk_level: RiskLevel;
  reason_required: boolean;
  approval_required: boolean;
  notify_targets: string[] | null;
  escalation_targets: string[] | null;
  reversal_allowed: boolean;
  reversal_policy: ReversalPolicy;
  effective_from: string;
  effective_to: string | null;
}

const SELECT =
  'id, action_key, enabled, risk_level, reason_required, approval_required, notify_targets, escalation_targets, reversal_allowed, reversal_policy, effective_from, effective_to';

function fromCatalog(spec: CriticalActionSpec): ResolvedActionPolicy {
  return {
    actionKey: spec.key,
    enabled: true,
    risk: spec.risk,
    reasonRequired: spec.reasonRequired,
    approvalRequired: spec.approvalRequired,
    notifyTargets: spec.notifyTargets,
    escalationTargets: [],
    reversalAllowed: spec.reversalPolicy !== 'irreversible',
    reversalPolicy: spec.reversalPolicy,
    effectiveFrom: null,
    effectiveTo: null,
    source: 'catalog',
    policyId: null,
  };
}

/** Safe default for an action key absent from the catalog (defensive). */
function genericDefault(actionKey: string): ResolvedActionPolicy {
  return {
    actionKey, enabled: true, risk: 'medium', reasonRequired: false, approvalRequired: false,
    notifyTargets: [], escalationTargets: [], reversalAllowed: true, reversalPolicy: 'reversible',
    effectiveFrom: null, effectiveTo: null, source: 'catalog', policyId: null,
  };
}

function fromRow(r: PolicyRow): ResolvedActionPolicy {
  return {
    actionKey: r.action_key,
    enabled: r.enabled,
    risk: r.risk_level,
    reasonRequired: r.reason_required,
    approvalRequired: r.approval_required,
    notifyTargets: r.notify_targets ?? [],
    escalationTargets: r.escalation_targets ?? [],
    reversalAllowed: r.reversal_allowed,
    reversalPolicy: r.reversal_policy,
    effectiveFrom: r.effective_from,
    effectiveTo: r.effective_to,
    source: 'policy',
    policyId: r.id,
  };
}

function catalogDefault(actionKey: string): ResolvedActionPolicy {
  const spec = CRITICAL_ACTIONS_BY_KEY[actionKey];
  return spec ? fromCatalog(spec) : genericDefault(actionKey);
}

/** Resolve the effective policy for ONE action (override row, else catalog default). */
export async function getActionPolicy(
  supabase: SupabaseClient,
  companyId: string | null | undefined,
  actionKey: string,
): Promise<ResolvedActionPolicy> {
  if (!companyId) return catalogDefault(actionKey);
  const nowIso = new Date().toISOString();
  const { data } = await supabase
    .from('erp_action_policies')
    .select(SELECT)
    .eq('company_id', companyId)
    .eq('action_key', actionKey)
    .eq('enabled', true)
    .lte('effective_from', nowIso)
    .or(`effective_to.is.null,effective_to.gt.${nowIso}`)
    .order('effective_from', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ? fromRow(data as PolicyRow) : catalogDefault(actionKey);
}

/** Resolve ALL catalog actions for a company (override row, else default), in
 *  catalog order — the data source for the admin settings screen. */
export async function getAllActionPolicies(
  supabase: SupabaseClient,
  companyId: string | null | undefined,
): Promise<ResolvedActionPolicy[]> {
  if (!companyId) return CRITICAL_ACTIONS.map(fromCatalog);
  const nowIso = new Date().toISOString();
  const { data } = await supabase
    .from('erp_action_policies')
    .select(SELECT)
    .eq('company_id', companyId)
    .eq('enabled', true)
    .lte('effective_from', nowIso)
    .or(`effective_to.is.null,effective_to.gt.${nowIso}`)
    .order('effective_from', { ascending: false });
  const rows = (data ?? []) as PolicyRow[];
  // Keep the first (most recent effective) row per action_key.
  const byKey = new Map<string, PolicyRow>();
  for (const r of rows) if (!byKey.has(r.action_key)) byKey.set(r.action_key, r);
  return CRITICAL_ACTIONS.map((spec) => {
    const row = byKey.get(spec.key);
    return row ? fromRow(row) : fromCatalog(spec);
  });
}

/** Map a resolved policy to the client Critical-Action config overrides. */
export function policyToConfig(p: ResolvedActionPolicy): { requireReason: boolean; irreversible: boolean; enabled: boolean } {
  return {
    requireReason: p.reasonRequired,
    irreversible: p.reversalPolicy === 'irreversible',
    enabled: p.enabled,
  };
}
