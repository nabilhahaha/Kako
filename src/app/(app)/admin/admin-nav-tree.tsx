'use client';

import { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { ChevronRight, ChevronDown, Plus, Building2, Users, ShieldCheck, GitBranch, LayoutGrid, Loader2 } from 'lucide-react';
import { useI18n } from '@/lib/i18n/provider';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { loadNavBranch, type NavType, type NavNode } from './nav-tree-actions';

interface Group { type: NavType; labelKey: string; icon: typeof Building2; base: string; createHref: string }

const ALL_GROUPS: Group[] = [
  { type: 'company', labelKey: 'adminWb.companiesTitle', icon: Building2, base: '/platform/companies', createHref: '/platform/companies?new=1' },
  { type: 'user', labelKey: 'adminWb.navUsers', icon: Users, base: '/settings/users', createHref: '/settings/users' },
  { type: 'role', labelKey: 'adminWb.navRoles', icon: ShieldCheck, base: '/settings/authz', createHref: '/settings/authz' },
  { type: 'branch', labelKey: 'adminWb.branchesTitle', icon: GitBranch, base: '/settings/branches', createHref: '/settings/branches' },
  { type: 'feature', labelKey: 'adminWb.featuresTitle', icon: LayoutGrid, base: '/settings/features', createHref: '/settings/features' },
];

/**
 * Admin Navigation Tree — a persistent, lazy, searchable, role-aware tree across
 * admin entity types. Selecting a node opens that entity's existing Workbench
 * (URL-addressable). Branches load on first expand via loadNavBranch. Reuses
 * existing loaders and workbench URLs — no new data model, no logic change.
 */
export function AdminNavTree({ allowedTypes }: { allowedTypes: NavType[] }) {
  const { t } = useI18n();
  const pathname = usePathname();
  const params = useSearchParams();
  const currentId = params.get('id');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<Set<NavType>>(new Set());
  const [nodes, setNodes] = useState<Partial<Record<NavType, NavNode[]>>>({});
  const [loading, setLoading] = useState<Set<NavType>>(new Set());
  const [, start] = useTransition();

  const groups = useMemo(() => ALL_GROUPS.filter((g) => allowedTypes.includes(g.type)), [allowedTypes]);
  const needle = q.trim().toLowerCase();

  function toggle(type: NavType) {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else {
        next.add(type);
        if (!nodes[type]) {
          setLoading((l) => new Set(l).add(type));
          start(async () => {
            const rows = await loadNavBranch(type);
            setNodes((n) => ({ ...n, [type]: rows }));
            setLoading((l) => { const s = new Set(l); s.delete(type); return s; });
          });
        }
      }
      return next;
    });
  }

  const isActive = (n: NavNode) => currentId != null && n.href.includes(`id=${currentId}`) && n.href.startsWith(pathname.split('?')[0]);

  return (
    <Card className="lg:sticky lg:top-4 lg:self-start">
      <CardContent className="space-y-2 p-3">
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('adminWb.navSearch')} aria-label={t('adminWb.navSearch')} />
        <nav className="max-h-[calc(100vh-9rem)] space-y-1 overflow-auto">
          {groups.map((g) => {
            const Icon = g.icon;
            const expanded = open.has(g.type);
            const list = (nodes[g.type] ?? []).filter((n) => !needle || n.label.toLowerCase().includes(needle));
            return (
              <div key={g.type}>
                <div className="group flex items-center gap-1 rounded-md px-1 hover:bg-secondary/60">
                  <button onClick={() => toggle(g.type)} className="flex flex-1 items-center gap-2 py-1.5 text-start text-sm font-medium">
                    {expanded ? <ChevronDown className="h-3.5 w-3.5 shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0 rtl:rotate-180" />}
                    <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="truncate">{t(g.labelKey)}</span>
                  </button>
                  <Link href={g.createHref} aria-label="new" className="rounded p-1 text-muted-foreground opacity-0 hover:bg-secondary group-hover:opacity-100">
                    <Plus className="h-3.5 w-3.5" />
                  </Link>
                </div>
                {expanded && (
                  <div className="ms-5 space-y-0.5 border-s ps-2">
                    {loading.has(g.type) ? (
                      <p className="flex items-center gap-1 px-1 py-1 text-xs text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" /> …</p>
                    ) : list.length === 0 ? (
                      <p className="px-1 py-1 text-xs text-muted-foreground">—</p>
                    ) : (
                      list.map((n) => (
                        <Link
                          key={n.id}
                          href={n.href}
                          className={`flex items-center justify-between gap-2 rounded-md px-2 py-1 text-sm ${isActive(n) ? 'bg-secondary font-medium text-foreground' : 'text-muted-foreground hover:bg-secondary/60 hover:text-foreground'}`}
                        >
                          <span className="min-w-0 truncate">{n.label}</span>
                          {n.secondary && <span className="shrink-0 text-[10px] text-muted-foreground" dir="ltr">{n.secondary}</span>}
                        </Link>
                      ))
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </nav>
      </CardContent>
    </Card>
  );
}
