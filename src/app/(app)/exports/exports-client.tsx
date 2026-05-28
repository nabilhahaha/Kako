'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { downloadCsv } from '@/lib/export-csv';
import {
  exportSalesRows,
  exportInventoryRows,
  exportAccountingRows,
  exportPaymentsRows,
} from './actions';
import { Download, Loader2, Receipt, Boxes, Wallet, BookOpen } from 'lucide-react';
import { toast } from 'sonner';

type Fetcher = (from: string, to: string) => Promise<{ ok: boolean; error?: string; data?: Record<string, string | number>[] }>;

const SECTIONS: { key: string; label: string; file: string; icon: typeof Receipt; fetch: Fetcher }[] = [
  { key: 'sales', label: 'المبيعات (الفواتير)', file: 'sales', icon: Receipt, fetch: exportSalesRows },
  { key: 'payments', label: 'التحصيلات', file: 'payments', icon: Wallet, fetch: exportPaymentsRows },
  { key: 'inventory', label: 'حركات المخزون', file: 'inventory', icon: Boxes, fetch: exportInventoryRows },
  { key: 'accounting', label: 'القيود المحاسبية', file: 'accounting', icon: BookOpen, fetch: exportAccountingRows },
];

function monthStart() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}

export function ExportsClient() {
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10));
  const [busy, setBusy] = useState<string | null>(null);

  async function run(key: string, file: string, fetch: Fetcher) {
    setBusy(key);
    try {
      const res = await fetch(from, to);
      if (!res.ok || !res.data) {
        toast.error(res.error ?? 'حدث خطأ');
        return;
      }
      if (res.data.length === 0) {
        toast.error('لا توجد بيانات في الفترة المحددة.');
        return;
      }
      downloadCsv(`${file}_${from}_${to}.csv`, res.data);
      toast.success(`تم تصدير ${res.data.length} سجل`);
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
              <Label className="text-xs">من</Label>
              <Input type="date" dir="ltr" value={from} onChange={(e) => setFrom(e.target.value)} className="w-40" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">إلى</Label>
              <Input type="date" dir="ltr" value={to} onChange={(e) => setTo(e.target.value)} className="w-40" />
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2">
        {SECTIONS.map((s) => {
          const Icon = s.icon;
          return (
            <Card key={s.key}>
              <CardContent className="flex items-center justify-between gap-3 p-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Icon className="h-5 w-5" />
                  </div>
                  <span className="font-medium">{s.label}</span>
                </div>
                <Button variant="outline" size="sm" disabled={busy !== null} onClick={() => run(s.key, s.file, s.fetch)}>
                  {busy === s.key ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                  تصدير CSV
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>
      <p className="text-xs text-muted-foreground">
        الملفات بصيغة CSV بترميز UTF-8 (تفتح مباشرة في Excel بالعربية). الحد الأقصى ٥٠٠٠ سطر لكل تصدير.
      </p>
    </div>
  );
}
