'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Card, CardContent } from '@/components/ui/card';
import { Tooltip } from '@/components/ui/tooltip';
import { useConfirm } from '@/components/confirm-dialog';
import { Loader2, Check, Lock, RotateCcw, Info } from 'lucide-react';
import {
  ShoppingCart, Boxes, Truck as TruckIcon, Wallet, BedDouble, Stethoscope,
  UtensilsCrossed, Scissors, Pill, WashingMachine, ScanBarcode, Layers,
  FileText, Undo2, Warehouse, Users, ClipboardCheck, BarChart3, Plug, type LucideIcon,
} from 'lucide-react';
import { ALL_MODULES, MODULE_LABELS, type Module } from '@/lib/erp/navigation';
import {
  classifyModuleKey,
  MODULE_DESCRIPTIONS,
  MODULE_DEPENDENCIES,
  dependentsOf,
  recommendedModulesForBusinessType,
} from '@/lib/erp/licensing-catalog';
import { useI18n } from '@/lib/i18n/provider';
import { toggleCompanyModule } from './actions';

const ICONS: Record<Module, LucideIcon> = {
  crm: Users, workflow: ClipboardCheck, analytics: BarChart3, field_ops: TruckIcon, integrations: Plug,
  sales: ShoppingCart, inventory: Boxes, purchasing: TruckIcon, accounting: Wallet,
  hotel: BedDouble, clinic: Stethoscope, restaurant: UtensilsCrossed, salon: Scissors,
  pharmacy: Pill, laundry: WashingMachine, market: ScanBarcode, wholesale: Layers,
  distribution: TruckIcon, pos: ScanBarcode, sales_orders: FileText, returns: Undo2,
  warehousing: Warehouse,
};

const MARKETPLACE_MODULES = ALL_MODULES;

export function MarketplaceManager({
  enabledModules,
  planModules = null,
  businessType = null,
}: {
  enabledModules: Module[];
  /** Modules unlocked by the company's plan; null = unconfigured → all unlocked. */
  planModules?: string[] | null;
  /** Company business type → drives the "Reset to recommended" diff (display-only). */
  businessType?: string | null;
}) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const confirm = useConfirm();
  const [enabled, setEnabled] = useState<Set<Module>>(new Set(enabledModules));
  const [busy, setBusy] = useState<Module | null>(null);
  const [resetting, setResetting] = useState(false);
  const [, startTransition] = useTransition();

  const isLocked = (m: Module) => planModules != null && !planModules.includes(m);
  const label = (m: Module) => MODULE_LABELS[m][locale];
  const desc = (m: Module) => MODULE_DESCRIPTIONS[m]?.[locale] ?? null;

  function applyToggle(m: Module, next: boolean) {
    setBusy(m);
    startTransition(async () => {
      const res = await toggleCompanyModule(m, next);
      setBusy(null);
      if (!res.ok) { toast.error(res.error ?? t('marketplace.error')); return; }
      setEnabled((prev) => {
        const s = new Set(prev);
        if (next) s.add(m); else s.delete(m);
        return s;
      });
      toast.success(next ? t('marketplace.enabled') : t('marketplace.disabled'));
      router.refresh();
    });
  }

  function toggle(m: Module) {
    if (isLocked(m)) return; // locked: capability surfaced via Upgrade badge, no dead toggle
    const next = !enabled.has(m);
    // Advisory dependency warning before disabling a depended-on module.
    if (!next) {
      const dependents = dependentsOf(m, [...enabled]).filter((d) => d !== m);
      if (dependents.length > 0) {
        const names = dependents.map((d) => label(d as Module)).join('، ');
        void confirm({
          title: t('marketplace.disableWarnTitle', { module: label(m) }),
          message: t('marketplace.disableWarnBody', { modules: names }),
          confirmText: t('marketplace.disableWarnConfirm'),
          destructive: true,
        }).then((ok) => { if (ok) applyToggle(m, false); });
        return;
      }
    }
    applyToggle(m, next);
  }

  // ── Reset to recommended (composed from the EXISTING toggle action) ──────────
  const recommended = useMemo(
    () => (businessType ? recommendedModulesForBusinessType(businessType) : null),
    [businessType],
  );

  function resetToRecommended() {
    if (!recommended) { toast.error(t('marketplace.resetNone')); return; }
    const target = new Set(recommended.filter((m) => MARKETPLACE_MODULES.includes(m as Module)) as Module[]);
    const toEnable = [...target].filter((m) => !enabled.has(m) && !isLocked(m));
    const toDisable = MARKETPLACE_MODULES.filter((m) => enabled.has(m) && !target.has(m));
    if (toEnable.length === 0 && toDisable.length === 0) {
      toast.info(t('marketplace.resetConfirmNoChange'));
      return;
    }
    const fmt = (list: Module[]) => (list.length ? list.map(label).join('، ') : t('marketplace.none'));
    void confirm({
      title: t('marketplace.resetConfirmTitle'),
      message: t('marketplace.resetConfirmBody', { enable: fmt(toEnable), disable: fmt(toDisable) }),
      confirmText: t('marketplace.resetConfirm'),
    }).then(async (ok) => {
      if (!ok) return;
      setResetting(true);
      let failed = false;
      // Sequentially loop the existing single-module toggle action — no new write.
      for (const m of toEnable) {
        const res = await toggleCompanyModule(m, true);
        if (!res.ok) { failed = true; break; }
        setEnabled((prev) => new Set(prev).add(m));
      }
      if (!failed) {
        for (const m of toDisable) {
          const res = await toggleCompanyModule(m, false);
          if (!res.ok) { failed = true; break; }
          setEnabled((prev) => { const s = new Set(prev); s.delete(m); return s; });
        }
      }
      setResetting(false);
      if (failed) { toast.error(t('marketplace.error')); }
      else { toast.success(t('marketplace.resetDone')); }
      router.refresh();
    });
  }

  const tile = (m: Module) => {
    const Icon = ICONS[m];
    const on = enabled.has(m);
    const locked = isLocked(m);
    const isBusy = busy === m;
    const description = desc(m);
    const deps = (MODULE_DEPENDENCIES[m] ?? []).filter((d) => d !== m);
    return (
      <Card key={m} className={locked ? 'opacity-80' : on ? 'border-primary/40' : ''}>
        <CardContent className="flex h-full flex-col gap-2.5 p-5">
          <div className="flex items-start justify-between gap-2">
            <span className={`flex h-11 w-11 items-center justify-center rounded-xl ${on && !locked ? 'bg-primary/10 text-primary' : 'bg-secondary text-muted-foreground'}`}>
              <Icon className="h-5 w-5" />
            </span>
            {locked ? (
              <Tooltip label={t('marketplace.lockedHint')}>
                <span className="inline-flex items-center gap-1 rounded-full bg-warning/10 px-2 py-0.5 text-xs font-medium text-warning">
                  <Lock className="h-3 w-3" /> {t('marketplace.locked')}
                </span>
              </Tooltip>
            ) : on ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-success/10 px-2 py-0.5 text-xs font-medium text-success">
                <Check className="h-3 w-3" /> {t('marketplace.installed')}
              </span>
            ) : null}
          </div>
          <h3 className="font-semibold leading-tight">{label(m)}</h3>
          {description && <p className="text-xs leading-snug text-muted-foreground">{description}</p>}
          {deps.length > 0 && (
            <p className="flex items-start gap-1 text-[11px] leading-snug text-muted-foreground/80">
              <Info className="mt-0.5 h-3 w-3 shrink-0" />
              <span>{t('marketplace.needsHint', { modules: deps.map((d) => label(d as Module)).join('، ') })}</span>
            </p>
          )}
          <button
            onClick={() => toggle(m)}
            disabled={isBusy || locked || resetting}
            className={`mt-auto inline-flex h-9 items-center justify-center gap-2 rounded-lg px-3 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-60 ${
              locked
                ? 'border text-muted-foreground'
                : on
                ? 'border text-foreground hover:bg-secondary'
                : 'bg-primary text-primary-foreground hover:opacity-90'
            }`}
          >
            {isBusy && <Loader2 className="h-4 w-4 animate-spin" />}
            {locked ? (
              <><Lock className="h-3.5 w-3.5" /> {t('marketplace.locked')}</>
            ) : on ? t('marketplace.disable') : t('marketplace.enable')}
          </button>
        </CardContent>
      </Card>
    );
  };

  const core = MARKETPLACE_MODULES.filter((m) => classifyModuleKey(m) === 'core');
  const packs = MARKETPLACE_MODULES.filter((m) => classifyModuleKey(m) === 'pack');
  const heading = (key: 'coreModules' | 'industryPacks') => (
    <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t(`marketplace.${key}`)}</h2>
  );

  return (
    <div className="space-y-8">
      {/* Primary action for this screen: bring modules back to the recommended set. */}
      {recommended && (
        <div className="flex flex-col gap-2 rounded-lg border bg-secondary/30 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium">{t('marketplace.resetTitle')}</p>
            <p className="text-xs text-muted-foreground">{t('marketplace.resetHint')}</p>
          </div>
          <button
            onClick={resetToRecommended}
            disabled={resetting || busy != null}
            className="inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-lg border bg-background px-4 text-sm font-medium transition hover:bg-secondary disabled:opacity-60"
          >
            {resetting ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
            {t('marketplace.resetButton')}
          </button>
        </div>
      )}
      <section>
        {heading('coreModules')}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{core.map(tile)}</div>
      </section>
      <section>
        {heading('industryPacks')}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{packs.map(tile)}</div>
      </section>
    </div>
  );
}
