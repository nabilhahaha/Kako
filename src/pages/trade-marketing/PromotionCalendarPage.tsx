import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Megaphone, Plus, Loader2, Calendar } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ErrorState } from '@/components/shared/ErrorState';
import { EmptyState } from '@/components/shared/EmptyState';
import { SkeletonRow } from '@/components/shared/SkeletonCard';
import { usePromotions, useCreatePromotion } from '@/hooks/usePromotions';
import { promotionSchema, type PromotionValues } from '@/lib/schemas';
import { cn, formatCurrency } from '@/lib/utils';
import type { PromotionStatus } from '@/lib/types';

const CHANNELS = ['TT', 'WS', 'DS', 'MT', 'SW'];

const STATUS_VARIANT: Record<
  PromotionStatus,
  'success' | 'warning' | 'info' | 'secondary' | 'destructive'
> = {
  active: 'success',
  paused: 'warning',
  draft: 'secondary',
  completed: 'info',
  cancelled: 'destructive',
};

const STATUS_LABEL: Record<PromotionStatus, string> = {
  draft: 'مسودة',
  active: 'نشط',
  paused: 'متوقف',
  completed: 'مكتمل',
  cancelled: 'ملغى',
};

export function PromotionCalendarPage() {
  const promosQ = usePromotions();
  const create = useCreatePromotion();
  const [showForm, setShowForm] = useState(false);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<PromotionValues>({
    resolver: zodResolver(promotionSchema),
    defaultValues: {
      name: '',
      nameAr: '',
      status: 'draft',
      startDate: '',
      endDate: '',
      channelTypes: [],
      expectedRoi: null,
      tradeSpend: null,
      notes: '',
    },
  });

  const selectedChannels = watch('channelTypes');
  const status = watch('status');

  function toggleChannel(ch: string) {
    if (selectedChannels.includes(ch)) {
      setValue(
        'channelTypes',
        selectedChannels.filter((c) => c !== ch),
        { shouldValidate: true },
      );
    } else {
      setValue('channelTypes', [...selectedChannels, ch], { shouldValidate: true });
    }
  }

  async function onSubmit(values: PromotionValues) {
    try {
      await create.mutateAsync(values);
      toast.success('تم إنشاء العرض');
      reset();
      setShowForm(false);
    } catch (err) {
      toast.error('فشل الحفظ', {
        description: err instanceof Error ? err.message : undefined,
      });
    }
  }

  const sorted = useMemo(() => {
    return (promosQ.data ?? []).slice().sort((a, b) => {
      const order: PromotionStatus[] = ['active', 'paused', 'draft', 'completed', 'cancelled'];
      const ai = order.indexOf(a.status);
      const bi = order.indexOf(b.status);
      if (ai !== bi) return ai - bi;
      return b.start_date.localeCompare(a.start_date);
    });
  }, [promosQ.data]);

  return (
    <div className="space-y-5">
      <PageHeader
        title="تقويم العروض"
        description="حملات العروض والترويج عبر القنوات"
        back="/trade-marketing"
        actions={
          <Button onClick={() => setShowForm((v) => !v)}>
            <Plus className="h-4 w-4" />
            عرض جديد
          </Button>
        }
      />

      {showForm && (
        <Card className="p-5">
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="name">اسم العرض (EN)</Label>
                <Input id="name" {...register('name')} />
                {errors.name && (
                  <p className="text-caption text-destructive">{errors.name.message}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="nameAr">الاسم بالعربي</Label>
                <Input id="nameAr" {...register('nameAr')} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="start">تاريخ البداية</Label>
                <Input id="start" type="date" {...register('startDate')} />
                {errors.startDate && (
                  <p className="text-caption text-destructive">{errors.startDate.message}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="end">تاريخ النهاية</Label>
                <Input id="end" type="date" {...register('endDate')} />
                {errors.endDate && (
                  <p className="text-caption text-destructive">{errors.endDate.message}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="spend">الإنفاق المتوقع (ر.س)</Label>
                <Input
                  id="spend"
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  {...register('tradeSpend', {
                    setValueAs: (v) => (v === '' ? null : Number(v)),
                  })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="roi">ROI متوقع %</Label>
                <Input
                  id="roi"
                  type="number"
                  inputMode="decimal"
                  step="0.1"
                  {...register('expectedRoi', {
                    setValueAs: (v) => (v === '' ? null : Number(v)),
                  })}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>القنوات</Label>
              <div className="flex flex-wrap gap-2">
                {CHANNELS.map((ch) => {
                  const active = selectedChannels.includes(ch);
                  return (
                    <button
                      key={ch}
                      type="button"
                      onClick={() => toggleChannel(ch)}
                      className={cn(
                        'inline-flex items-center rounded-full border px-3 py-1.5 text-sm font-medium transition-colors',
                        active
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-border bg-card text-muted-foreground hover:text-foreground',
                      )}
                    >
                      {ch}
                    </button>
                  );
                })}
              </div>
              {errors.channelTypes && (
                <p className="text-caption text-destructive">{errors.channelTypes.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label>الحالة</Label>
              <div className="flex flex-wrap gap-2">
                {(Object.keys(STATUS_LABEL) as PromotionStatus[]).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setValue('status', s, { shouldValidate: true })}
                    className={cn(
                      'inline-flex items-center rounded-full border px-3 py-1.5 text-sm font-medium transition-colors',
                      status === s
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-border bg-card text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {STATUS_LABEL[s]}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">ملاحظات</Label>
              <Textarea id="notes" rows={3} {...register('notes')} />
            </div>

            <div className="flex gap-2">
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4" />
                )}
                حفظ
              </Button>
              <Button type="button" variant="ghost" onClick={() => setShowForm(false)}>
                إلغاء
              </Button>
            </div>
          </form>
        </Card>
      )}

      {promosQ.isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonRow key={i} />
          ))}
        </div>
      ) : promosQ.isError ? (
        <ErrorState
          message={(promosQ.error as Error)?.message}
          onRetry={() => promosQ.refetch()}
        />
      ) : !sorted.length ? (
        <EmptyState
          icon={Megaphone}
          title="لا توجد عروض بعد"
          description="ابدأ بإنشاء عرض ترويجي جديد."
          actionLabel="عرض جديد"
          onAction={() => setShowForm(true)}
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {sorted.map((p) => (
            <Card key={p.id} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 space-y-1">
                  <p className="truncate font-medium text-foreground">
                    {p.name_ar || p.name}
                  </p>
                  <p className="text-caption inline-flex items-center gap-1.5">
                    <Calendar className="h-3.5 w-3.5" />
                    {new Date(p.start_date).toLocaleDateString('ar-SA')} →{' '}
                    {new Date(p.end_date).toLocaleDateString('ar-SA')}
                  </p>
                </div>
                <Badge variant={STATUS_VARIANT[p.status]}>{STATUS_LABEL[p.status]}</Badge>
              </div>
              <div className="mt-3 flex flex-wrap gap-1">
                {p.channel_types.map((c) => (
                  <Badge key={c} variant="outline" className="font-normal">
                    {c}
                  </Badge>
                ))}
              </div>
              {(p.trade_spend != null || p.expected_roi != null) && (
                <div className="mt-3 flex gap-4 text-caption">
                  {p.trade_spend != null && (
                    <span>
                      إنفاق:{' '}
                      <span className="font-medium text-foreground">
                        {formatCurrency(p.trade_spend)}
                      </span>
                    </span>
                  )}
                  {p.expected_roi != null && (
                    <span>
                      ROI متوقع:{' '}
                      <span className="font-medium text-foreground">
                        {p.expected_roi}%
                      </span>
                    </span>
                  )}
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
