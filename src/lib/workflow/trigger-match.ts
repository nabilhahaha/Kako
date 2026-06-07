// ============================================================================
// Pure event→workflow trigger matcher (Constitution Art. 10 Condition / Art. 43).
//
// Decides whether a workflow definition should start in response to a domain
// event, BEFORE delegating the actual run to the existing engine RPC
// (erp_workflow_start). Pure + unit-testable — no DB, no side effects.
//
// trigger_config shape (all optional):
//   { entity?: string,                      // override the definition.entity match
//     where?: Record<string, string|number|boolean|null>,  // payload equality filter
//     branchScoped?: boolean }              // require event.branchId === definition.branchId
// Richer per-step condition evaluation already exists server-side
// (erp_workflow_condition_met); this is only the start gate.
// ============================================================================

import type { DomainEvent, WorkflowDefinition } from './types';

type Primitive = string | number | boolean | null;

export interface TriggerConfig {
  entity?: string;
  where?: Record<string, Primitive>;
  branchScoped?: boolean;
}

/** True if `def` should start for `event`. */
export function matchesTrigger(def: WorkflowDefinition, event: DomainEvent): boolean {
  if (!def.isActive) return false;
  if (!def.triggerEvent || def.triggerEvent !== event.eventType) return false;

  const cfg = (def.triggerConfig ?? {}) as TriggerConfig;

  // entity gate: trigger_config.entity overrides, else the definition's entity.
  const wantEntity = cfg.entity ?? def.entity;
  if (wantEntity && wantEntity !== event.entity) return false;

  // branch scope: only when the definition is branch-bound and config asks for it.
  if (cfg.branchScoped && def.branchId && def.branchId !== event.branchId) return false;

  // payload equality filter.
  if (cfg.where) {
    for (const [k, v] of Object.entries(cfg.where)) {
      if (!valueEquals(event.payload?.[k], v)) return false;
    }
  }
  return true;
}

/** Select the definitions (already loaded for this company + event_type) that
 *  match the event. Company-specific definitions win over global templates. */
export function selectTriggeredDefinitions(defs: WorkflowDefinition[], event: DomainEvent): WorkflowDefinition[] {
  const matched = defs.filter((d) => matchesTrigger(d, event));
  // de-dupe by key, preferring a company-specific def over a global (companyId null)
  const byKey = new Map<string, WorkflowDefinition>();
  for (const d of matched) {
    const prev = byKey.get(d.key);
    if (!prev || (prev.companyId === null && d.companyId !== null)) byKey.set(d.key, d);
  }
  return [...byKey.values()];
}

function valueEquals(a: unknown, b: Primitive): boolean {
  if (b === null) return a === null || a === undefined;
  // tolerate string/number coercion from JSONB payloads
  if (typeof b === 'number') return Number(a) === b;
  if (typeof b === 'boolean') return Boolean(a) === b;
  return String(a) === String(b);
}
