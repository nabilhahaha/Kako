'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Card, CardContent } from '@/components/ui/card';
import { Loader2, Check } from 'lucide-react';
import {
  ShoppingCart, Boxes, Truck as TruckIcon, Wallet, BedDouble, Stethoscope,
  UtensilsCrossed, Scissors, Pill, WashingMachine, ScanBarcode, Layers,
  FileText, Undo2, Warehouse, Users, ClipboardCheck, BarChart3, Plug, type LucideIcon,
} from 'lucide-react';
import { ALL_MODULES, MODULE_LABELS, type Module } from '@/lib/erp/navigation';
import { classifyModuleKey } from '@/lib/erp/licensing-catalog';
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

// Coarse modules shown as installable apps (the finer pos/sales_orders/returns/
// warehousing are driven by the business type / setup, so we keep the grid clean).
const MARKETPLACE_MODULES = ALL_MODULES;

export function MarketplaceManager({ enabledModules }: { enabledModules: Module[] }) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const [enabled, setEnabled] = useState<Set<Module>>(new Set(enabledModules));
  const [busy, setBusy] = useState<Module | null>(null);
  const [, startTransition] = useTransition();

  function toggle(m: Module) {
    const next = !enabled.has(m);
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

  const tile = (m: Module) => {
    const Icon = ICONS[m];
    const on = enabled.has(m);
    const isBusy = busy === m;
    return (
      <Card key={m} className={on ? 'border-primary/40' : ''}>
        <CardContent className="flex h-full flex-col gap-3 p-5">
          <div className="flex items-start justify-between">
            <span className={`flex h-11 w-11 items-center justify-center rounded-xl ${on ? 'bg-primary/10 text-primary' : 'bg-secondary text-muted-foreground'}`}>
              <Icon className="h-5 w-5" />
            </span>
            {on && (
              <span className="inline-flex items-center gap-1 rounded-full bg-success/10 px-2 py-0.5 text-xs font-medium text-success">
                <Check className="h-3 w-3" /> {t('marketplace.installed')}
              </span>
            )}
          </div>
          <h3 className="font-semibold">{MODULE_LABELS[m][locale]}</h3>
          <button
            onClick={() => toggle(m)}
            disabled={isBusy}
            className={`mt-auto inline-flex h-9 items-center justify-center gap-2 rounded-lg px-3 text-sm font-medium transition ${
              on ? 'border text-foreground hover:bg-secondary' : 'bg-primary text-primary-foreground hover:opacity-90'
            }`}
          >
            {isBusy && <Loader2 className="h-4 w-4 animate-spin" />}
            {on ? t('marketplace.disable') : t('marketplace.enable')}
          </button>
        </CardContent>
      </Card>
    );
  };

  const core = MARKETPLACE_MODULES.filter((m) => classifyModuleKey(m) === 'core');
  const packs = MARKETPLACE_MODULES.filter((m) => classifyModuleKey(m) === 'pack');
  const heading = (en: string, ar: string) => (
    <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{locale === 'ar' ? ar : en}</h2>
  );

  return (
    <div className="space-y-8">
      <section>
        {heading('Core Modules', 'الوحدات الأساسية')}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{core.map(tile)}</div>
      </section>
      <section>
        {heading('Industry Packs', 'باقات القطاعات')}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{packs.map(tile)}</div>
      </section>
    </div>
  );
}
