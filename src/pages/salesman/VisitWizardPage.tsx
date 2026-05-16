import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ChevronRight, ChevronLeft, Loader2, Check } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/shared/PageHeader';
import { VisitTypePicker } from '@/components/visit/VisitTypePicker';
import { VisitReasonsPicker } from '@/components/visit/VisitReasonsPicker';
import { GPSCapture } from '@/components/visit/GPSCapture';
import { PhotoCapture } from '@/components/visit/PhotoCapture';
import { visitWizardSchema, type VisitWizardValues } from '@/lib/schemas';
import { useCustomers } from '@/hooks/useCustomers';
import { useCreateVisit, useVisitReasons } from '@/hooks/useVisits';
import { useAuthStore } from '@/stores/authStore';
import type { VisitType } from '@/lib/types';
import { cn } from '@/lib/utils';

const STEPS = [
  { key: 'who', label: 'العميل' },
  { key: 'where', label: 'الموقع والأسباب' },
  { key: 'what', label: 'الصور والملاحظات' },
] as const;

export function VisitWizardPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const prefilledCustomerId = params.get('customerId') ?? '';

  const userId = useAuthStore((s) => s.profile?.id);
  const customersQ = useCustomers(userId);
  const reasonsQ = useVisitReasons();
  const mutation = useCreateVisit();

  const [step, setStep] = useState(0);
  const [photos, setPhotos] = useState<File[]>([]);
  const [customerSearch, setCustomerSearch] = useState('');

  const form = useForm<VisitWizardValues>({
    resolver: zodResolver(visitWizardSchema),
    mode: 'onChange',
    defaultValues: {
      customerId: prefilledCustomerId,
      visitType: 'office',
      gps: null,
      reasonIds: [],
      photoCount: 0,
      notes: '',
    },
  });

  const { watch, setValue, handleSubmit, formState } = form;
  const values = watch();

  useEffect(() => {
    setValue('photoCount', photos.length, { shouldValidate: false });
  }, [photos.length, setValue]);

  const filteredCustomers = useMemo(() => {
    const q = customerSearch.trim().toLowerCase();
    const list = customersQ.data ?? [];
    if (!q) return list.slice(0, 50);
    return list
      .filter((c) =>
        [c.customer_name, c.customer_name_ar, c.customer_code]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .includes(q),
      )
      .slice(0, 50);
  }, [customersQ.data, customerSearch]);

  const selectedCustomer = customersQ.data?.find((c) => c.id === values.customerId);

  function nextStep() {
    if (step === 0) {
      if (!values.customerId) {
        toast.error('اختر العميل أولاً');
        return;
      }
      if (!values.visitType) {
        toast.error('اختر نوع الزيارة');
        return;
      }
    }
    if (step === 1) {
      if (!values.gps) {
        toast.error('سجّل الموقع قبل المتابعة');
        return;
      }
      if (values.reasonIds.length === 0) {
        toast.error('اختر سبب الزيارة');
        return;
      }
    }
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  }

  function prevStep() {
    setStep((s) => Math.max(s - 1, 0));
  }

  async function onSubmit(data: VisitWizardValues) {
    if (!userId) {
      toast.error('انتهت الجلسة، أعد تسجيل الدخول');
      return;
    }
    try {
      const result = await mutation.mutateAsync({
        values: data,
        photos,
        userId,
      });
      toast.success('تم تسجيل الزيارة', {
        description: result.uploadedPhotos
          ? `${result.uploadedPhotos} صورة مرفوعة`
          : undefined,
      });
      navigate('/salesman/visits', { replace: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'تعذّر تسجيل الزيارة';
      toast.error('فشل التسجيل', { description: msg });
    }
  }

  const progress = ((step + 1) / STEPS.length) * 100;

  return (
    <div className="space-y-6">
      <PageHeader
        title="زيارة جديدة"
        description={`الخطوة ${step + 1} من ${STEPS.length} · ${STEPS[step].label}`}
        back={selectedCustomer ? `/salesman/customers/${selectedCustomer.id}` : '/salesman'}
      />

      <div className="space-y-2">
        <div className="flex items-center justify-between text-caption">
          {STEPS.map((s, i) => (
            <span
              key={s.key}
              className={cn(
                'flex items-center gap-1.5',
                i <= step ? 'text-primary' : 'text-muted-foreground',
              )}
            >
              {i < step ? (
                <Check className="h-3.5 w-3.5" />
              ) : (
                <span
                  className={cn(
                    'inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold',
                    i === step
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-muted-foreground',
                  )}
                >
                  {i + 1}
                </span>
              )}
              {s.label}
            </span>
          ))}
        </div>
        <Progress value={progress} />
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        {step === 0 && (
          <Card className="space-y-5 p-5">
            <div className="space-y-2">
              <Label>العميل</Label>
              {prefilledCustomerId && selectedCustomer ? (
                <div className="rounded-lg border border-primary/30 bg-primary/5 p-3">
                  <p className="text-sm font-medium text-foreground">
                    {selectedCustomer.customer_name_ar || selectedCustomer.customer_name}
                  </p>
                  <p className="text-caption">{selectedCustomer.customer_code}</p>
                </div>
              ) : customersQ.isLoading ? (
                <Skeleton className="h-32 w-full rounded-lg" />
              ) : (
                <>
                  <Input
                    type="search"
                    placeholder="ابحث عن العميل..."
                    value={customerSearch}
                    onChange={(e) => setCustomerSearch(e.target.value)}
                  />
                  <div className="max-h-72 space-y-1.5 overflow-y-auto rounded-lg border border-border p-1.5">
                    {filteredCustomers.length === 0 ? (
                      <p className="p-4 text-center text-caption">لا توجد نتائج</p>
                    ) : (
                      filteredCustomers.map((c) => {
                        const active = c.id === values.customerId;
                        return (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() =>
                              setValue('customerId', c.id, { shouldValidate: true })
                            }
                            className={cn(
                              'flex w-full items-center justify-between rounded-md p-2.5 text-start text-sm transition-colors',
                              active
                                ? 'bg-primary/10 text-primary'
                                : 'hover:bg-accent',
                            )}
                          >
                            <span className="min-w-0 flex-1">
                              <span className="block truncate font-medium">
                                {c.customer_name_ar || c.customer_name}
                              </span>
                              <span className="block text-xs text-muted-foreground">
                                {c.customer_code} · {c.channel_type}
                              </span>
                            </span>
                            {active && <Check className="h-4 w-4" />}
                          </button>
                        );
                      })
                    )}
                  </div>
                </>
              )}
              {formState.errors.customerId && (
                <p className="text-caption text-destructive">
                  {formState.errors.customerId.message}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label>نوع الزيارة</Label>
              <VisitTypePicker
                value={values.visitType}
                onChange={(v: VisitType) =>
                  setValue('visitType', v, { shouldValidate: true })
                }
              />
              {formState.errors.visitType && (
                <p className="text-caption text-destructive">
                  {formState.errors.visitType.message}
                </p>
              )}
            </div>
          </Card>
        )}

        {step === 1 && (
          <Card className="space-y-5 p-5">
            <div className="space-y-2">
              <Label>الموقع الحالي</Label>
              <GPSCapture
                value={values.gps}
                onChange={(g) => setValue('gps', g, { shouldValidate: true })}
              />
              {formState.errors.gps && (
                <p className="text-caption text-destructive">
                  {formState.errors.gps.message as string}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label>سبب الزيارة (يمكن اختيار أكثر من سبب)</Label>
              <VisitReasonsPicker
                reasons={reasonsQ.data}
                loading={reasonsQ.isLoading}
                selected={values.reasonIds}
                onChange={(ids) => setValue('reasonIds', ids, { shouldValidate: true })}
              />
              {formState.errors.reasonIds && (
                <p className="text-caption text-destructive">
                  {formState.errors.reasonIds.message}
                </p>
              )}
            </div>
          </Card>
        )}

        {step === 2 && (
          <Card className="space-y-5 p-5">
            <div className="space-y-2">
              <Label>الصور</Label>
              <PhotoCapture files={photos} onChange={setPhotos} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">ملاحظات (اختياري)</Label>
              <Textarea
                id="notes"
                rows={4}
                placeholder="ملاحظات عن الزيارة، الطلب، اعتراضات العميل..."
                {...form.register('notes')}
              />
              {formState.errors.notes && (
                <p className="text-caption text-destructive">
                  {formState.errors.notes.message}
                </p>
              )}
            </div>

            <div className="rounded-lg border border-border bg-muted/30 p-4 text-sm">
              <p className="font-medium text-foreground">ملخص الزيارة</p>
              <dl className="mt-3 space-y-1.5 text-muted-foreground">
                <SummaryRow
                  label="العميل"
                  value={
                    selectedCustomer
                      ? selectedCustomer.customer_name_ar ||
                        selectedCustomer.customer_name ||
                        ''
                      : '—'
                  }
                />
                <SummaryRow label="النوع" value={visitTypeLabel(values.visitType)} />
                <SummaryRow
                  label="الموقع"
                  value={
                    values.gps
                      ? `${values.gps.latitude.toFixed(4)}, ${values.gps.longitude.toFixed(4)}`
                      : '—'
                  }
                />
                <SummaryRow label="الأسباب" value={`${values.reasonIds.length}`} />
                <SummaryRow label="الصور" value={`${photos.length}`} />
              </dl>
            </div>
          </Card>
        )}

        <div className="flex items-center justify-between gap-3">
          {step > 0 ? (
            <Button type="button" variant="outline" onClick={prevStep}>
              <ChevronRight className="h-4 w-4" />
              السابق
            </Button>
          ) : (
            <div />
          )}

          {step < STEPS.length - 1 ? (
            <Button type="button" onClick={nextStep}>
              التالي
              <ChevronLeft className="h-4 w-4" />
            </Button>
          ) : (
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  جاري الحفظ...
                </>
              ) : (
                <>
                  <Check className="h-4 w-4" />
                  حفظ الزيارة
                </>
              )}
            </Button>
          )}
        </div>
      </form>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <dt>{label}</dt>
      <dd className="font-medium text-foreground">{value}</dd>
    </div>
  );
}

function visitTypeLabel(t: VisitType) {
  return { office: 'مكتب', branch: 'فرع', cashvan: 'كاش فان', hybrid: 'هجين' }[t];
}
