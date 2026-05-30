'use client';

import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Download, Loader2, Pill, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { importEgyptianDrugs } from '../../clinic/reference-actions';

export function DrugImporter({ initialCount }: { initialCount: number }) {
  const [count, setCount] = useState(initialCount);
  const [pending, startTransition] = useTransition();

  function run() {
    startTransition(async () => {
      const res = await importEgyptianDrugs();
      if (!res.ok) { toast.error(res.error ?? 'تعذّر التحميل'); return; }
      setCount(res.count ?? 0);
      toast.success(`تم تحميل ${res.count?.toLocaleString('en')} دواء`);
    });
  }

  return (
    <Card>
      <CardContent className="space-y-4 p-6">
        <div className="flex items-center gap-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Pill className="h-6 w-6" />
          </span>
          <div>
            <p className="text-sm text-muted-foreground">عدد الأدوية المحمّلة حالياً</p>
            <p className="text-2xl font-bold tabular-nums" dir="ltr">{count.toLocaleString('en')}</p>
          </div>
        </div>

        <p className="text-sm text-muted-foreground">
          اضغط الزر لتحميل/تحديث القائمة الكاملة (~٢٤٬٨٠٠ دواء) من المصدر المفتوح. العملية تستبدل القائمة الحالية وتستغرق ثوانٍ.
        </p>

        <Button onClick={run} disabled={pending}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          {count > 0 ? 'تحديث قائمة الأدوية' : 'تحميل قائمة الأدوية'}
        </Button>

        {count > 0 && (
          <p className="flex items-center gap-1 text-xs text-success">
            <CheckCircle2 className="h-3.5 w-3.5" /> القائمة جاهزة وتظهر للأطباء في الروشتة.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
