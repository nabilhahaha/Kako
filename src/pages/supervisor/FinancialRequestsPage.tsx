import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Clock, Loader2, Plus } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { arSA } from 'date-fns/locale';
import { toast } from 'sonner';
import { PageHeader } from '@/components/shared/PageHeader';
import { ErrorState } from '@/components/shared/ErrorState';
import { EmptyState } from '@/components/shared/EmptyState';
import { SkeletonRow } from '@/components/shared/SkeletonCard';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { CountdownPill } from '@/components/supervisor/CountdownPill';
import { useCustomers } from '@/hooks/useCustomers';
import {
  useFinancialRequests,
  useCreateFinancialRequest,
} from '@/hooks/useFinancialRequests';
import { useAuthStore } from '@/stores/authStore';
import {
  financialRequestSchema,
  type FinancialRequestValues,
} from '@/lib/schemas';

export function FinancialRequestsPage() {
  const supervisorId = useAuthStore((s) => s.profile?.id);
  const reqsQ = useFinancialRequests(supervisorId);
  const customersQ = useCustomers(supervisorId);
  const create = useCreateFinancialRequest();

  const [showForm, setShowForm] = useState(false);

  const customerName = useMemo(() => {
    const m = new Map<string, string>();
    (customersQ.data ?? []).forEach((c) =>
      m.set(c.id, c.customer_name_ar || c.customer_name || c.customer_code),
    );
    return m;
  }, [customersQ.data]);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FinancialRequestValues>({
    resolver: zodResolver(financialRequestSchema),
    defaultValues: { customerId: '', ttlMinutes: 5, reason: '' },
  });

  async function onSubmit(values: FinancialRequestValues) {
    if (!supervisorId) return;
    try {
      await create.mutateAsync({ values, supervisorId });
      toast.success('تم إنشاء الطلب', {
        description: `سينتهي خلال ${values.ttlMinutes} دقيقة`,
      });
      reset();
      setShowForm(false);
    } catch (err) {
      toast.error('فشل الإنشاء', {
        description: err instanceof Error ? err.message : undefined,
      });
    }
  }

  const customerId = watch('customerId');

  return (
    <div className="space-y-5">
      <PageHeader
        title="طلبات البيانات المالية"
        description="رابط مؤقت يمنح المندوب بيانات حساسة لفترة محددة"
        back="/supervisor"
        actions={
          <Button onClick={() => setShowForm((v) => !v)}>
            <Plus className="h-4 w-4" />
            طلب جديد
          </Button>
        }
      />

      {showForm && (
        <Card className="p-5">
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="customer">العميل</Label>
              <select
                id="customer"
                value={customerId}
                onChange={(e) =>
                  setValue('customerId', e.target.value, { shouldValidate: true })
                }
                className="flex h-11 w-full rounded-lg border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="">— اختر —</option>
                {customersQ.data?.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.customer_name_ar || c.customer_name || c.customer_code}
                  </option>
                ))}
              </select>
              {errors.customerId && (
                <p className="text-caption text-destructive">{errors.customerId.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="ttl">مدة الصلاحية (دقائق)</Label>
              <Input
                id="ttl"
                type="number"
                inputMode="numeric"
                min={1}
                max={60}
                {...register('ttlMinutes', { valueAsNumber: true })}
              />
              {errors.ttlMinutes && (
                <p className="text-caption text-destructive">{errors.ttlMinutes.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="reason">سبب الطلب</Label>
              <Textarea
                id="reason"
                rows={3}
                placeholder="مثال: تأكيد رصيد العميل قبل التحصيل"
                {...register('reason')}
              />
              {errors.reason && (
                <p className="text-caption text-destructive">{errors.reason.message}</p>
              )}
            </div>

            <div className="flex gap-2">
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4" />
                )}
                إنشاء
              </Button>
              <Button type="button" variant="ghost" onClick={() => setShowForm(false)}>
                إلغاء
              </Button>
            </div>
          </form>
        </Card>
      )}

      {reqsQ.isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonRow key={i} />
          ))}
        </div>
      ) : reqsQ.isError ? (
        <ErrorState
          message={(reqsQ.error as Error)?.message}
          onRetry={() => reqsQ.refetch()}
        />
      ) : !reqsQ.data?.length ? (
        <EmptyState
          icon={Clock}
          title="لا توجد طلبات نشطة"
          description="الطلبات تظهر مع عدّاد تنازلي حتى تنتهي صلاحيتها."
          actionLabel="طلب جديد"
          onAction={() => setShowForm(true)}
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {reqsQ.data.map((r) => {
            const reason =
              r.payload && typeof r.payload === 'object'
                ? ((r.payload as { reason?: string }).reason ?? '')
                : '';
            return (
              <Card key={r.id} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 space-y-1">
                    <p className="truncate font-medium text-foreground">
                      {customerName.get(r.customer_id) ?? '—'}
                    </p>
                    <p className="text-caption">
                      {formatDistanceToNow(new Date(r.created_at), {
                        addSuffix: true,
                        locale: arSA,
                      })}
                    </p>
                  </div>
                  <CountdownPill expiresAt={r.expires_at} />
                </div>
                {reason && (
                  <p className="mt-3 text-sm text-muted-foreground line-clamp-3">
                    {reason}
                  </p>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
