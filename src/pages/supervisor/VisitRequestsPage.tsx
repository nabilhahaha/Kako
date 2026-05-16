import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { FileText, Loader2, Plus } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { arSA } from 'date-fns/locale';
import { toast } from 'sonner';
import { PageHeader } from '@/components/shared/PageHeader';
import { ErrorState } from '@/components/shared/ErrorState';
import { EmptyState } from '@/components/shared/EmptyState';
import { SkeletonRow } from '@/components/shared/SkeletonCard';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useTeamReps } from '@/hooks/useTeam';
import { useCustomers } from '@/hooks/useCustomers';
import { useVisitRequests, useCreateVisitRequest } from '@/hooks/useVisitRequests';
import { useAuthStore } from '@/stores/authStore';
import { visitRequestSchema, type VisitRequestValues } from '@/lib/schemas';

const STATUS_LABELS: Record<string, string> = {
  pending: 'قيد التنفيذ',
  completed: 'مكتمل',
  cancelled: 'ملغى',
};

const STATUS_VARIANTS: Record<string, 'warning' | 'success' | 'secondary'> = {
  pending: 'warning',
  completed: 'success',
  cancelled: 'secondary',
};

export function VisitRequestsPage() {
  const supervisorId = useAuthStore((s) => s.profile?.id);
  const reqsQ = useVisitRequests(supervisorId);
  const repsQ = useTeamReps(supervisorId);
  const customersQ = useCustomers(supervisorId);
  const create = useCreateVisitRequest();

  const [showForm, setShowForm] = useState(false);

  const repName = useMemo(() => {
    const m = new Map<string, string>();
    (repsQ.data ?? []).forEach((r) => m.set(r.id, r.full_name ?? r.email ?? '—'));
    return m;
  }, [repsQ.data]);

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
  } = useForm<VisitRequestValues>({
    resolver: zodResolver(visitRequestSchema),
    defaultValues: { assignedTo: '', customerId: '', dueDate: '', notes: '' },
  });

  async function onSubmit(values: VisitRequestValues) {
    if (!supervisorId) return;
    try {
      await create.mutateAsync({ values, supervisorId });
      toast.success('تم إرسال الطلب');
      reset();
      setShowForm(false);
    } catch (err) {
      toast.error('فشل الإرسال', {
        description: err instanceof Error ? err.message : undefined,
      });
    }
  }

  const today = new Date().toISOString().slice(0, 10);
  const assignedTo = watch('assignedTo');
  const customerId = watch('customerId');

  return (
    <div className="space-y-5">
      <PageHeader
        title="طلبات الزيارة"
        description="عيّن زيارات محددة للمندوبين"
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
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="rep">المندوب</Label>
                <select
                  id="rep"
                  value={assignedTo}
                  onChange={(e) =>
                    setValue('assignedTo', e.target.value, { shouldValidate: true })
                  }
                  className="flex h-11 w-full rounded-lg border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <option value="">— اختر —</option>
                  {repsQ.data?.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.full_name ?? r.email}
                    </option>
                  ))}
                </select>
                {errors.assignedTo && (
                  <p className="text-caption text-destructive">{errors.assignedTo.message}</p>
                )}
              </div>

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
                <Label htmlFor="due">التاريخ المستهدف</Label>
                <Input id="due" type="date" min={today} {...register('dueDate')} />
                {errors.dueDate && (
                  <p className="text-caption text-destructive">{errors.dueDate.message}</p>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">ملاحظات</Label>
              <Textarea
                id="notes"
                rows={3}
                placeholder="السياق، التركيز، الأولوية..."
                {...register('notes')}
              />
            </div>

            <div className="flex gap-2">
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4" />
                )}
                إرسال الطلب
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
          icon={FileText}
          title="لا توجد طلبات بعد"
          description="أنشئ طلبًا جديدًا لتعيين زيارة لمندوب."
          actionLabel="طلب جديد"
          onAction={() => setShowForm(true)}
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {reqsQ.data.map((r) => (
            <Card key={r.id} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <p className="font-medium text-foreground">
                    {customerName.get(r.customer_id) ?? '—'}
                  </p>
                  <p className="text-caption">
                    إلى {repName.get(r.assigned_to) ?? '—'}
                    {' · '}
                    {r.due_date && (
                      <>
                        موعد:{' '}
                        {new Date(r.due_date).toLocaleDateString('ar-SA')} ·{' '}
                      </>
                    )}
                    {formatDistanceToNow(new Date(r.created_at), {
                      addSuffix: true,
                      locale: arSA,
                    })}
                  </p>
                </div>
                <Badge variant={STATUS_VARIANTS[r.status ?? 'pending'] ?? 'secondary'}>
                  {STATUS_LABELS[r.status ?? 'pending'] ?? r.status}
                </Badge>
              </div>
              {r.notes && (
                <p className="mt-3 text-sm text-muted-foreground line-clamp-3">{r.notes}</p>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
