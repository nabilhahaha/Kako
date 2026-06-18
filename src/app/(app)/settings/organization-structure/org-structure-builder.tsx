'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  ChevronRight, ChevronDown, Plus, Pencil, UserCog, MoveRight, Power,
  Trash2, Loader2, Network, Search, X, Building2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select } from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { EmptyState } from '@/components/shared/empty-state';
import { useI18n } from '@/lib/i18n/provider';
import {
  buildOrgTree, orderedLevels, orgSummary, isManagedNode, canReparent,
  type OrgLevel, type OrgNode, type OrgTreeNode,
} from '@/lib/onboarding/org-hierarchy';
import {
  addOrgNode, renameOrgNode, setOrgNodeManager, moveOrgNode, setOrgNodeActive,
  deleteOrgNode, type OrgPerson,
} from '@/lib/onboarding/org-hierarchy-server';

type EditorKind =
  | { kind: 'add'; levelId: string; parentNodeId: string | null }
  | { kind: 'rename'; node: OrgNode }
  | { kind: 'manager'; node: OrgNode }
  | { kind: 'move'; node: OrgNode }
  | null;

export function OrgStructureBuilder({
  levels,
  nodes,
  people,
}: {
  levels: OrgLevel[];
  nodes: OrgNode[];
  people: OrgPerson[];
}) {
  const router = useRouter();
  const { t, locale } = useI18n();
  const [pending, startTransition] = useTransition();
  const [query, setQuery] = useState('');
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [editor, setEditor] = useState<EditorKind>(null);

  const ar = locale === 'ar';
  const display = (n: { name: string; nameAr: string | null }) => (ar && n.nameAr) || n.name;

  const levelById = useMemo(() => {
    const m = new Map<string, OrgLevel>();
    for (const l of levels) m.set(l.id, l);
    return m;
  }, [levels]);
  const personById = useMemo(() => {
    const m = new Map<string, OrgPerson>();
    for (const p of people) m.set(p.id, p);
    return m;
  }, [people]);

  const orderedLvls = useMemo(() => orderedLevels(levels), [levels]);
  const topLevel = orderedLvls[0];
  const summary = useMemo(() => orgSummary(nodes), [nodes]);

  // Search filters the visible nodes; matched nodes + their ancestors are kept
  // so the tree context is preserved.
  const visibleIds = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return null;
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const keep = new Set<string>();
    for (const n of nodes) {
      if (display(n).toLowerCase().includes(q) || n.name.toLowerCase().includes(q)) {
        let cur: OrgNode | undefined = n;
        while (cur) {
          keep.add(cur.id);
          cur = cur.parentNodeId ? byId.get(cur.parentNodeId) : undefined;
        }
      }
    }
    return keep;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, nodes, ar]);

  const tree = useMemo(() => buildOrgTree(nodes), [nodes]);

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, okMsg: string) {
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) {
        toast.error(t(`orgStructure.err.${res.error ?? 'generic'}`) || t('orgStructure.err.generic'));
        return;
      }
      toast.success(okMsg);
      setEditor(null);
      router.refresh();
    });
  }

  function toggle(id: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function renderNode(node: OrgTreeNode, depth: number) {
    if (visibleIds && !visibleIds.has(node.id)) return null;
    const level = levelById.get(node.levelId);
    const manager = node.managerUserId ? personById.get(node.managerUserId) : null;
    const hasChildren = node.children.length > 0;
    const isCollapsed = collapsed.has(node.id);
    const managed = isManagedNode(node);

    return (
      <div key={node.id}>
        <div
          className="flex items-center gap-2 rounded-lg border bg-card px-3 py-2.5"
          style={{ marginInlineStart: depth * 16 }}
        >
          <button
            type="button"
            onClick={() => hasChildren && toggle(node.id)}
            className={`shrink-0 rounded p-0.5 ${hasChildren ? 'hover:bg-secondary' : 'opacity-0'}`}
            aria-label={isCollapsed ? t('orgStructure.expand') : t('orgStructure.collapse')}
          >
            {isCollapsed ? <ChevronRight className="h-4 w-4 rtl:rotate-180" /> : <ChevronDown className="h-4 w-4" />}
          </button>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="truncate font-medium">{display(node)}</span>
              {level && <Badge variant="outline" className="shrink-0">{display(level)}</Badge>}
              {!node.isActive && <Badge variant="destructive" className="shrink-0">{t('orgStructure.inactive')}</Badge>}
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {manager
                ? t('orgStructure.inChargeName', { name: manager.name })
                : t('orgStructure.noOneInCharge')}
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-0.5">
            {level && (
              <IconBtn label={t('orgStructure.addUnderShort')} onClick={() => setEditor({ kind: 'add', levelId: level.id, parentNodeId: node.id })}>
                <Plus className="h-4 w-4" />
              </IconBtn>
            )}
            <IconBtn label={t('orgStructure.assignManager')} onClick={() => setEditor({ kind: 'manager', node })}>
              <UserCog className="h-4 w-4" />
            </IconBtn>
            <IconBtn label={t('orgStructure.rename')} onClick={() => setEditor({ kind: 'rename', node })}>
              <Pencil className="h-4 w-4" />
            </IconBtn>
            <IconBtn label={t('orgStructure.move')} onClick={() => setEditor({ kind: 'move', node })}>
              <MoveRight className="h-4 w-4 rtl:rotate-180" />
            </IconBtn>
            <IconBtn
              label={node.isActive ? t('orgStructure.deactivate') : t('orgStructure.activate')}
              onClick={() => run(() => setOrgNodeActive({ id: node.id, isActive: !node.isActive }),
                node.isActive ? t('orgStructure.toast.deactivated') : t('orgStructure.toast.activated'))}
            >
              <Power className="h-4 w-4" />
            </IconBtn>
            {!managed && (
              <IconBtn
                label={t('orgStructure.delete')}
                onClick={() => {
                  if (confirm(t('orgStructure.confirmDelete', { name: display(node) }))) {
                    run(() => deleteOrgNode({ id: node.id }), t('orgStructure.toast.deleted'));
                  }
                }}
              >
                <Trash2 className="h-4 w-4 text-destructive" />
              </IconBtn>
            )}
          </div>
        </div>

        {/* inline editor attaches directly under its node for context */}
        {editor && 'node' in editor && editor.node.id === node.id && (
          <div style={{ marginInlineStart: (depth + 1) * 16 }} className="mt-1">
            <EditorPanel editor={editor} />
          </div>
        )}
        {editor && editor.kind === 'add' && editor.parentNodeId === node.id && (
          <div style={{ marginInlineStart: (depth + 1) * 16 }} className="mt-1">
            <EditorPanel editor={editor} />
          </div>
        )}

        {hasChildren && !isCollapsed && (
          <div className="mt-1 space-y-1">
            {node.children.map((c) => renderNode(c, depth + 1))}
          </div>
        )}
      </div>
    );
  }

  function EditorPanel({ editor }: { editor: NonNullable<EditorKind> }) {
    const node = 'node' in editor ? editor.node : null;
    const [name, setName] = useState(editor.kind === 'rename' ? node!.name : '');
    const [nameAr, setNameAr] = useState(editor.kind === 'rename' ? (node!.nameAr ?? '') : '');
    const [managerUserId, setManagerUserId] = useState(editor.kind === 'manager' ? (node!.managerUserId ?? '') : '');
    const [parentNodeId, setParentNodeId] = useState(editor.kind === 'move' ? (node!.parentNodeId ?? '') : '');

    const title =
      editor.kind === 'add' ? t('orgStructure.addUnder', { level: display(levelById.get(editor.levelId)!) })
      : editor.kind === 'rename' ? t('orgStructure.renameTitle')
      : editor.kind === 'manager' ? t('orgStructure.whoInCharge')
      : t('orgStructure.moveTitle');

    // Valid move targets: any active node that wouldn't create a cycle.
    const moveTargets = useMemo(() => {
      if (editor.kind !== 'move') return [];
      return nodes.filter((n) => n.id !== node!.id && canReparent(node!.id, n.id, nodes));
    }, [editor]);

    return (
      <Card className="border-primary/40">
        <CardContent className="space-y-3 p-3">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold">{title}</h4>
            <button type="button" onClick={() => setEditor(null)} className="rounded-md p-1 hover:bg-secondary" aria-label={t('orgStructure.cancel')}>
              <X className="h-4 w-4" />
            </button>
          </div>

          {(editor.kind === 'add' || editor.kind === 'rename') && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="org-name">{t('orgStructure.nameEn')}</Label>
                <Input id="org-name" value={name} onChange={(e) => setName(e.target.value)}
                  placeholder={t('orgStructure.namePlaceholder')} autoFocus />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="org-name-ar">{t('orgStructure.nameAr')}</Label>
                <Input id="org-name-ar" value={nameAr} onChange={(e) => setNameAr(e.target.value)} dir="rtl" />
              </div>
            </div>
          )}

          {editor.kind === 'manager' && (
            <div className="space-y-1.5">
              <Label htmlFor="org-manager">{t('orgStructure.person')}</Label>
              <Select id="org-manager" value={managerUserId} onChange={(e) => setManagerUserId(e.target.value)}>
                <option value="">{t('orgStructure.noOneOption')}</option>
                {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </Select>
            </div>
          )}

          {editor.kind === 'move' && (
            <div className="space-y-1.5">
              <Label htmlFor="org-parent">{t('orgStructure.newParent')}</Label>
              <Select id="org-parent" value={parentNodeId} onChange={(e) => setParentNodeId(e.target.value)}>
                <option value="">{t('orgStructure.topLevelOption')}</option>
                {moveTargets.map((n) => <option key={n.id} value={n.id}>{display(n)}</option>)}
              </Select>
            </div>
          )}

          <div className="flex gap-2">
            <Button
              size="sm"
              disabled={pending}
              onClick={() => {
                if (editor.kind === 'add') run(() => addOrgNode({ levelId: editor.levelId, parentNodeId: editor.parentNodeId, name, nameAr }), t('orgStructure.toast.added'));
                else if (editor.kind === 'rename') run(() => renameOrgNode({ id: node!.id, name, nameAr }), t('orgStructure.toast.renamed'));
                else if (editor.kind === 'manager') run(() => setOrgNodeManager({ id: node!.id, managerUserId: managerUserId || null }), t('orgStructure.toast.managerSet'));
                else run(() => moveOrgNode({ id: node!.id, parentNodeId: parentNodeId || null }), t('orgStructure.toast.moved'));
              }}
            >
              {pending && <Loader2 className="h-4 w-4 animate-spin" />}
              {t('orgStructure.save')}
            </Button>
            <Button size="sm" variant="outline" onClick={() => setEditor(null)}>{t('orgStructure.cancel')}</Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (levels.length === 0) {
    return (
      <EmptyState
        icon={<Network />}
        title={t('orgStructure.emptyTitle')}
        description={t('orgStructure.emptyDescription')}
      />
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <SummaryCard icon={<Network className="h-4 w-4" />} label={t('orgStructure.summaryLevels')} value={levels.length} />
        <SummaryCard icon={<Building2 className="h-4 w-4" />} label={t('orgStructure.summaryUnits')} value={summary.total} />
        <SummaryCard icon={<UserCog className="h-4 w-4" />} label={t('orgStructure.summaryManaged')} value={summary.withManager} />
        <SummaryCard icon={<Power className="h-4 w-4" />} label={t('orgStructure.summaryActive')} value={summary.active} />
      </div>

      {/* Toolbar: search + add top-level */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('orgStructure.searchPlaceholder')}
            className="ps-9"
          />
        </div>
        {topLevel && (
          <Button onClick={() => setEditor({ kind: 'add', levelId: topLevel.id, parentNodeId: null })} className="shrink-0">
            <Plus className="h-4 w-4" /> {t('orgStructure.addTop', { level: display(topLevel) })}
          </Button>
        )}
      </div>

      {/* Top-level add editor */}
      {editor && editor.kind === 'add' && editor.parentNodeId === null && <EditorPanel editor={editor} />}

      {/* Tree */}
      {tree.length === 0 ? (
        <EmptyState
          icon={<Building2 />}
          title={t('orgStructure.noUnitsTitle')}
          description={t('orgStructure.noUnitsDescription')}
        />
      ) : (
        <div className="space-y-1">{tree.map((n) => renderNode(n, 0))}</div>
      )}
    </div>
  );
}

function IconBtn({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
    >
      {children}
    </button>
  );
}

function SummaryCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-secondary text-muted-foreground">{icon}</div>
        <div className="min-w-0">
          <p className="text-lg font-semibold leading-none">{value}</p>
          <p className="truncate text-xs text-muted-foreground">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}
