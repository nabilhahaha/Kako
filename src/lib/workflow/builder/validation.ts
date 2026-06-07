// ============================================================================
// Builder validation (Constitution Art. 32). Pure — reuses the runtime's executor
// validators (zero duplicate logic) + the event catalog + graph checks. The
// Builder/PublishService call this; publish is gated on an empty result.
// ============================================================================

import { getExecutor } from '../executors/registry';
import type { RuntimeStep } from '../executors/types';
import { EVENT, type EventType } from '../event-types';

export interface BuilderDefinition {
  entity: string;
  triggerEvent: string | null;        // null = manual
  triggerConfig: Record<string, unknown>;
}

const VALID_EVENTS = new Set<string>(Object.values(EVENT));

/** Returns validation errors ([] = valid + publishable). */
export function validateWorkflow(def: BuilderDefinition, steps: RuntimeStep[]): string[] {
  const errors: string[] = [];

  // Trigger
  if (def.triggerEvent && !VALID_EVENTS.has(def.triggerEvent as EventType)) {
    errors.push(`unknown trigger_event '${def.triggerEvent}'`);
  }
  if (!def.entity?.trim()) errors.push('definition entity is required');

  // Steps present
  if (steps.length === 0) { errors.push('workflow has no steps'); return errors; }

  // Per-step config validation (reuse the runtime executors)
  const ids = new Set(steps.map((s) => s.id));
  const seenNos = new Set<number>();
  for (const s of steps) {
    const ex = getExecutor(s.stepType);
    if (!ex) { errors.push(`step ${s.stepNo}: unknown step_type '${s.stepType}'`); continue; }
    for (const e of ex.validate(s)) errors.push(`step ${s.stepNo} (${s.stepType}): ${e}`);
    if (seenNos.has(s.stepNo)) errors.push(`duplicate step_no ${s.stepNo}`);
    seenNos.add(s.stepNo);
    if (s.nextOnSuccess && !ids.has(s.nextOnSuccess)) errors.push(`step ${s.stepNo}: next_on_success points to a missing step`);
    if (s.nextOnFailure && !ids.has(s.nextOnFailure)) errors.push(`step ${s.stepNo}: next_on_failure points to a missing step`);
  }

  // Graph: must terminate (no cycle) following branches/sequential from the first step.
  if (!errors.length && hasCycle(steps)) errors.push('workflow step graph has a cycle (will not terminate)');

  return errors;
}

function hasCycle(steps: RuntimeStep[]): boolean {
  const ordered = [...steps].sort((a, b) => a.stepNo - b.stepNo);
  const byId = new Map(ordered.map((s) => [s.id, s]));
  const nexts = (s: RuntimeStep): RuntimeStep[] => {
    const out: RuntimeStep[] = [];
    if (s.nextOnSuccess && byId.get(s.nextOnSuccess)) out.push(byId.get(s.nextOnSuccess)!);
    if (s.nextOnFailure && byId.get(s.nextOnFailure)) out.push(byId.get(s.nextOnFailure)!);
    if (!s.nextOnSuccess && !s.nextOnFailure) {
      const seq = ordered.find((x) => x.stepNo > s.stepNo);
      if (seq) out.push(seq);
    }
    return out;
  };
  const WHITE = 0, GREY = 1, BLACK = 2;
  const color = new Map<string, number>(ordered.map((s) => [s.id, WHITE]));
  const visit = (s: RuntimeStep): boolean => {
    color.set(s.id, GREY);
    for (const n of nexts(s)) {
      const c = color.get(n.id);
      if (c === GREY) return true;                 // back-edge → cycle
      if (c === WHITE && visit(n)) return true;
    }
    color.set(s.id, BLACK);
    return false;
  };
  return ordered.length > 0 && visit(ordered[0]);
}
