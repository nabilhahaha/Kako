import { useState } from 'react';
import { CheckCircle2, ClipboardList, Loader2, Calendar, User } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/shared/EmptyState';
import { SkeletonRow } from '@/components/shared/SkeletonCard';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import {
  useActionPlans,
  useCompleteActionPlan,
  type ActionPlanRow,
} from '@/hooks/useActionPlans';
import type { ActionPriority, ActionStatus } from '@/lib/types';

/* ── Arabic labels ── */

const STATUS_LABELS: Record<ActionStatus, string> = {
  open: 'مفتوح',
  in_progress: 'قيد التنفيذ',
  completed: 'مكتمل',
  cancelled: 'ملغى',
};

const PRIORITY_LABELS: Record<ActionPriority, string> = {
  low: 'منخفض',
  medium: 'متوسط',
  high: 'مرتفع',
  critical: 'حرج',
};

const PRIORITY_VARIANT: Record<ActionPriority, 'success' | 'warning' | 'info' | 'destructive'> = {
  low: 'success',
  medium: 'warning',
  high: 'info',
  critical: 'destructive',
};

const STATUS_VARIANT: Record<ActionStatus, 'secondary' | 'info' | 'success' | 'outline'> = {
  open: 'secondary',
  in_progress: 'info',
  completed: 'success',
  cancelled: 'outline',
};

/* ── Helpers ── */

function isOverdue(plan: ActionPlanRow): boolean {
  if (!plan.due_date || plan.status === 'completed' || plan.status === 'cancelled') return false;
  return new Date(plan.due_date) < new Date();
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('ar-SA', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(new Date(iso));
}

/* ── Filter options ── */

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'الكل' },
  { value: 'open', label: 'مفتوح' },
  { value: 'in_progress', label: 'قيد التنفيذ' },
  { value: 'completed', label: 'مكتمل' },
  { value: 'cancelled', label: 'ملغى' },
];

const PRIORITY_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'الكل' },
  { value: 'low', label: 'منخفض' },
  { value: 'medium', label: 'متوسط' },
  { value: 'high', label: 'مرتفع' },
  { value: 'critical', label: 'حرج' },
];

/* ── Component ── */

export function ActionPlansPage() {
  const [statusFilter, setStatusFilter] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');
  const [completeTarget, setCompleteTarget] = useState<ActionPlanRow | null>(null);

  const filters = {
    status: statusFilter || undefined,
    priority: priorityFilter || undefined,
  };

  const { data: plans, isLoading, isError, refetch } = useActionPlans(filters);
  const completeMutation = useCompleteActionPlan();

  async function handleComplete() {
    if (!completeTarget) return;
    try {
      await completeMutation.mutateAsync(completeTarget.id);
      toast.success('تم إكمال خطة العمل');
    } catch (err) {
      toast.error('فشل تحديث الحالة', {
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setCompleteTarget(null);
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="خطط العمل"
        description="إدارة ومتابعة خطط العمل لجميع العملاء"
        back="/admin"
      />

      {/* Filter bar */}
      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">الحالة</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="flex h-9 w-36 rounded-lg border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">الأولوية</label>
            <select
              value={priorityFilter}
              onChange={(e) => setPriorityFilter(e.target.value)}
              className="flex h-9 w-36 rounded-lg border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {PRIORITY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </Card>

      {/* Content */}
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <SkeletonRow key={i} />
          ))}
        </div>
      ) : isError ? (
        <Card className="p-5">
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <p className="text-sm text-destructive">حدث خطأ أثناء تحميل البيانات</p>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              أعد المحاولة
            </Button>
          </div>
        </Card>
      ) : !plans || plans.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title="لا توجد خطط عمل"
          description="لم يتم العثور على خطط عمل تطابق معايير البحث"
        />
      ) : (
        <div className="space-y-3">
          {plans.map((plan) => (
            <Card key={plan.id} className="p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex-1 space-y-2">
                  {/* Action description */}
                  <p className="text-sm font-medium text-foreground leading-relaxed">
                    {plan.action_description}
                  </p>

                  {/* Metadata row */}
                  <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                    {plan.customer_name && (
                      <span className="inline-flex items-center gap-1">
                        <User className="h-3 w-3" />
                        {plan.customer_name}
                      </span>
                    )}
                    {plan.responsible_person && (
                      <span>المسؤول: {plan.responsible_person}</span>
                    )}
                    <span
                      className={`inline-flex items-center gap-1 ${
                        isOverdue(plan) ? 'font-semibold text-destructive' : ''
                      }`}
                    >
                      <Calendar className="h-3 w-3" />
                      تاريخ الاستحقاق: {formatDate(plan.due_date)}
                      {isOverdue(plan) && ' (متأخر)'}
                    </span>
                  </div>

                  {/* Badges */}
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={PRIORITY_VARIANT[plan.priority]}>
                      الأولوية: {PRIORITY_LABELS[plan.priority]}
                    </Badge>
                    <Badge variant={STATUS_VARIANT[plan.status]}>
                      {STATUS_LABELS[plan.status]}
                    </Badge>
                  </div>
                </div>

                {/* Action buttons */}
                {plan.status !== 'completed' && plan.status !== 'cancelled' && (
                  <div className="flex shrink-0 gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setCompleteTarget(plan)}
                      disabled={completeMutation.isPending}
                    >
                      {completeMutation.isPending ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <CheckCircle2 className="h-3.5 w-3.5" />
                      )}
                      إكمال
                    </Button>
                  </div>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Confirm complete dialog */}
      <ConfirmDialog
        open={completeTarget !== null}
        onOpenChange={(o) => !o && setCompleteTarget(null)}
        title="إكمال خطة العمل؟"
        description={`سيتم تعيين الحالة إلى "مكتمل" لهذه الخطة: "${completeTarget?.action_description ?? ''}"`}
        confirmLabel="إكمال"
        onConfirm={handleComplete}
      />
    </div>
  );
}
