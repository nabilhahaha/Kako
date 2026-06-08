// ============================================================================
// Workflow Builder — template model + pure catalog helpers (Phase 8A). Pure: no
// I/O. The template `definition` maps 1:1 onto the engine's WorkflowDefinition +
// WorkflowStep rows when a tenant instantiates it (later increment). Validation
// here keeps a stored template instantiable.
// ============================================================================

import type { WorkflowStepType } from '@/lib/workflow/types';

export type TemplateCategory =
  | 'customer' | 'price' | 'trade_spend' | 'return' | 'collection'
  | 'purchase' | 'credit' | 'data_update' | 'expiry' | 'custom';

/** A step inside a template definition (maps to erp_workflow_steps). */
export interface TemplateStep {
  stepNo: number;
  stepType: WorkflowStepType;
  name: string;
  approverType: string;            // 'role' | 'user' | 'system' | …
  approverRef: string | null;      // role key / user id; null for system steps
  mode: 'sequential' | 'parallel';
  requiredApprovals: number;
  slaHours: number | null;
  escalateTo: string | null;
  config: Record<string, unknown>;
}

/** A template definition (maps to a WorkflowDefinition + its steps). */
export interface TemplateDefinition {
  entity: string;
  trigger: string;                 // 'manual' | event_type
  steps: TemplateStep[];
}

/** A catalog row (mirror of erp_workflow_templates, minus storage columns). */
export interface WorkflowTemplate {
  id: string;
  companyId: string | null;        // null = global seed
  code: string;
  nameEn: string;
  nameAr: string;
  category: TemplateCategory;
  entity: string;
  definition: TemplateDefinition;
  isActive: boolean;
}

/** Active templates of a category (or all). Globals + the tenant's own. Pure. */
export function filterTemplates(
  all: readonly WorkflowTemplate[],
  opts: { category?: TemplateCategory; activeOnly?: boolean } = {},
): WorkflowTemplate[] {
  const activeOnly = opts.activeOnly !== false;
  return all.filter(
    (t) => (!activeOnly || t.isActive) && (!opts.category || t.category === opts.category),
  );
}

/** Validate a template definition is instantiable. Pure. Returns problems (empty = OK). */
export function validateTemplateDefinition(def: TemplateDefinition): string[] {
  const problems: string[] = [];
  if (!def.entity) problems.push('missing entity');
  if (!Array.isArray(def.steps) || def.steps.length === 0) problems.push('no steps');
  const seen = new Set<number>();
  for (const s of def.steps ?? []) {
    if (seen.has(s.stepNo)) problems.push(`duplicate stepNo ${s.stepNo}`);
    seen.add(s.stepNo);
    if (s.stepType === 'approval' && (s.requiredApprovals ?? 0) < 1) {
      problems.push(`approval step ${s.stepNo} needs requiredApprovals >= 1`);
    }
    if ((s.approverType === 'role' || s.approverType === 'user') && !s.approverRef) {
      problems.push(`step ${s.stepNo} (${s.approverType}) missing approverRef`);
    }
  }
  // Steps should form a contiguous 1..n sequence (the engine orders by stepNo).
  const nos = (def.steps ?? []).map((s) => s.stepNo).sort((a, b) => a - b);
  nos.forEach((n, i) => { if (n !== i + 1) problems.push(`stepNo not contiguous at ${n}`); });
  return problems;
}

/** True when every template in the catalog is instantiable. Pure (used in tests). */
export function catalogIsValid(all: readonly WorkflowTemplate[]): boolean {
  return all.every((t) => validateTemplateDefinition(t.definition).length === 0);
}
