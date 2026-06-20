'use client';

import { useEffect, useMemo, useState } from 'react';
import { Network, Eye, Users, Info, ArrowUp, ArrowDown, ShieldCheck, CircleDot, Circle, AlertTriangle } from 'lucide-react';
import { useI18n } from '@/lib/i18n/provider';
import { Button } from '@/components/ui/button';
import { visibleUsers, directReports, managerChain, visibilityExplain, reverseVisibility, visibilitySource, type RpNode, type VisibilityReason, type VisibilityFact } from '@/lib/erp/route-planner-reporting';
import { listReportingGraph, setReporting } from './rp-reporting-actions';

type Tab = 'graph' | 'explorer';

/**
 * Reporting Graph Admin + Visibility Explorer. Manages the primary/secondary manager
 * edges and the see_all override on erp_route_planner_access, and explains the resulting
 * VISIBILITY (mirrors rp_visible_users). Reporting is independent of territory ownership;
 * visibility is derived from the edges, never from role names.
 */
export function ReportingAdminView() {
  const { t } = useI18n();
  const [tab, setTab] = useState<Tab>('graph');
  const [nodes, setNodes] = useState<RpNode[]>([]);
  const [meId, setMeId] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [selected, setSelected] = useState<string>('');

  useEffect(() => { void refresh(); }, []);
  async function refresh() {
    setLoading(true);
    const r = await listReportingGraph();
    if (r.ok) { setNodes(r.data!.nodes); setMeId(r.data!.meId); if (!selected && r.data!.nodes[0]) setSelected(r.data!.nodes[0].userId); }
    else setMsg(errLabel(r.error));
    setLoading(false);
  }
  function errLabel(code: string) {
    const map: Record<string, string> = {
      err_cycle: t('rpShell.rg_errCycle'), err_same_manager: t('rpShell.rg_errSame'), err_unauthorized: t('rpShell.rg_errAuth'),
    };
    return map[code] ?? code;
  }

  const nameOf = useMemo(() => {
    const m = new Map(nodes.map((n) => [n.userId, n.name])); return (id: string | null) => (id ? m.get(id) ?? id.slice(0, 8) : '—');
  }, [nodes]);

  async function save(userId: string, patch: Partial<Pick<RpNode, 'primaryManagerId' | 'secondaryManagerId' | 'seeAll'>>) {
    const cur = nodes.find((n) => n.userId === userId); if (!cur) return;
    const next = {
      primaryManagerId: patch.primaryManagerId !== undefined ? patch.primaryManagerId : cur.primaryManagerId,
      secondaryManagerId: patch.secondaryManagerId !== undefined ? patch.secondaryManagerId : cur.secondaryManagerId,
      seeAll: patch.seeAll !== undefined ? patch.seeAll : cur.seeAll,
    };
    setBusy(userId); setMsg(null);
    const r = await setReporting(userId, next);
    setBusy(null);
    if (!r.ok) { setMsg(errLabel(r.error)); return; }
    await refresh();
  }

  // First-run signals: no members at all, vs members present but no reporting edges
  // anywhere (→ everyone sees only themselves, the classic "self-only" confusion).
  const graphEmpty = nodes.length === 0;
  const noEdges = !graphEmpty && nodes.every((n) => !n.primaryManagerId && !n.secondaryManagerId && !n.seeAll);

  async function grantMeSeeAll() {
    if (!meId) return;
    await save(meId, { seeAll: true });
  }

  if (loading) return <div className="p-6 text-sm text-muted-foreground">{t('routePlanner.importing')}</div>;

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 p-3">
      <div className="flex items-center gap-2"><Network className="h-5 w-5 text-primary" /><p className="text-sm font-bold">{t('rpShell.g_admin')} · {t('rpShell.i_reportingGraph')}</p></div>

      <div className="flex items-start gap-1.5 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-800">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" /><span>{t('rpShell.rg_intro')}</span>
      </div>

      <div className="flex gap-1.5">
        {(['graph', 'explorer'] as Tab[]).map((tb) => (
          <button key={tb} onClick={() => setTab(tb)}
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition ${tab === tb ? 'border-primary bg-primary/10 font-medium text-primary' : 'hover:bg-muted'}`}>
            {tb === 'graph' ? <Network className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            {tb === 'graph' ? t('rpShell.rg_tabGraph') : t('rpShell.rg_tabExplorer')}
          </button>
        ))}
      </div>

      {msg && <p className="rounded bg-amber-50 px-3 py-2 text-xs text-amber-800">{msg}</p>}

      {/* First-run guidance — prevent the "self-only visibility" confusion. */}
      {!graphEmpty && noEdges && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
          <p className="flex items-center gap-1.5 font-semibold"><AlertTriangle className="h-4 w-4" /> {t('rpShell.rg_firstRunTitle')}</p>
          <p className="mt-1">{t('rpShell.rg_firstRunHint')}</p>
          <ol className="mt-1.5 ms-4 list-decimal space-y-0.5">
            <li>{t('rpShell.rg_step1')}</li>
            <li>{t('rpShell.rg_step2')}</li>
            <li>{t('rpShell.rg_step3')}</li>
          </ol>
          <Button size="sm" className="mt-2.5" onClick={grantMeSeeAll}><ShieldCheck className="h-4 w-4" /> {t('rpShell.rg_grantMeSeeAll')}</Button>
        </div>
      )}

      {graphEmpty ? (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center rounded-lg border border-dashed py-10 text-center">
          <Users className="h-10 w-10 text-muted-foreground/40" />
          <p className="mt-3 text-base font-bold">{t('rpShell.rg_emptyTitle')}</p>
          <p className="mt-1 max-w-md px-4 text-sm text-muted-foreground">{t('rpShell.rg_emptyHint')}</p>
        </div>
      ) : tab === 'graph' ? (
        <div className="min-h-0 flex-1 overflow-auto rounded-lg border">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-muted"><tr>
              <th className="px-3 py-2 text-start font-semibold">{t('rpShell.rg_user')}</th>
              <th className="px-3 py-2 text-start font-semibold">{t('rpShell.rg_primary')}</th>
              <th className="px-3 py-2 text-start font-semibold">{t('rpShell.rg_secondary')}</th>
              <th className="px-3 py-2 text-center font-semibold">{t('rpShell.rg_seeAll')}</th>
              <th className="px-3 py-2 text-end font-semibold">{t('rpShell.rg_visibility')}</th>
            </tr></thead>
            <tbody>
              {nodes.map((n) => {
                const opts = nodes.filter((o) => o.userId !== n.userId);
                const vis = visibleUsers(nodes, n.userId).size;
                return (
                  <tr key={n.userId} className={`border-t ${busy === n.userId ? 'opacity-50' : ''}`}>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-1.5">
                        {n.inGraph ? <CircleDot className="h-3.5 w-3.5 text-emerald-600" /> : <Circle className="h-3.5 w-3.5 text-muted-foreground/40" />}
                        <span className="font-medium">{n.name}</span>
                        {n.userId === meId && <span className="rounded-full bg-primary/10 px-1.5 text-[10px] text-primary">{t('rpShell.rg_you')}</span>}
                        {n.role && <span className="text-[10px] text-muted-foreground">{n.role}</span>}
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <select value={n.primaryManagerId ?? ''} disabled={n.seeAll || busy === n.userId}
                        onChange={(e) => save(n.userId, { primaryManagerId: e.target.value || null })}
                        className="w-full rounded border bg-background px-1 py-1 text-[11px] disabled:opacity-50">
                        <option value="">{t('rpShell.rg_none')}</option>
                        {opts.map((o) => <option key={o.userId} value={o.userId}>{o.name}</option>)}
                      </select>
                    </td>
                    <td className="px-3 py-2">
                      <select value={n.secondaryManagerId ?? ''} disabled={n.seeAll || busy === n.userId}
                        onChange={(e) => save(n.userId, { secondaryManagerId: e.target.value || null })}
                        className="w-full rounded border bg-background px-1 py-1 text-[11px] disabled:opacity-50">
                        <option value="">{t('rpShell.rg_none')}</option>
                        {opts.map((o) => <option key={o.userId} value={o.userId}>{o.name}</option>)}
                      </select>
                    </td>
                    <td className="px-3 py-2 text-center">
                      <input type="checkbox" checked={n.seeAll} disabled={busy === n.userId}
                        onChange={(e) => save(n.userId, { seeAll: e.target.checked })} />
                    </td>
                    <td className="px-3 py-2 text-end tabular-nums" dir="ltr">
                      {n.seeAll ? <span className="inline-flex items-center gap-1 text-violet-700"><ShieldCheck className="h-3.5 w-3.5" /> {t('rpShell.rg_all')}</span> : `${vis} / ${nodes.length}`}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <Explorer nodes={nodes} selected={selected} setSelected={setSelected} nameOf={nameOf} meId={meId} t={t} />
      )}
    </div>
  );
}

type Dir = 'out' | 'in';

function Explorer({ nodes, selected, setSelected, nameOf, meId, t }: {
  nodes: RpNode[]; selected: string; setSelected: (v: string) => void;
  nameOf: (id: string | null) => string; meId: string; t: ReturnType<typeof useI18n>['t'];
}) {
  const [dir, setDir] = useState<Dir>('out');
  const me = nodes.find((n) => n.userId === selected) ?? null;
  const vis = useMemo(() => (me ? visibleUsers(nodes, selected) : new Set<string>()), [nodes, selected, me]);
  const reports = me ? directReports(nodes, selected) : [];
  const chain = me ? managerChain(nodes, selected) : [];

  // Outbound rows ("who can I see?"): the other party is the target of each fact.
  // Inbound rows ("who can see me?"): the other party is the viewer; path = viewer → me.
  const rows: { who: string; fact: VisibilityFact }[] = useMemo(() => {
    if (!me) return [];
    if (dir === 'out') {
      return visibilityExplain(nodes, selected)
        .filter((f) => f.targetId !== selected)
        .map((f) => ({ who: f.targetId, fact: f }))
        .sort((a, b) => a.fact.depth - b.fact.depth || nameOf(a.who).localeCompare(nameOf(b.who)));
    }
    return reverseVisibility(nodes, selected)
      .map((r) => ({ who: r.viewerId, fact: r.fact }))
      .sort((a, b) => a.fact.depth - b.fact.depth || nameOf(a.who).localeCompare(nameOf(b.who)));
  }, [nodes, selected, dir, me, nameOf]);

  const reasonLabel: Record<VisibilityReason, string> = {
    self: t('rpShell.rg_rSelf'), see_all: t('rpShell.rg_rSeeAll'), direct: t('rpShell.rg_rDirect'), subtree: t('rpShell.rg_rSubtree'),
  };
  const reasonTone: Record<VisibilityReason, string> = {
    self: 'bg-primary/10 text-primary', see_all: 'bg-violet-100 text-violet-700', direct: 'bg-emerald-100 text-emerald-700', subtree: 'bg-sky-100 text-sky-700',
  };
  const sourceLabel = (f: VisibilityFact) => {
    const s = visibilitySource(f);
    return s === 'primary' ? t('rpShell.rg_srcPrimary') : s === 'secondary' ? t('rpShell.rg_srcSecondary') : s === 'see_all' ? t('rpShell.rg_srcSeeAll') : t('rpShell.rg_srcSelf');
  };

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-muted-foreground">{t('rpShell.rg_pickUser')}</span>
        <select value={selected} onChange={(e) => setSelected(e.target.value)} className="rounded border bg-background px-2 py-1.5 text-sm">
          {nodes.map((n) => <option key={n.userId} value={n.userId}>{n.name}</option>)}
        </select>
        {/* Direction toggle */}
        <div className="ms-1 inline-flex overflow-hidden rounded-full border">
          <button onClick={() => setDir('out')} className={`inline-flex items-center gap-1 px-3 py-1 text-xs ${dir === 'out' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}>
            <Eye className="h-3.5 w-3.5" /> {t('rpShell.rg_dirOut')}
          </button>
          <button onClick={() => setDir('in')} className={`inline-flex items-center gap-1 px-3 py-1 text-xs ${dir === 'in' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}>
            <Users className="h-3.5 w-3.5" /> {t('rpShell.rg_dirIn')}
          </button>
        </div>
      </div>

      {!me ? <p className="text-sm text-muted-foreground">{t('rpShell.rg_pickUser')}</p> : (
        <div className="grid gap-3 lg:grid-cols-3">
          {/* Reporting chain */}
          <div className="rounded-lg border p-3 lg:col-span-1">
            <p className="mb-1 flex items-center gap-1.5 text-sm font-semibold"><Network className="h-4 w-4 text-primary" /> {t('rpShell.rg_chain')}</p>
            <div className="flex flex-wrap items-center gap-1 text-xs">
              <ArrowUp className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="rounded bg-primary/10 px-2 py-0.5 font-medium text-primary">{me.name}</span>
              {chain.length === 0 ? <span className="ms-1 text-muted-foreground">{t('rpShell.rg_isRoot')}</span> :
                chain.map((id) => (<span key={id} className="flex items-center gap-1"><span className="text-muted-foreground">→</span><span className="rounded bg-muted px-2 py-0.5">{nameOf(id)}</span></span>))}
            </div>
            {me.secondaryManagerId && <p className="mt-1.5 text-[11px] text-muted-foreground">{t('rpShell.rg_secondaryMgr')}: {nameOf(me.secondaryManagerId)}</p>}

            <p className="mb-1 mt-3 flex items-center gap-1.5 text-xs font-semibold"><ArrowDown className="h-3.5 w-3.5 text-muted-foreground" /> {t('rpShell.rg_directReports')} ({reports.length})</p>
            <div className="flex flex-wrap gap-1.5">
              {reports.length === 0 ? <span className="text-[11px] text-muted-foreground">{t('rpShell.rg_noReports')}</span> :
                reports.map((r) => <span key={r.id} className="rounded-full border px-2 py-0.5 text-[11px]">{nameOf(r.id)} <span className="text-muted-foreground">· {r.via === 'primary' ? t('rpShell.rg_primary') : t('rpShell.rg_secondary')}</span></span>)}
            </div>
          </div>

          {/* Directional relationship table — Reason · Source · Path */}
          <div className="rounded-lg border p-3 lg:col-span-2">
            <p className="mb-1 flex items-center gap-1.5 text-sm font-semibold">
              {dir === 'out' ? <Eye className="h-4 w-4 text-primary" /> : <Users className="h-4 w-4 text-primary" />}
              {dir === 'out' ? t('rpShell.rg_dirOut') : t('rpShell.rg_dirIn')}
            </p>
            <p className="text-sm">
              {dir === 'out'
                ? (me.seeAll
                    ? t('rpShell.rg_explainAll').replace('{u}', me.name).replace('{n}', String(nodes.length))
                    : t('rpShell.rg_explain').replace('{u}', me.name).replace('{n}', String(vis.size)).replace('{m}', String(nodes.length)))
                : t('rpShell.rg_explainIn').replace('{u}', me.name).replace('{n}', String(rows.length))}
            </p>
            <div className="mt-2 overflow-hidden rounded-lg border">
              <table className="w-full text-xs">
                <thead className="bg-muted"><tr>
                  <th className="px-3 py-1.5 text-start font-semibold">{dir === 'out' ? t('rpShell.rg_colTarget') : t('rpShell.rg_colViewer')}</th>
                  <th className="px-3 py-1.5 text-start font-semibold">{t('rpShell.rg_reason')}</th>
                  <th className="px-3 py-1.5 text-start font-semibold">{t('rpShell.rg_source')}</th>
                  <th className="px-3 py-1.5 text-start font-semibold">{t('rpShell.rg_path')}</th>
                </tr></thead>
                <tbody>
                  {rows.length === 0 ? (
                    <tr><td colSpan={4} className="px-3 py-3 text-center text-muted-foreground">{dir === 'in' ? t('rpShell.rg_seenByNone') : t('rpShell.rg_noReports')}</td></tr>
                  ) : rows.map(({ who, fact }) => (
                    <tr key={who} className="border-t">
                      <td className="px-3 py-1.5 font-medium">{nameOf(who)}{who === meId ? ` (${t('rpShell.rg_you')})` : ''}</td>
                      <td className="px-3 py-1.5"><span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${reasonTone[fact.reason]}`}>{reasonLabel[fact.reason]}</span></td>
                      <td className="px-3 py-1.5 text-muted-foreground">{sourceLabel(fact)}</td>
                      <td className="px-3 py-1.5 text-muted-foreground">
                        {fact.reason === 'see_all' ? <span className="italic">{t('rpShell.rg_overrideNote')}</span>
                          : fact.path.map((id, i) => <span key={id}>{i > 0 ? <span className="text-muted-foreground/60"> → </span> : null}{nameOf(id)}</span>)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
