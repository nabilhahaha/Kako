'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useI18n } from '@/lib/i18n/provider';
import { usePrompt } from '@/components/prompt-dialog';
import { useConfirm } from '@/components/confirm-dialog';
import { ALL_MODULES, MODULE_LABELS, type Module } from '@/lib/erp/navigation';
import { planModuleImpact, orphanedDependencies, type CompanyModuleState } from '@/lib/erp/plan-admin';
import {
  createPlan, updatePlan, setPlanActive, clonePlan, setPlanModules, reorderPlans, setBusinessTypeModule,
} from './actions';
import {
  ChevronDown, ChevronRight, Plus, Copy, Power, Save, ArrowUp, ArrowDown, Boxes, Users, Building2, Package, HardDrive, Hourglass, AlertTriangle,
} from 'lucide-react';

export type { CompanyModuleState };
export interface PlanRow {
  key: string; nameEn: string; nameAr: string; rank: number;
  maxUsers: number | null; maxBranches: number | null; maxProducts: number | null;
  storageLimitMb: number | null; trialDays: number; isActive: boolean;
  modules: string[]; companies: CompanyModuleState[];
}

const VERTICALS: Module[] = ['hotel', 'clinic', 'restaurant', 'salon', 'pharmacy', 'laundry', 'market', 'wholesale', 'distribution', 'fashion'];
const CORE: Module[] = (ALL_MODULES as Module[]).filter((m) => !VERTICALS.includes(m));

export function PlansManager({
  plans,
  businessTypes,
}: {
  plans: PlanRow[];
  businessTypes: { businessType: string; modules: string[] }[];
}) {
  const { t, locale } = useI18n();
  const [tab, setTab] = useState<'plans' | 'types'>('plans');

  return (
    <div className="space-y-4">
      <div className="flex gap-2 border-b">
        <TabBtn active={tab === 'plans'} onClick={() => setTab('plans')}>{t('platform.plans.tabs.plans')}</TabBtn>
        <TabBtn active={tab === 'types'} onClick={() => setTab('types')}>{t('platform.plans.tabs.types')}</TabBtn>
      </div>
      {tab === 'plans' ? <PlansTab plans={plans} /> : <TypesTab businessTypes={businessTypes} />}
    </div>
  );
}

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium transition-colors ${active ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
    >
      {children}
    </button>
  );
}

// ─── Plans tab ────────────────────────────────────────────────────────────────
function PlansTab({ plans }: { plans: PlanRow[] }) {
  const { t } = useI18n();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, okMsg?: string) {
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) toast.error(res.error ?? t('platform.plans.toastError'));
      else { if (okMsg) toast.success(okMsg); router.refresh(); }
    });
  }

  function move(index: number, dir: -1 | 1) {
    const next = [...plans];
    const j = index + dir;
    if (j < 0 || j >= next.length) return;
    [next[index], next[j]] = [next[j], next[index]];
    run(() => reorderPlans(next.map((p) => p.key)));
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => setCreating((v) => !v)}>
          <Plus className="h-4 w-4" /> {t('platform.plans.newPlan')}
        </Button>
      </div>

      {creating && (
        <PlanForm
          onCancel={() => setCreating(false)}
          onSubmit={(input) => run(async () => {
            const res = await createPlan(input);
            if (res.ok) setCreating(false);
            return res;
          }, t('platform.plans.created'))}
        />
      )}

      {plans.map((p, i) => (
        <Card key={p.key} className={p.isActive ? '' : 'opacity-70'}>
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <div className="flex flex-col gap-0.5 pt-1">
                <button disabled={pending || i === 0} onClick={() => move(i, -1)} className="text-muted-foreground hover:text-foreground disabled:opacity-30"><ArrowUp className="h-4 w-4" /></button>
                <button disabled={pending || i === plans.length - 1} onClick={() => move(i, 1)} className="text-muted-foreground hover:text-foreground disabled:opacity-30"><ArrowDown className="h-4 w-4" /></button>
              </div>
              <button className="flex flex-1 items-center gap-2 text-start" onClick={() => setExpanded(expanded === p.key ? null : p.key)}>
                {expanded === p.key ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                <span className="font-semibold">{p.nameEn || p.key}</span>
                <span className="text-sm text-muted-foreground">{p.nameAr}</span>
                <Badge variant="secondary">{p.key}</Badge>
                {!p.isActive && <Badge variant="warning">{t('platform.plans.archived')}</Badge>}
              </button>
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span title={t('platform.plans.companiesOnPlan')} className="inline-flex items-center gap-1"><Building2 className="h-3.5 w-3.5" />{p.companies.length}</span>
                <span title={t('platform.plans.moduleCount')} className="inline-flex items-center gap-1"><Boxes className="h-3.5 w-3.5" />{p.modules.length}</span>
              </div>
            </div>

            <div className="ms-7 mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <Limit icon={<Users className="h-3.5 w-3.5" />} label={t('platform.plans.maxUsers')} value={p.maxUsers} />
              <Limit icon={<Building2 className="h-3.5 w-3.5" />} label={t('platform.plans.maxBranches')} value={p.maxBranches} />
              <Limit icon={<Package className="h-3.5 w-3.5" />} label={t('platform.plans.maxProducts')} value={p.maxProducts} />
              <Limit icon={<HardDrive className="h-3.5 w-3.5" />} label={t('platform.plans.storage')} value={p.storageLimitMb} suffix=" MB" />
              <Limit icon={<Hourglass className="h-3.5 w-3.5" />} label={t('platform.plans.trialDays')} value={p.trialDays} />
            </div>

            {expanded === p.key && <PlanEditor plan={p} pending={pending} run={run} />}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function Limit({ icon, label, value, suffix }: { icon: React.ReactNode; label: string; value: number | null; suffix?: string }) {
  const { t } = useI18n();
  return (
    <span className="inline-flex items-center gap-1">
      {icon}{label}: <span className="font-medium text-foreground">{value === null ? t('platform.plans.unlimited') : `${value}${suffix ?? ''}`}</span>
    </span>
  );
}

function PlanEditor({ plan, pending, run }: { plan: PlanRow; pending: boolean; run: (fn: () => Promise<{ ok: boolean; error?: string }>, okMsg?: string) => void }) {
  const { t, locale } = useI18n();
  const prompt = usePrompt();
  const confirm = useConfirm();
  const [draft, setDraft] = useState<Set<string>>(new Set(plan.modules));

  const impact = useMemo(
    () => planModuleImpact(plan.modules as Module[], [...draft] as Module[], plan.companies),
    [plan.modules, plan.companies, draft],
  );
  const orphans = useMemo(() => orphanedDependencies([...draft] as Module[]), [draft]);
  const dirty = draft.size !== plan.modules.length || [...draft].some((m) => !plan.modules.includes(m));

  function toggle(m: Module, on: boolean) {
    setDraft((prev) => { const n = new Set(prev); if (on) n.add(m); else n.delete(m); return n; });
  }

  return (
    <div className="ms-7 mt-4 space-y-4 border-t pt-4">
      {/* Limits editor */}
      <PlanForm plan={plan} compact onSubmit={(input) => run(() => updatePlan(plan.key, input), t('platform.plans.saved'))} />

      {/* Module entitlements */}
      <div>
        <p className="mb-2 text-sm font-semibold">{t('platform.plans.entitlements')}</p>
        <ModuleGroup title={t('platform.plans.coreModules')} modules={CORE} draft={draft} toggle={toggle} locale={locale} />
        <ModuleGroup title={t('platform.plans.verticalModules')} modules={VERTICALS} draft={draft} toggle={toggle} locale={locale} />
      </div>

      {orphans.length > 0 && (
        <div className="rounded-md bg-warning/10 p-2 text-xs text-warning-foreground">
          <AlertTriangle className="me-1 inline h-3.5 w-3.5 text-warning" />
          {orphans.map((o) => t('platform.plans.orphanWarn', { module: MODULE_LABELS[o.module][locale], deps: o.missing.map((d) => MODULE_LABELS[d as Module][locale]).join('، ') })).join(' · ')}
        </div>
      )}

      {/* Impact preview */}
      {dirty && (
        <div className="rounded-md border bg-secondary/30 p-3 text-xs">
          <p className="mb-1 font-semibold">{t('platform.plans.impact.title')}</p>
          <p className="text-muted-foreground">
            {t('platform.plans.impact.summary', { added: impact.added.length, removed: impact.removed.length, affected: impact.affectedCount, total: impact.totalOnPlan })}
          </p>
          {impact.affected.slice(0, 8).map((c) => (
            <div key={c.id} className="mt-1">
              <span className="font-medium text-foreground">{c.name}</span>
              {c.gained.length > 0 && <span className="ms-1 text-success">+{c.gained.map((m) => MODULE_LABELS[m][locale]).join(', ')}</span>}
              {c.lost.length > 0 && <span className="ms-1 text-destructive">−{c.lost.map((m) => MODULE_LABELS[m][locale]).join(', ')}</span>}
            </div>
          ))}
          {impact.affected.length > 8 && <p className="mt-1 text-muted-foreground">{t('platform.plans.impact.more', { n: impact.affected.length - 8 })}</p>}
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" disabled={pending || !dirty} onClick={() => run(() => setPlanModules(plan.key, [...draft]), t('platform.plans.saved'))}>
          <Save className="h-4 w-4" /> {t('platform.plans.saveModules')}
        </Button>
        <Button size="sm" variant="outline" disabled={pending} onClick={async () => {
          const newKey = await prompt({ title: t('platform.plans.cloneTitle'), label: t('platform.plans.cloneKeyLabel'), placeholder: 'growth' });
          if (!newKey) return;
          run(() => clonePlan(plan.key, newKey.trim(), `${plan.nameEn} (copy)`, `${plan.nameAr} (نسخة)`), t('platform.plans.cloned'));
        }}>
          <Copy className="h-4 w-4" /> {t('platform.plans.clone')}
        </Button>
        <Button size="sm" variant={plan.isActive ? 'outline' : 'default'} disabled={pending} onClick={async () => {
          if (plan.isActive && plan.companies.length > 0) {
            const ok = await confirm({ title: t('platform.plans.archiveTitle'), message: t('platform.plans.archiveWarn', { n: plan.companies.length }), confirmText: t('platform.plans.archive'), destructive: true });
            if (!ok) return;
          }
          run(() => setPlanActive(plan.key, !plan.isActive), plan.isActive ? t('platform.plans.archived') : t('platform.plans.activated'));
        }}>
          <Power className="h-4 w-4" /> {plan.isActive ? t('platform.plans.archive') : t('platform.plans.activate')}
        </Button>
      </div>
    </div>
  );
}

function ModuleGroup({ title, modules, draft, toggle, locale }: { title: string; modules: Module[]; draft: Set<string>; toggle: (m: Module, on: boolean) => void; locale: 'en' | 'ar' }) {
  return (
    <div className="mb-3">
      <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/70">{title}</p>
      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-4">
        {modules.map((m) => (
          <label key={m} className="flex items-center gap-2 rounded-md border px-2 py-1.5 text-sm">
            <input type="checkbox" className="h-4 w-4 accent-primary" checked={draft.has(m)} onChange={(e) => toggle(m, e.target.checked)} />
            <span>{MODULE_LABELS[m][locale]}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

// Create / edit plan limits form.
function PlanForm({ plan, compact, onSubmit, onCancel }: {
  plan?: PlanRow; compact?: boolean;
  onSubmit: (input: import('@/lib/erp/plan-admin').PlanInput) => void;
  onCancel?: () => void;
}) {
  const { t } = useI18n();
  const [key, setKey] = useState(plan?.key ?? '');
  const [nameEn, setNameEn] = useState(plan?.nameEn ?? '');
  const [nameAr, setNameAr] = useState(plan?.nameAr ?? '');
  const [maxUsers, setMaxUsers] = useState(plan?.maxUsers?.toString() ?? '');
  const [maxBranches, setMaxBranches] = useState(plan?.maxBranches?.toString() ?? '');
  const [maxProducts, setMaxProducts] = useState(plan?.maxProducts?.toString() ?? '');
  const [storage, setStorage] = useState(plan?.storageLimitMb?.toString() ?? '');
  const [trial, setTrial] = useState(plan?.trialDays?.toString() ?? '0');
  const num = (s: string): number | null => (s.trim() === '' ? null : Number(s));

  return (
    <div className="rounded-md border p-3">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {!plan && (
          <Field label={t('platform.plans.key')}><Input value={key} onChange={(e) => setKey(e.target.value)} placeholder="growth" /></Field>
        )}
        <Field label={t('platform.plans.nameEn')}><Input value={nameEn} onChange={(e) => setNameEn(e.target.value)} /></Field>
        <Field label={t('platform.plans.nameAr')}><Input value={nameAr} onChange={(e) => setNameAr(e.target.value)} dir="rtl" /></Field>
        <Field label={t('platform.plans.maxUsers')}><Input type="number" value={maxUsers} onChange={(e) => setMaxUsers(e.target.value)} placeholder="∞" /></Field>
        <Field label={t('platform.plans.maxBranches')}><Input type="number" value={maxBranches} onChange={(e) => setMaxBranches(e.target.value)} placeholder="∞" /></Field>
        <Field label={t('platform.plans.maxProducts')}><Input type="number" value={maxProducts} onChange={(e) => setMaxProducts(e.target.value)} placeholder="∞" /></Field>
        <Field label={t('platform.plans.storage')}><Input type="number" value={storage} onChange={(e) => setStorage(e.target.value)} placeholder="∞" /></Field>
        <Field label={t('platform.plans.trialDays')}><Input type="number" value={trial} onChange={(e) => setTrial(e.target.value)} /></Field>
      </div>
      <div className="mt-3 flex gap-2">
        <Button size="sm" onClick={() => onSubmit({
          key: plan?.key ?? key.trim(), nameEn, nameAr,
          rank: plan?.rank ?? 99,
          maxUsers: num(maxUsers), maxBranches: num(maxBranches), maxProducts: num(maxProducts),
          storageLimitMb: num(storage), trialDays: Number(trial || '0'), isActive: plan?.isActive ?? true,
        })}>
          <Save className="h-4 w-4" /> {compact ? t('platform.plans.saveLimits') : t('platform.plans.create')}
        </Button>
        {onCancel && <Button size="sm" variant="ghost" onClick={onCancel}>{t('common.cancel')}</Button>}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><Label className="text-xs text-muted-foreground">{label}</Label>{children}</div>;
}

// ─── Business-type templates tab ──────────────────────────────────────────────
function TypesTab({ businessTypes }: { businessTypes: { businessType: string; modules: string[] }[] }) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function toggle(bt: string, m: Module, on: boolean) {
    startTransition(async () => {
      const res = await setBusinessTypeModule(bt, m, on);
      if (!res.ok) toast.error(res.error ?? t('platform.plans.toastError'));
      else router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">{t('platform.plans.types.hint')}</p>
      {businessTypes.map(({ businessType, modules }) => {
        const set = new Set(modules);
        return (
          <Card key={businessType}>
            <CardContent className="p-4">
              <p className="mb-2 font-semibold capitalize">{businessType}</p>
              <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-4">
                {(ALL_MODULES as Module[]).map((m) => (
                  <label key={m} className="flex items-center gap-2 rounded-md border px-2 py-1.5 text-sm">
                    <input type="checkbox" className="h-4 w-4 accent-primary" disabled={pending} checked={set.has(m)} onChange={(e) => toggle(businessType, m, e.target.checked)} />
                    <span>{MODULE_LABELS[m][locale]}</span>
                  </label>
                ))}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
