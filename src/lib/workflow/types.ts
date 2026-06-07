// ============================================================================
// Workflow OS + Event Bus — shared types (Constitution Art. 32/43, P0-01).
//
// ONE engine: these types describe the EXISTING workflow tables
// (erp_workflow_definitions / _steps / _instances / _tasks) as extended by
// migration 0176, plus the new shared event bus (erp_events). No parallel engine.
// ============================================================================

/** Source of a domain event (erp_events.source). */
export type EventSource = 'app' | 'workflow' | 'integration' | 'sync' | 'system';

/** Generic workflow step kinds (erp_workflow_steps.step_type). Existing rows
 *  default to 'approval' — the engine's current behavior is unchanged. */
export type WorkflowStepType =
  | 'condition' | 'approval' | 'task' | 'notification'
  | 'api_call' | 'update_record' | 'delay' | 'escalation';

export type WorkflowInstanceStatus =
  | 'pending' | 'approved' | 'rejected' | 'cancelled' | 'escalated';

/** A domain event on the shared bus. */
export interface DomainEvent {
  id: string;
  companyId: string;
  branchId: string | null;
  eventType: string;          // e.g. 'invoice.issued'
  entity: string;             // neutral entity key, matches workflow `entity`
  recordId: string | null;
  payload: Record<string, unknown>;
  actorId: string | null;
  source: EventSource;
  occurredAt: string;
}

/** A workflow definition (template) — extended for event triggers + builder. */
export interface WorkflowDefinition {
  id: string;
  companyId: string | null;   // null = global template
  branchId: string | null;    // null = company-wide
  key: string;
  entity: string;
  nameEn: string | null;
  nameAr: string | null;
  description: string | null;
  trigger: string;            // legacy start mode ('manual' default)
  triggerEvent: string | null;       // event_type that auto-starts this workflow
  triggerConfig: Record<string, unknown>; // event filter (see trigger-match)
  isActive: boolean;
  version: number;
}

export interface WorkflowStep {
  id: string;
  definitionId: string;
  stepNo: number;
  stepType: WorkflowStepType;
  name: string | null;
  approverType: string;
  approverRef: string | null;
  mode: 'sequential' | 'parallel';
  requiredApprovals: number;
  condition: Record<string, unknown> | null;
  slaHours: number | null;
  escalateTo: string | null;
  config: Record<string, unknown>;
}
