// ============================================================================
// Workflow Builder — pure template→engine mapper (Phase 8A-2). Converts a stored
// TemplateDefinition into the row shapes the EXISTING engine tables expect
// (erp_workflow_definitions + erp_workflow_steps), so instantiation reuses the
// engine with no forked semantics. Pure: no I/O (the server action does the insert).
// ============================================================================

import type { TemplateDefinition, TemplateStep } from './templates';

export interface DefinitionRow {
  company_id: string;
  key: string;
  entity: string;
  name_ar: string;
  name_en: string | null;
}

export interface StepRow {
  step_no: number;
  step_type: string;
  name: string | null;
  approver_type: string | null;   // null for system steps (notification/condition/update_record)
  approver_ref: string | null;
  mode: string;
  required_approvals: number;
  sla_hours: number | null;
  escalate_to: string | null;
  condition: Record<string, unknown> | null;
  config: Record<string, unknown>;
}

/** A 'system' approver means "no human approver" → store NULL approver_type so the
 *  engine treats it as an automatic step (notification/condition/update_record). */
function mapApproverType(t: string): string | null {
  return t === 'system' ? null : t;
}

/** Map a template step to an erp_workflow_steps row. Pure. */
export function stepToRow(s: TemplateStep): StepRow {
  return {
    step_no: s.stepNo,
    step_type: s.stepType,
    name: s.name || null,
    approver_type: mapApproverType(s.approverType),
    approver_ref: s.approverRef ?? null,
    mode: s.mode,
    // Approval steps need >= 1; non-approval steps store 1 (engine ignores it).
    required_approvals: s.stepType === 'approval' ? Math.max(1, s.requiredApprovals || 1) : 1,
    sla_hours: s.slaHours ?? null,
    escalate_to: s.escalateTo ?? null,
    condition: s.stepType === 'condition' ? (s.config ?? {}) : null,
    config: s.config ?? {},
  };
}

/** Map a whole template into a definition row + ordered step rows. Pure. */
export function templateToRows(
  def: TemplateDefinition,
  opts: { companyId: string; key: string; nameAr: string; nameEn?: string | null },
): { definition: DefinitionRow; steps: StepRow[] } {
  return {
    definition: {
      company_id: opts.companyId,
      key: opts.key,
      entity: def.entity,
      name_ar: opts.nameAr,
      name_en: opts.nameEn ?? null,
    },
    steps: [...def.steps]
      .sort((a, b) => a.stepNo - b.stepNo)
      .map(stepToRow),
  };
}
