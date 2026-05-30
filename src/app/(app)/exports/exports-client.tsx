'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { downloadCsv } from '@/lib/export-csv';
import { useI18n } from '@/lib/i18n/provider';
import {
  exportSalesRows,
  exportInventoryRows,
  exportAccountingRows,
  exportPaymentsRows,
  exportCustomersRows,
  exportProductsRows,
} from './actions';
import { Download, Loader2, Receipt, Boxes, Wallet, BookOpen, Users, Package } from 'lucide-react';
import { toast } from 'sonner';

type Fetcher = (from: string, to: string) => Promise<{ ok: boolean; error?: string; data?: Record<string, string | number>[] }>;

const SECTION_DEFS: { key: string; labelKey: string; file: string; icon: typeof Receipt; fetch: Fetcher; full?: boolean }[] = [
  { key: 'sales',      labelKey: 'exports.sectionSales',      file: 'sales',      icon: Receipt,  fetch: exportSalesRows },
  { key: 'payments',   labelKey: 'exports.sectionPayments',   file: 'payments',   icon: Wallet,   fetch: exportPaymentsRows },
  { key: 'inventory',  labelKey: 'exports.sectionInventory',  file: 'inventory',  icon: Boxes,    fetch: exportInventoryRows },
  { key: 'accounting', labelKey: 'exports.sectionAccounting', file: 'accounting', icon: BookOpen, fetch: exportAccountingRows },
  { key: 'customers',  labelKey: 'exports.sectionCustomers',  file: 'customers',  icon: Users,    fetch: exportCustomersRows, full: true },
  { key: 'products',   labelKey: 'exports.sectionProducts',   file: 'products',   icon: Package,  fetch: exportProductsRows,  full: true },
];

function monthStart() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}

export function ExportsClient() {
  const { t } = useI18n();
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10));
  const [busy, setBusy] = useState<string | null>(null);

  async function run(s: (typeof SECTION_DEFS)[number]) {
    setBusy(s.key);
    try {
      const res = await s.fetch(from, to);
      if (!res.ok || !res.data) {
        toast.error(res.error ?? t('exports.errorGeneric'));
        return;
      }
      if (res.data.length === 0) {
        toast.error(s.full ? t('exports.errorNoData') : t('exports.errorNoDataInRange'));
        return;
      }
      downloadCsv(s.full ? `${s.file}.csv` : `${s.file}_${from}_${to}.csv`, res.data);
      toast.success(t('exports.toastExported', { count: res.data.length }));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <Label className="text-xs">{t('exports.labelFrom')}</Label>
              <Input type="date" dir="ltr" value={from} onChange={(e) => setFrom(e.target.value)} className="w-40" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{t('exports.labelTo')}</Label>
              <Input type="date" dir="ltr" value={to} onChange={(e) => setTo(e.target.value)} className="w-40" />
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2">
        {SECTION_DEFS.map((s) => {
          const Icon = s.icon;
          return (
            <Card key={s.key}>
              <CardContent className="flex items-center justify-between gap-3 p-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Icon className="h-5 w-5" />
                  </div>
                  <span className="font-medium">{t(s.labelKey)}</span>
                </div>
                <Button variant="outline" size="sm" disabled={busy !== null} onClick={() => run(s)}>
                  {busy === s.key ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                  {t('exports.btnExportCsv')}
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>
      <p className="text-xs text-muted-foreground">
        {t('exports.footerNote')}
      </p>
    </div>
  );
}
