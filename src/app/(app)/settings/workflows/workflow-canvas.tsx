'use client';

// ============================================================================
// Workflow Builder Phase 2 — visual drag-&-drop canvas (VISUAL LAYER ONLY).
// A window onto the SAME erp_workflow_steps the runtime executes: nodes ⇄ steps,
// edges ⇄ next_on_success/next_on_failure (+ materialized sequential). No engine,
// no runtime, no executors, no business rules here — execution stays owned by the
// event bus / workflow engine / runtime / executors. Persistence + validation
// reuse the existing server actions (saveGraph → validateWorkflow).
// ============================================================================

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ReactFlow, ReactFlowProvider, Background, Controls, MiniMap, Handle, Position,
  useNodesState, useEdgesState, addEdge, useReactFlow,
  type Node, type Edge, type Connection, type NodeProps, type NodeChange, type EdgeChange,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import dagre from 'dagre';
import { toast } from 'sonner';
import { Plus, Save, LayoutGrid, AlertTriangle, CheckCircle2, Rocket, Undo2, Redo2, Maximize, Circle } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useI18n } from '@/lib/i18n/provider';
import { EVENT } from '@/lib/workflow/event-types';
import {
  stepsToGraph, graphToSteps, TRIGGER_NODE_ID, TRIGGER_NODE_TYPE,
  type Graph, type GraphNode, type GraphEdge, type StepRow, type DefLike,
} from '@/lib/workflow/builder/graph-model';
import { saveGraph, publishDefinition, updateDefinition } from './actions';
import type { WfDefinition, WfStep } from './workflow-builder';

const STEP_TYPES = ['approval', 'reject', 'notification', 'task', 'update_record', 'api_call', 'delay', 'escalation', 'condition'] as const;
const BRANCHING = new Set(['approval', 'condition', 'api_call']);
const EVENTS = Object.values(EVENT);

const COLORS: Record<string, string> = {
  trigger: 'border-violet-400 bg-violet-50', approval: 'border-amber-400 bg-amber-50',
  condition: 'border-sky-400 bg-sky-50', notification: 'border-emerald-400 bg-emerald-50',
  task: 'border-emerald-400 bg-emerald-50', update_record: 'border-emerald-400 bg-emerald-50',
  api_call: 'border-rose-400 bg-rose-50', delay: 'border-slate-400 bg-slate-50',
  escalation: 'border-orange-400 bg-orange-50', reject: 'border-red-400 bg-red-50',
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type RFData = Record<string, any>;

// ── Custom nodes ─────────────────────────────────────────────────────────────
function StepNodeView({ data, selected }: NodeProps) {
  const d = data as RFData;
  const branching = BRANCHING.has(d.stepType);
  return (
    <div className={`min-w-[140px] rounded-md border-2 px-3 py-2 text-xs shadow-sm ${COLORS[d.stepType] ?? 'border-slate-300 bg-white'} ${selected ? 'ring-2 ring-primary' : ''}`}>
      <Handle type="target" position={Position.Top} />
      <div className="font-medium">{d.label || d.stepType}</div>
      <div className="font-mono text-[10px] text-muted-foreground">{d.stepType}</div>
      {d.stepType !== 'reject' && (branching ? (
        <>
          <Handle id="success" type="source" position={Position.Bottom} style={{ left: '30%' }} />
          <Handle id="failure" type="source" position={Position.Bottom} style={{ left: '70%', background: '#ef4444' }} />
        </>
      ) : <Handle id="success" type="source" position={Position.Bottom} />)}
    </div>
  );
}
function TriggerNodeView({ data, selected }: NodeProps) {
  const d = data as RFData;
  return (
    <div className={`min-w-[140px] rounded-md border-2 px-3 py-2 text-xs shadow-sm ${COLORS.trigger} ${selected ? 'ring-2 ring-primary' : ''}`}>
      <div className="font-medium">⚡ {d.label}</div>
      <div className="font-mono text-[10px] text-muted-foreground" dir="ltr">{d.triggerEvent || 'manual'}</div>
      <Handle id="success" type="source" position={Position.Bottom} />
    </div>
  );
}

// ── engine graph ⇄ React Flow ─────────────────────────────────────────────────
function toRF(graph: Graph, t: (k: string) => string): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = graph.nodes.map((n) => ({
    id: n.id,
    type: n.id === TRIGGER_NODE_ID ? 'trigger' : 'step',
    position: n.position,
    deletable: n.id !== TRIGGER_NODE_ID,
    data: {
      label: n.id === TRIGGER_NODE_ID ? t('workflows.tab.trigger') : n.label,
      stepType: n.type, triggerEvent: n.data.triggerEvent ?? null,
      config: n.data.config ?? {}, approverType: n.data.approverType ?? null, approverRef: n.data.approverRef ?? null,
      slaHours: n.data.slaHours ?? null, escalateTo: n.data.escalateTo ?? null, condition: n.data.condition ?? null,
    },
  }));
  const edges: Edge[] = graph.edges.map((e) => ({
    id: e.id, source: e.source, target: e.target, sourceHandle: e.kind,
    label: e.kind === 'failure' ? '✗' : '✓',
    style: e.kind === 'failure' ? { stroke: '#ef4444' } : undefined,
  }));
  return { nodes, edges };
}

function fromRF(nodes: Node[], edges: Edge[]): Graph {
  const gNodes: GraphNode[] = nodes.map((n) => {
    const d = n.data as RFData;
    return {
      id: n.id, type: n.type === 'trigger' ? TRIGGER_NODE_TYPE : d.stepType, label: d.label ?? '',
      position: { x: Math.round(n.position.x), y: Math.round(n.position.y) },
      data: {
        config: d.config ?? {}, approverType: d.approverType ?? null, approverRef: d.approverRef ?? null,
        slaHours: d.slaHours ?? null, escalateTo: d.escalateTo ?? null, condition: d.condition ?? null,
        triggerEvent: d.triggerEvent ?? null,
      },
    };
  });
  const gEdges: GraphEdge[] = edges.map((e) => ({
    id: e.id, source: e.source, target: e.target, kind: e.sourceHandle === 'failure' ? 'failure' : 'success',
  }));
  return { nodes: gNodes, edges: gEdges };
}

function dagreLayout(nodes: Node[], edges: Edge[]): Node[] {
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: 'TB', nodesep: 40, ranksep: 70 });
  g.setDefaultEdgeLabel(() => ({}));
  nodes.forEach((n) => g.setNode(n.id, { width: 160, height: 60 }));
  edges.forEach((e) => g.setEdge(e.source, e.target));
  dagre.layout(g);
  return nodes.map((n) => {
    const p = g.node(n.id);
    return { ...n, position: { x: Math.round(p.x - 80), y: Math.round(p.y - 30) } };
  });
}

// ── Canvas ────────────────────────────────────────────────────────────────────
function CanvasInner({ def, steps }: { def: WfDefinition; steps: WfStep[] }) {
  const { t } = useI18n();
  const rf = useReactFlow();
  const published = (def.status ?? (def.is_active ? 'published' : 'draft')) === 'published';

  const initial = useMemo(() => {
    const rows: StepRow[] = steps.map((s) => ({
      id: s.id, step_no: s.step_no, step_type: s.step_type ?? 'approval', name: s.name ?? s.name_ar ?? null,
      config: s.config ?? {}, approver_type: s.approver_type, approver_ref: s.approver_ref,
      sla_hours: s.sla_hours ?? null, escalate_to: s.escalate_to ?? null, condition: s.condition,
      next_on_success: s.next_on_success ?? null, next_on_failure: s.next_on_failure ?? null,
      ui_position: s.ui_position ?? null,
    }));
    const dl: DefLike = { id: def.id, trigger_event: def.trigger_event ?? null, canvas_meta: def.canvas_meta ?? null };
    const graph = stepsToGraph(rows, dl);
    const rfg = toRF(graph, t);
    const needsLayout = steps.some((s) => !s.ui_position);
    return needsLayout ? { nodes: dagreLayout(rfg.nodes, rfg.edges), edges: rfg.edges } : rfg;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [def.id]);

  const [nodes, setNodes, onNodesChange] = useNodesState(initial.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initial.edges);
  const [selId, setSelId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<string[] | null>(null);
  const [dirty, setDirty] = useState(false);
  // Undo / redo history of {nodes,edges} snapshots (visual state only).
  const [past, setPast] = useState<{ nodes: Node[]; edges: Edge[] }[]>([]);
  const [future, setFuture] = useState<{ nodes: Node[]; edges: Edge[] }[]>([]);

  const record = useCallback(() => {
    setPast((p) => [...p.slice(-49), { nodes, edges }]);
    setFuture([]);
  }, [nodes, edges]);
  const undo = useCallback(() => {
    setPast((p) => {
      if (!p.length) return p;
      const prev = p[p.length - 1];
      setFuture((f) => [{ nodes, edges }, ...f]);
      setNodes(prev.nodes); setEdges(prev.edges); setDirty(true);
      return p.slice(0, -1);
    });
  }, [nodes, edges, setNodes, setEdges]);
  const redo = useCallback(() => {
    setFuture((f) => {
      if (!f.length) return f;
      const next = f[0];
      setPast((p) => [...p, { nodes, edges }]);
      setNodes(next.nodes); setEdges(next.edges); setDirty(true);
      return f.slice(1);
    });
  }, [nodes, edges, setNodes, setEdges]);

  // Unsaved-changes warning (browser navigation / reload).
  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [dirty]);

  const handleNodesChange = useCallback((changes: NodeChange[]) => {
    if (changes.some((c) => c.type !== 'select' && c.type !== 'dimensions')) setDirty(true);
    onNodesChange(changes);
  }, [onNodesChange]);
  const handleEdgesChange = useCallback((changes: EdgeChange[]) => {
    if (changes.some((c) => c.type !== 'select')) setDirty(true);
    onEdgesChange(changes);
  }, [onEdgesChange]);

  const onConnect = useCallback((c: Connection) => {
    record(); setDirty(true);
    setEdges((eds) => addEdge({ ...c, label: c.sourceHandle === 'failure' ? '✗' : '✓', style: c.sourceHandle === 'failure' ? { stroke: '#ef4444' } : undefined }, eds));
  }, [setEdges, record]);

  const addNode = (stepType: string) => {
    record(); setDirty(true);
    const id = crypto.randomUUID();
    const vp = rf.getViewport();
    const pos = { x: (-vp.x + 200) / vp.zoom, y: (-vp.y + 160) / vp.zoom };
    setNodes((nds) => [...nds, { id, type: 'step', position: pos, deletable: true, data: { label: t(`workflows.stepType.${stepType}`), stepType, config: {}, approverType: stepType === 'approval' ? 'company_admin' : null } }]);
    setSelId(id);
  };

  const autoLayout = () => { record(); setDirty(true); setNodes((nds) => dagreLayout(nds, edges)); setTimeout(() => rf.fitView({ duration: 300 }), 0); };

  const patchSelected = (patch: RFData) => { setDirty(true); setNodes((nds) => nds.map((n) => (n.id === selId ? { ...n, data: { ...n.data, ...patch } } : n))); };

  async function persist(thenPublish: boolean) {
    setBusy(true);
    try {
      // Trigger node edits live on the definition (the trigger is the definition).
      const trig = nodes.find((n) => n.id === TRIGGER_NODE_ID);
      if (trig) await updateDefinition(def.id, { triggerEvent: (trig.data as RFData).triggerEvent || null });

      const { steps: patches } = graphToSteps(fromRF(nodes, edges));
      const vp = rf.getViewport();
      const canvasMeta = { viewport: vp, trigger: trig ? { x: Math.round(trig.position.x), y: Math.round(trig.position.y) } : undefined };
      const res = await saveGraph({ definitionId: def.id, steps: patches, canvasMeta });
      if (!res.ok) { toast.error(res.error ?? t('workflows.toast.error')); return; }
      setErrors(res.data?.errors ?? []);
      setDirty(false);
      toast.success(t('workflows.toast.graphSaved'));
      if (thenPublish) {
        if ((res.data?.errors ?? []).length) { toast.error(t('workflows.validationFailed')); return; }
        const pub = await publishDefinition(def.id);
        if (!pub.ok) { toast.error(pub.error ?? t('workflows.toast.error')); return; }
        toast.success(t('workflows.toast.published'));
      }
    } catch { toast.error(t('workflows.toast.error')); } finally { setBusy(false); }
  }

  const nodeTypes = useMemo(() => ({ step: StepNodeView, trigger: TriggerNodeView }), []);
  const selected = nodes.find((n) => n.id === selId) ?? null;

  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1fr_280px]">
      <div className="space-y-2">
        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="me-1 text-xs text-muted-foreground">{t('workflows.canvas.addNode')}:</span>
          {STEP_TYPES.map((s) => (
            <Button key={s} size="sm" variant="outline" disabled={published || busy} onClick={() => addNode(s)}><Plus className="me-1 h-3 w-3" />{t(`workflows.stepType.${s}`)}</Button>
          ))}
          <span className="mx-2 h-5 w-px bg-border" />
          <Button size="sm" variant="outline" disabled={published || busy || !past.length} onClick={undo} title={t('workflows.canvas.undo')}><Undo2 className="h-3.5 w-3.5" /></Button>
          <Button size="sm" variant="outline" disabled={published || busy || !future.length} onClick={redo} title={t('workflows.canvas.redo')}><Redo2 className="h-3.5 w-3.5" /></Button>
          <Button size="sm" variant="outline" disabled={busy} onClick={() => rf.fitView({ duration: 300 })} title={t('workflows.canvas.fit')}><Maximize className="h-3.5 w-3.5" /></Button>
          <Button size="sm" variant="outline" disabled={published || busy} onClick={autoLayout}><LayoutGrid className="me-1 h-3.5 w-3.5" />{t('workflows.canvas.autoLayout')}</Button>
          <Button size="sm" disabled={published || busy} onClick={() => persist(false)}><Save className="me-1 h-3.5 w-3.5" />{t('workflows.canvas.save')}</Button>
          <Button size="sm" variant="default" disabled={published || busy} onClick={() => persist(true)}><Rocket className="me-1 h-3.5 w-3.5" />{t('workflows.publish')}</Button>
          {dirty && <span className="flex items-center gap-1 text-xs text-amber-600"><Circle className="h-2 w-2 fill-amber-500" />{t('workflows.canvas.unsaved')}</span>}
        </div>
        {published && <p className="text-xs text-amber-600">{t('workflows.publishedReadOnly')}</p>}
        {errors !== null && (errors.length === 0
          ? <p className="flex items-center gap-1 text-sm text-green-600"><CheckCircle2 className="h-4 w-4" />{t('workflows.validationPassed')}</p>
          : <ul className="space-y-0.5 rounded border border-destructive/40 bg-destructive/5 p-2 text-xs text-destructive">{errors.map((e, i) => <li key={i} className="flex items-start gap-1"><AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />{e}</li>)}</ul>)}

        <div className="h-[560px] rounded-lg border" dir="ltr">
          <ReactFlow
            nodes={nodes} edges={edges} nodeTypes={nodeTypes}
            onNodesChange={handleNodesChange} onEdgesChange={handleEdgesChange} onConnect={onConnect}
            onNodeDragStart={() => record()}
            onNodesDelete={() => record()} onEdgesDelete={() => record()}
            onSelectionChange={(s) => setSelId(s.nodes.length === 1 ? s.nodes[0].id : null)}
            deleteKeyCode={published ? null : ['Backspace', 'Delete']}
            multiSelectionKeyCode={['Shift', 'Meta', 'Control']}
            selectionOnDrag panOnDrag={[1, 2]}
            nodesDraggable={!published} nodesConnectable={!published} elementsSelectable
            fitView proOptions={{ hideAttribution: true }}
          >
            <Background /><Controls showInteractive={false} /><MiniMap pannable zoomable />
          </ReactFlow>
        </div>
        <p className="text-xs text-muted-foreground">{t('workflows.canvas.hint')}</p>
      </div>

      {/* Inspector */}
      <Card><CardContent className="space-y-3 p-4">
        <h3 className="text-sm font-medium">{t('workflows.canvas.inspector')}</h3>
        {!selected ? <p className="text-xs text-muted-foreground">{t('workflows.canvas.noSelection')}</p>
          : selected.id === TRIGGER_NODE_ID
            ? <TriggerInspector data={selected.data as RFData} disabled={published} onChange={patchSelected} t={t} />
            : <NodeInspector data={selected.data as RFData} disabled={published} onChange={patchSelected} t={t} />}
      </CardContent></Card>
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function TriggerInspector({ data, disabled, onChange, t }: { data: RFData; disabled: boolean; onChange: (p: RFData) => void; t: (k: string) => string }) {
  return (
    <div className="space-y-1.5">
      <Label>{t('workflows.triggerEventLabel')}</Label>
      <select className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm" dir="ltr" disabled={disabled} value={data.triggerEvent ?? ''} onChange={(e) => onChange({ triggerEvent: e.target.value || null })}>
        <option value="">{t('workflows.triggerManual')}</option>
        {EVENTS.map((ev) => <option key={ev} value={ev}>{ev}</option>)}
      </select>
      <p className="text-xs text-muted-foreground">{t('workflows.canvas.triggerHint')}</p>
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function NodeInspector({ data, disabled, onChange, t }: { data: RFData; disabled: boolean; onChange: (p: RFData) => void; t: (k: string) => string }) {
  const type = data.stepType as string;
  const [cfg, setCfg] = useState(JSON.stringify(data.config ?? {}, null, 2));
  const [cond, setCond] = useState(data.condition ? JSON.stringify(data.condition, null, 2) : '');
  return (
    <div className="space-y-2.5">
      <div className="text-xs"><span className="rounded bg-muted px-1.5 py-0.5 font-mono">{t(`workflows.stepType.${type}`)}</span></div>
      <div className="space-y-1.5"><Label>{t('workflows.step.name')}</Label><Input value={data.label ?? ''} disabled={disabled} onChange={(e) => onChange({ label: e.target.value })} /></div>

      {(type === 'approval' || type === 'escalation') && (
        <>
          <div className="space-y-1.5"><Label>{t('workflows.approverType')}</Label>
            <select className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm" disabled={disabled} value={data.approverType ?? 'company_admin'} onChange={(e) => onChange({ approverType: e.target.value })}>
              {['company_admin', 'role', 'user'].map((a) => <option key={a} value={a}>{t(`workflows.approver.${a}`)}</option>)}
            </select>
          </div>
          <div className="space-y-1.5"><Label>{t('workflows.step.ref')}</Label><Input value={data.approverRef ?? ''} disabled={disabled} onChange={(e) => onChange({ approverRef: e.target.value || null })} /></div>
          <div className="space-y-1.5"><Label>{t('workflows.slaHours')}</Label><Input type="number" value={data.slaHours ?? ''} disabled={disabled} onChange={(e) => onChange({ slaHours: e.target.value ? parseInt(e.target.value, 10) : null })} /></div>
          <div className="space-y-1.5"><Label>{t('workflows.escalateTo')}</Label><Input value={data.escalateTo ?? ''} disabled={disabled} onChange={(e) => onChange({ escalateTo: e.target.value || null })} /></div>
        </>
      )}

      {type === 'condition' && (
        <div className="space-y-1.5"><Label>{t('workflows.conditionExpr')}</Label>
          <textarea className="min-h-[90px] w-full rounded-md border border-input bg-background p-2 font-mono text-xs" dir="ltr" disabled={disabled} value={cond}
            onChange={(e) => { setCond(e.target.value); try { onChange({ condition: e.target.value.trim() ? JSON.parse(e.target.value) : null }); } catch { /* keep typing */ } }} />
        </div>
      )}

      {!['reject', 'condition'].includes(type) && (
        <div className="space-y-1.5"><Label>{t('workflows.stepConfig')}</Label>
          <textarea className="min-h-[90px] w-full rounded-md border border-input bg-background p-2 font-mono text-xs" dir="ltr" disabled={disabled} value={cfg}
            onChange={(e) => { setCfg(e.target.value); try { onChange({ config: e.target.value.trim() ? JSON.parse(e.target.value) : {} }); } catch { /* keep typing */ } }} />
          <p className="text-xs text-muted-foreground">{t(`workflows.configHint.${type}`)}</p>
        </div>
      )}
      <p className="text-xs text-muted-foreground">{t('workflows.canvas.applyHint')}</p>
    </div>
  );
}

export default function WorkflowCanvas(props: { def: WfDefinition; steps: WfStep[] }) {
  return (
    <ReactFlowProvider>
      <CanvasInner {...props} />
    </ReactFlowProvider>
  );
}
