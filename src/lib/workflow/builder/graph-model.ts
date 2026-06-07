// ============================================================================
// Workflow Builder Phase 2 — pure graph model (Constitution Art. 32).
// Dependency-free translation between the engine's step ROWS and a visual
// node/edge GRAPH. This file contains NO execution, NO runtime, NO business
// rules — it is layout/shape only. Execution stays in the engine/runtime/
// executors/event-bus. The canvas is a window onto the same step rows the
// runtime already executes (one engine, one runtime, one builder).
//
// Approved rule: implicit sequential fall-through (a step with no explicit
// branch → next step_no) is MATERIALIZED into an explicit next_on_success on
// save, so "what you see" === "what runs".
// ============================================================================

export const TRIGGER_NODE_ID = '__trigger__';
export const TRIGGER_NODE_TYPE = 'trigger';

export type EdgeKind = 'success' | 'failure';

/** Engine step row (snake_case, as read from erp_workflow_steps). */
export interface StepRow {
  id: string;
  step_no: number;
  step_type: string;
  name?: string | null;
  config?: Record<string, unknown> | null;
  approver_type?: string | null;
  approver_ref?: string | null;
  sla_hours?: number | null;
  escalate_to?: string | null;
  condition?: Record<string, unknown> | null;
  next_on_success?: string | null;
  next_on_failure?: string | null;
  ui_position?: { x: number; y: number } | null;
}

export interface DefLike {
  id: string;
  trigger_event?: string | null;
  canvas_meta?: {
    trigger?: { x: number; y: number };
    viewport?: { x: number; y: number; zoom: number };
  } | null;
}

export interface GraphNode {
  id: string;            // step id, or TRIGGER_NODE_ID
  type: string;          // step_type, or TRIGGER_NODE_TYPE
  label: string;
  position: { x: number; y: number };
  data: {
    stepNo?: number;
    config?: Record<string, unknown>;
    approverType?: string | null;
    approverRef?: string | null;
    slaHours?: number | null;
    escalateTo?: string | null;
    condition?: Record<string, unknown> | null;
    triggerEvent?: string | null;
  };
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  kind: EdgeKind;
}

export interface Graph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

/** Step shape produced when serializing the graph back to the engine. */
export interface StepPatch {
  id: string;
  step_no: number;
  step_type: string;
  name: string | null;
  config: Record<string, unknown>;
  approver_type: string | null;
  approver_ref: string | null;
  sla_hours: number | null;
  escalate_to: string | null;
  condition: Record<string, unknown> | null;
  next_on_success: string | null;
  next_on_failure: string | null;
  ui_position: { x: number; y: number };
}

const VGAP = 120;

/** Project engine step rows → a visual graph (deterministic; layout fallback
 *  when a step has no saved ui_position). */
export function stepsToGraph(steps: StepRow[], def: DefLike): Graph {
  const ordered = [...steps].sort((a, b) => a.step_no - b.step_no);
  const ids = new Set(ordered.map((s) => s.id));
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];

  // Virtual trigger node (the definition itself; not a step row).
  nodes.push({
    id: TRIGGER_NODE_ID,
    type: TRIGGER_NODE_TYPE,
    label: TRIGGER_NODE_TYPE,
    position: def.canvas_meta?.trigger ?? { x: 0, y: 0 },
    data: { triggerEvent: def.trigger_event ?? null },
  });

  ordered.forEach((s, i) => {
    nodes.push({
      id: s.id,
      type: s.step_type,
      label: (s.name && s.name.trim()) || s.step_type,
      position: s.ui_position ?? { x: 0, y: (i + 1) * VGAP },
      data: {
        stepNo: s.step_no,
        config: s.config ?? {},
        approverType: s.approver_type ?? null,
        approverRef: s.approver_ref ?? null,
        slaHours: s.sla_hours ?? null,
        escalateTo: s.escalate_to ?? null,
        condition: s.condition ?? null,
      },
    });
  });

  // Trigger → entry node (the lowest step_no).
  if (ordered.length) {
    edges.push({ id: `${TRIGGER_NODE_ID}->${ordered[0].id}`, source: TRIGGER_NODE_ID, target: ordered[0].id, kind: 'success' });
  }

  ordered.forEach((s, i) => {
    const succ = s.next_on_success && ids.has(s.next_on_success) ? s.next_on_success : null;
    const fail = s.next_on_failure && ids.has(s.next_on_failure) ? s.next_on_failure : null;
    if (succ) edges.push({ id: `${s.id}-s-${succ}`, source: s.id, target: succ, kind: 'success' });
    if (fail) edges.push({ id: `${s.id}-f-${fail}`, source: s.id, target: fail, kind: 'failure' });
    // Implicit sequential fall-through (runtime semantics: only when BOTH null).
    if (!succ && !fail) {
      const next = ordered[i + 1];
      if (next) edges.push({ id: `${s.id}-seq-${next.id}`, source: s.id, target: next.id, kind: 'success' });
    }
  });

  return { nodes, edges };
}

/** Serialize a visual graph → engine step rows. Implicit sequential edges are
 *  already explicit 'success' edges here, so every link is materialized. */
export function graphToSteps(graph: Graph): { steps: StepPatch[]; entryId: string | null } {
  const stepNodes = graph.nodes.filter((n) => n.id !== TRIGGER_NODE_ID);
  const stepIds = new Set(stepNodes.map((n) => n.id));
  const entryId = graph.edges.find((e) => e.source === TRIGGER_NODE_ID)?.target ?? null;

  const order = computeOrder(stepNodes, graph.edges, entryId);

  const steps: StepPatch[] = stepNodes.map((n) => {
    const out = graph.edges.filter((e) => e.source === n.id && stepIds.has(e.target));
    const succ = out.find((e) => e.kind === 'success')?.target ?? null;
    const fail = out.find((e) => e.kind === 'failure')?.target ?? null;
    return {
      id: n.id,
      step_no: order.get(n.id) ?? n.data.stepNo ?? 1,
      step_type: n.type,
      name: (n.label && n.label.trim()) || null,
      config: n.data.config ?? {},
      approver_type: n.data.approverType ?? null,
      approver_ref: n.data.approverRef ?? null,
      sla_hours: n.data.slaHours ?? null,
      escalate_to: n.data.escalateTo ?? null,
      condition: n.data.condition ?? null,
      next_on_success: succ,
      next_on_failure: fail,
      ui_position: n.position,
    };
  });

  return { steps, entryId };
}

/** Deterministic step_no assignment by traversing from the entry (success
 *  before failure), then appending unreachable nodes by their prior step_no. */
function computeOrder(nodes: GraphNode[], edges: GraphEdge[], entryId: string | null): Map<string, number> {
  const adj = new Map<string, string[]>();
  const sorted = [...edges]
    .filter((e) => e.source !== TRIGGER_NODE_ID)
    .sort((a, b) => (a.kind === b.kind ? 0 : a.kind === 'success' ? -1 : 1));
  for (const e of sorted) {
    if (!adj.has(e.source)) adj.set(e.source, []);
    adj.get(e.source)!.push(e.target);
  }
  const order = new Map<string, number>();
  let n = 1;
  const visit = (id: string) => {
    if (id === TRIGGER_NODE_ID || order.has(id)) return;
    order.set(id, n++);
    for (const t of adj.get(id) ?? []) visit(t);
  };
  if (entryId) visit(entryId);
  for (const node of [...nodes].sort((a, b) => (a.data.stepNo ?? 0) - (b.data.stepNo ?? 0))) visit(node.id);
  return order;
}

/** Reachability from the trigger entry (for the canvas to warn on orphan nodes).
 *  Pure helper — no execution. */
export function unreachableStepIds(graph: Graph): string[] {
  const entryId = graph.edges.find((e) => e.source === TRIGGER_NODE_ID)?.target ?? null;
  const adj = new Map<string, string[]>();
  for (const e of graph.edges) {
    if (!adj.has(e.source)) adj.set(e.source, []);
    adj.get(e.source)!.push(e.target);
  }
  const seen = new Set<string>();
  const visit = (id: string) => { if (seen.has(id)) return; seen.add(id); for (const t of adj.get(id) ?? []) visit(t); };
  if (entryId) visit(entryId);
  return graph.nodes.filter((nd) => nd.id !== TRIGGER_NODE_ID && !seen.has(nd.id)).map((nd) => nd.id);
}
