import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  ChevronRight,
  ChevronLeft,
  Loader2,
  Check,
  Plus,
  Trash2,
  AlertTriangle,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { PageHeader } from '@/components/shared/PageHeader';
import { VisitTypePicker } from '@/components/visit/VisitTypePicker';
import { VisitReasonsPicker } from '@/components/visit/VisitReasonsPicker';
import { GPSCapture } from '@/components/visit/GPSCapture';
import { PhotoCapture } from '@/components/visit/PhotoCapture';
import {
  enhancedVisitWizardSchema,
  type EnhancedVisitWizardValues,
  type CompetitorEntryValues,
  type VisitIssueValues,
  type ActionPlanEntryValues,
} from '@/lib/schemas';
import { useCustomers } from '@/hooks/useCustomers';
import { useCreateVisit, useVisitReasons } from '@/hooks/useVisits';
import { useAuthStore } from '@/stores/authStore';
import type { Customer, VisitType } from '@/lib/types';
import { cn } from '@/lib/utils';
import { supabase } from '@/lib/supabase';

const GPS_VALID_RADIUS_METERS = 150;

const STEPS = [
  { key: 'customer', label: 'العميل' },
  { key: 'location', label: 'الموقع والأسباب' },
  { key: 'photos', label: 'الصور والملاحظات' },
  { key: 'competitor', label: 'المنافسين' },
  { key: 'issues', label: 'المشكلات والإجراءات' },
  { key: 'summary', label: 'الملخص' },
] as const;

function haversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function EnhancedVisitWizardPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const prefilledCustomerId = params.get('customerId') ?? '';

  const userId = useAuthStore((s) => s.profile?.id);
  const customersQ = useCustomers(userId);
  const reasonsQ = useVisitReasons();
  const mutation = useCreateVisit();

  const [step, setStep] = useState(0);
  const [photos, setPhotos] = useState<File[]>([]);
  const [competitorPhotos, setCompetitorPhotos] = useState<Record<number, File[]>>({});
  const [customerSearch, setCustomerSearch] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const form = useForm<EnhancedVisitWizardValues>({
    resolver: zodResolver(enhancedVisitWizardSchema),
    mode: 'onChange',
    defaultValues: {
      customerId: prefilledCustomerId,
      visitType: 'office',
      visitObjective: '',
      gps: null,
      gpsOutOfRange: false,
      outOfRangeReason: '',
      reasonIds: [],
      photoCount: 0,
      notes: '',
      marketObservation: '',
      competitors: [],
      issues: [],
      actionPlans: [],
    },
  });

  const { watch, setValue, handleSubmit } = form;
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

  const selectedCustomer = customersQ.data?.find(
    (c) => c.id === values.customerId,
  );

  const gpsDistance = useMemo(() => {
    if (!values.gps || !selectedCustomer?.latitude || !selectedCustomer?.longitude)
      return null;
    return haversineDistance(
      values.gps.latitude,
      values.gps.longitude,
      selectedCustomer.latitude,
      selectedCustomer.longitude,
    );
  }, [values.gps, selectedCustomer]);

  const isOutOfRange = gpsDistance !== null && gpsDistance > GPS_VALID_RADIUS_METERS;

  useEffect(() => {
    if (isOutOfRange !== values.gpsOutOfRange) {
      setValue('gpsOutOfRange', isOutOfRange);
    }
  }, [isOutOfRange, values.gpsOutOfRange, setValue]);

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
      if (isOutOfRange && !values.outOfRangeReason.trim()) {
        toast.error('أدخل سبب الزيارة من خارج النطاق');
        return;
      }
    }
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  }

  function prevStep() {
    setStep((s) => Math.max(s - 1, 0));
  }

  function addCompetitor() {
    const current = values.competitors ?? [];
    setValue('competitors', [
      ...current,
      {
        competitor_name: '',
        competitor_products: '',
        competitor_promotions: '',
        competitor_pricing: '',
        notes: '',
      },
    ]);
  }

  function removeCompetitor(idx: number) {
    const current = values.competitors ?? [];
    setValue(
      'competitors',
      current.filter((_, i) => i !== idx),
    );
    const cp = { ...competitorPhotos };
    delete cp[idx];
    setCompetitorPhotos(cp);
  }

  function updateCompetitor(
    idx: number,
    field: keyof CompetitorEntryValues,
    val: string,
  ) {
    const current = [...(values.competitors ?? [])];
    current[idx] = { ...current[idx], [field]: val };
    setValue('competitors', current);
  }

  function addIssue() {
    const current = values.issues ?? [];
    setValue('issues', [
      ...current,
      { issue_type: 'pricing' as const, description: '', severity: 'medium' as const },
    ]);
  }

  function removeIssue(idx: number) {
    const current = values.issues ?? [];
    setValue(
      'issues',
      current.filter((_, i) => i !== idx),
    );
  }

  function updateIssue(
    idx: number,
    field: keyof VisitIssueValues,
    val: string,
  ) {
    const current = [...(values.issues ?? [])];
    current[idx] = { ...current[idx], [field]: val } as VisitIssueValues;
    setValue('issues', current);
  }

  function addActionPlan() {
    const current = values.actionPlans ?? [];
    setValue('actionPlans', [
      ...current,
      {
        action_description: '',
        responsible_person: '',
        due_date: '',
        priority: 'medium' as const,
      },
    ]);
  }

  function removeActionPlan(idx: number) {
    const current = values.actionPlans ?? [];
    setValue(
      'actionPlans',
      current.filter((_, i) => i !== idx),
    );
  }

  function updateActionPlan(
    idx: number,
    field: keyof ActionPlanEntryValues,
    val: string,
  ) {
    const current = [...(values.actionPlans ?? [])];
    current[idx] = { ...current[idx], [field]: val } as ActionPlanEntryValues;
    setValue('actionPlans', current);
  }

  async function onSubmit(data: EnhancedVisitWizardValues) {
    if (!userId) {
      toast.error('انتهت الجلسة، أعد تسجيل الدخول');
      return;
    }
    setSubmitting(true);
    try {
      const result = await mutation.mutateAsync({
        values: {
          customerId: data.customerId,
          visitType: data.visitType,
          gps: data.gps,
          reasonIds: data.reasonIds,
          photoCount: data.photoCount,
          notes: data.notes,
        },
        photos,
        userId,
      });

      const visitId = result.visitId;

      if (data.gpsOutOfRange && data.outOfRangeReason) {
        await supabase.from('visits').update({
          status: 'out_of_range',
          notes: `${data.notes || ''}\n[خارج النطاق] ${data.outOfRangeReason}`.trim(),
        }).eq('id', visitId);
      }

      if (data.competitors && data.competitors.length > 0) {
        for (let i = 0; i < data.competitors.length; i++) {
          const comp = data.competitors[i];
          if (!comp.competitor_name.trim()) continue;

          const { data: cr, error: crErr } = await supabase
            .from('competitor_reports')
            .insert({
              visit_id: visitId,
              competitor_name: comp.competitor_name,
              competitor_products: comp.competitor_products || null,
              competitor_promotions: comp.competitor_promotions || null,
              competitor_pricing: comp.competitor_pricing || null,
              notes: comp.notes || null,
            })
            .select('id')
            .single();

          if (crErr) {
            console.warn('competitor report insert failed', crErr);
            continue;
          }

          const cPhotos = competitorPhotos[i] ?? [];
          for (const photo of cPhotos) {
            const ext = photo.name.split('.').pop() ?? 'jpg';
            const path = `${visitId}/${crypto.randomUUID()}.${ext}`;
            const { error: upErr } = await supabase.storage
              .from('competitor-photos')
              .upload(path, photo, { contentType: photo.type, upsert: false });
            if (upErr) {
              console.warn('competitor photo upload failed', upErr);
              continue;
            }
            const { data: pub } = supabase.storage
              .from('competitor-photos')
              .getPublicUrl(path);
            await supabase.from('competitor_photos').insert({
              competitor_report_id: cr.id,
              photo_url: pub.publicUrl,
            });
          }
        }
      }

      if (data.issues && data.issues.length > 0) {
        const issueRows = data.issues
          .filter((i) => i.description.trim())
          .map((i) => ({
            visit_id: visitId,
            issue_type: i.issue_type,
            description: i.description,
            severity: i.severity,
          }));
        if (issueRows.length > 0) {
          const { error: issErr } = await supabase
            .from('visit_issues')
            .insert(issueRows);
          if (issErr) console.warn('visit issues insert failed', issErr);
        }
      }

      if (data.actionPlans && data.actionPlans.length > 0) {
        const apRows = data.actionPlans
          .filter((a) => a.action_description.trim())
          .map((a) => ({
            visit_id: visitId,
            customer_id: data.customerId,
            action_description: a.action_description,
            responsible_person: a.responsible_person || null,
            due_date: a.due_date || null,
            priority: a.priority,
            status: 'open' as const,
            created_by: userId,
          }));
        if (apRows.length > 0) {
          const { error: apErr } = await supabase
            .from('action_plans')
            .insert(apRows);
          if (apErr) console.warn('action plans insert failed', apErr);
        }
      }

      toast.success('تم تسجيل الزيارة بنجاح', {
        description: result.uploadedPhotos
          ? `${result.uploadedPhotos} صورة مرفوعة`
          : undefined,
      });
      navigate('/supervisor/visits', { replace: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'تعذّر تسجيل الزيارة';
      toast.error('فشل التسجيل', { description: msg });
    } finally {
      setSubmitting(false);
    }
  }

  const progress = ((step + 1) / STEPS.length) * 100;

  return (
    <div className="space-y-6">
      <PageHeader
        title="زيارة جديدة"
        description={`الخطوة ${step + 1} من ${STEPS.length} · ${STEPS[step].label}`}
        back={
          selectedCustomer
            ? `/supervisor/customers/${selectedCustomer.id}`
            : '/supervisor'
        }
      />

      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2 text-caption">
          {STEPS.map((s, i) => (
            <span
              key={s.key}
              className={cn(
                'flex items-center gap-1',
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
              <span className="hidden sm:inline">{s.label}</span>
            </span>
          ))}
        </div>
        <Progress value={progress} />
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        {/* Step 0: Customer & Visit Type */}
        {step === 0 && (
          <Card className="space-y-5 p-5">
            <div className="space-y-2">
              <Label>العميل</Label>
              {prefilledCustomerId && selectedCustomer ? (
                <SelectedCustomerCard customer={selectedCustomer} />
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
            </div>

            <div className="space-y-2">
              <Label>نوع الزيارة</Label>
              <VisitTypePicker
                value={values.visitType}
                onChange={(v: VisitType) =>
                  setValue('visitType', v, { shouldValidate: true })
                }
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="visitObjective">هدف الزيارة (اختياري)</Label>
              <Textarea
                id="visitObjective"
                rows={2}
                placeholder="ما هدف هذه الزيارة؟"
                {...form.register('visitObjective')}
              />
            </div>
          </Card>
        )}

        {/* Step 1: GPS + Reasons */}
        {step === 1 && (
          <Card className="space-y-5 p-5">
            <div className="space-y-2">
              <Label>الموقع الحالي</Label>
              <GPSCapture
                value={values.gps}
                onChange={(g) => setValue('gps', g, { shouldValidate: true })}
              />

              {isOutOfRange && (
                <div className="mt-3 space-y-3 rounded-lg border border-warning/50 bg-warning/10 p-4">
                  <div className="flex items-start gap-2 text-warning">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    <div>
                      <p className="text-sm font-medium">خارج النطاق المسموح</p>
                      <p className="text-xs">
                        المسافة: {Math.round(gpsDistance!)}م (الحد: {GPS_VALID_RADIUS_METERS}م)
                      </p>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="outOfRangeReason" className="text-xs">
                      سبب الزيارة من خارج النطاق *
                    </Label>
                    <Textarea
                      id="outOfRangeReason"
                      rows={2}
                      placeholder="اذكر سبب زيارتك من خارج النطاق..."
                      {...form.register('outOfRangeReason')}
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label>سبب الزيارة (يمكن اختيار أكثر من سبب)</Label>
              <VisitReasonsPicker
                reasons={reasonsQ.data}
                loading={reasonsQ.isLoading}
                selected={values.reasonIds}
                onChange={(ids) =>
                  setValue('reasonIds', ids, { shouldValidate: true })
                }
              />
            </div>
          </Card>
        )}

        {/* Step 2: Photos & Notes */}
        {step === 2 && (
          <Card className="space-y-5 p-5">
            <div className="space-y-2">
              <Label>صور الزيارة</Label>
              <PhotoCapture files={photos} onChange={setPhotos} max={10} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">ملاحظات (اختياري)</Label>
              <Textarea
                id="notes"
                rows={3}
                placeholder="ملاحظات عن الزيارة، الطلب، اعتراضات العميل..."
                {...form.register('notes')}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="marketObservation">ملاحظات السوق (اختياري)</Label>
              <Textarea
                id="marketObservation"
                rows={3}
                placeholder="ملاحظات عامة عن السوق، الأسعار، العروض..."
                {...form.register('marketObservation')}
              />
            </div>
          </Card>
        )}

        {/* Step 3: Competitor Tracking */}
        {step === 3 && (
          <div className="space-y-4">
            <Card className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-medium text-foreground">
                    تقارير المنافسين
                  </h3>
                  <p className="text-caption">
                    سجّل أنشطة المنافسين في الموقع
                  </p>
                </div>
                <Button type="button" size="sm" onClick={addCompetitor}>
                  <Plus className="h-4 w-4" />
                  إضافة
                </Button>
              </div>
            </Card>

            {(values.competitors ?? []).length === 0 && (
              <Card className="p-8 text-center">
                <p className="text-caption">لا توجد تقارير منافسين. اضغط إضافة لتسجيل نشاط منافس.</p>
              </Card>
            )}

            {(values.competitors ?? []).map((comp, idx) => (
              <Card key={idx} className="space-y-4 p-5">
                <div className="flex items-center justify-between">
                  <Badge variant="outline">منافس {idx + 1}</Badge>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => removeCompetitor(idx)}
                    className="text-destructive hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>

                <div className="space-y-2">
                  <Label>اسم المنافس *</Label>
                  <Input
                    value={comp.competitor_name}
                    onChange={(e) =>
                      updateCompetitor(idx, 'competitor_name', e.target.value)
                    }
                    placeholder="اسم الشركة المنافسة"
                  />
                </div>

                <div className="space-y-2">
                  <Label>منتجات المنافس</Label>
                  <Input
                    value={comp.competitor_products}
                    onChange={(e) =>
                      updateCompetitor(idx, 'competitor_products', e.target.value)
                    }
                    placeholder="المنتجات المتوفرة"
                  />
                </div>

                <div className="space-y-2">
                  <Label>عروض المنافس</Label>
                  <Input
                    value={comp.competitor_promotions}
                    onChange={(e) =>
                      updateCompetitor(idx, 'competitor_promotions', e.target.value)
                    }
                    placeholder="العروض الترويجية"
                  />
                </div>

                <div className="space-y-2">
                  <Label>أسعار المنافس</Label>
                  <Input
                    value={comp.competitor_pricing}
                    onChange={(e) =>
                      updateCompetitor(idx, 'competitor_pricing', e.target.value)
                    }
                    placeholder="ملاحظات عن الأسعار"
                  />
                </div>

                <div className="space-y-2">
                  <Label>صور المنافس</Label>
                  <PhotoCapture
                    files={competitorPhotos[idx] ?? []}
                    onChange={(files) =>
                      setCompetitorPhotos((prev) => ({ ...prev, [idx]: files }))
                    }
                    max={3}
                  />
                </div>

                <div className="space-y-2">
                  <Label>ملاحظات</Label>
                  <Textarea
                    value={comp.notes}
                    onChange={(e) =>
                      updateCompetitor(idx, 'notes', e.target.value)
                    }
                    rows={2}
                    placeholder="ملاحظات إضافية"
                  />
                </div>
              </Card>
            ))}
          </div>
        )}

        {/* Step 4: Issues & Action Plans */}
        {step === 4 && (
          <div className="space-y-6">
            {/* Issues Section */}
            <div className="space-y-4">
              <Card className="p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-medium text-foreground">
                      المشكلات والملاحظات
                    </h3>
                    <p className="text-caption">
                      مشكلات الأسعار، العرض، التوزيع
                    </p>
                  </div>
                  <Button type="button" size="sm" onClick={addIssue}>
                    <Plus className="h-4 w-4" />
                    إضافة
                  </Button>
                </div>
              </Card>

              {(values.issues ?? []).map((issue, idx) => (
                <Card key={idx} className="space-y-3 p-4">
                  <div className="flex items-center justify-between">
                    <Badge variant="outline">مشكلة {idx + 1}</Badge>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => removeIssue(idx)}
                      className="text-destructive hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs">نوع المشكلة *</Label>
                      <select
                        value={issue.issue_type}
                        onChange={(e) =>
                          updateIssue(idx, 'issue_type', e.target.value)
                        }
                        className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                      >
                        <option value="pricing">تسعير</option>
                        <option value="display">عرض</option>
                        <option value="visibility">ظهور</option>
                        <option value="distribution">توزيع</option>
                        <option value="other">أخرى</option>
                      </select>
                    </div>

                    <div className="space-y-1">
                      <Label className="text-xs">الخطورة</Label>
                      <select
                        value={issue.severity}
                        onChange={(e) =>
                          updateIssue(idx, 'severity', e.target.value)
                        }
                        className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                      >
                        <option value="low">منخفض</option>
                        <option value="medium">متوسط</option>
                        <option value="high">مرتفع</option>
                      </select>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs">الوصف *</Label>
                    <Textarea
                      value={issue.description}
                      onChange={(e) =>
                        updateIssue(idx, 'description', e.target.value)
                      }
                      rows={2}
                      placeholder="وصف المشكلة..."
                    />
                  </div>
                </Card>
              ))}
            </div>

            {/* Action Plans Section */}
            <div className="space-y-4">
              <Card className="p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-medium text-foreground">
                      خطط العمل
                    </h3>
                    <p className="text-caption">
                      الإجراءات المطلوبة والمسؤولين
                    </p>
                  </div>
                  <Button type="button" size="sm" onClick={addActionPlan}>
                    <Plus className="h-4 w-4" />
                    إضافة
                  </Button>
                </div>
              </Card>

              {(values.actionPlans ?? []).map((ap, idx) => (
                <Card key={idx} className="space-y-3 p-4">
                  <div className="flex items-center justify-between">
                    <Badge variant="outline">إجراء {idx + 1}</Badge>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => removeActionPlan(idx)}
                      className="text-destructive hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs">الإجراء المطلوب *</Label>
                    <Textarea
                      value={ap.action_description}
                      onChange={(e) =>
                        updateActionPlan(idx, 'action_description', e.target.value)
                      }
                      rows={2}
                      placeholder="وصف الإجراء المطلوب..."
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs">المسؤول</Label>
                      <Input
                        value={ap.responsible_person}
                        onChange={(e) =>
                          updateActionPlan(idx, 'responsible_person', e.target.value)
                        }
                        placeholder="اسم المسؤول"
                      />
                    </div>

                    <div className="space-y-1">
                      <Label className="text-xs">تاريخ الاستحقاق</Label>
                      <Input
                        type="date"
                        value={ap.due_date}
                        onChange={(e) =>
                          updateActionPlan(idx, 'due_date', e.target.value)
                        }
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs">الأولوية</Label>
                    <select
                      value={ap.priority}
                      onChange={(e) =>
                        updateActionPlan(idx, 'priority', e.target.value)
                      }
                      className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                    >
                      <option value="low">منخفض</option>
                      <option value="medium">متوسط</option>
                      <option value="high">مرتفع</option>
                      <option value="critical">حرج</option>
                    </select>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        )}

        {/* Step 5: Summary */}
        {step === 5 && (
          <Card className="space-y-5 p-5">
            <h3 className="text-sm font-medium text-foreground">ملخص الزيارة</h3>

            <div className="rounded-lg border border-border bg-muted/30 p-4 text-sm">
              <dl className="space-y-2 text-muted-foreground">
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
                {isOutOfRange && (
                  <SummaryRow
                    label="حالة الموقع"
                    value={`خارج النطاق (${Math.round(gpsDistance!)}م)`}
                    warning
                  />
                )}
                <SummaryRow label="الأسباب" value={`${values.reasonIds.length}`} />
                <SummaryRow label="الصور" value={`${photos.length}`} />
                {values.competitors && values.competitors.length > 0 && (
                  <SummaryRow
                    label="المنافسين"
                    value={`${values.competitors.length}`}
                  />
                )}
                {values.issues && values.issues.length > 0 && (
                  <SummaryRow
                    label="المشكلات"
                    value={`${values.issues.length}`}
                  />
                )}
                {values.actionPlans && values.actionPlans.length > 0 && (
                  <SummaryRow
                    label="خطط العمل"
                    value={`${values.actionPlans.length}`}
                  />
                )}
              </dl>
            </div>

            {values.notes && (
              <div className="rounded-lg border border-border p-3">
                <p className="text-xs font-medium text-muted-foreground">الملاحظات</p>
                <p className="mt-1 text-sm">{values.notes}</p>
              </div>
            )}
          </Card>
        )}

        {/* Navigation */}
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
            <Button type="submit" disabled={submitting}>
              {submitting ? (
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

function SelectedCustomerCard({ customer }: { customer: Customer }) {
  return (
    <div className="rounded-lg border border-primary/30 bg-primary/5 p-3">
      <p className="text-sm font-medium text-foreground">
        {customer.customer_name_ar || customer.customer_name}
      </p>
      <p className="text-caption">
        {customer.customer_code} · {customer.channel_type} · {customer.region}
      </p>
    </div>
  );
}

function SummaryRow({
  label,
  value,
  warning,
}: {
  label: string;
  value: string;
  warning?: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <dt>{label}</dt>
      <dd className={cn('font-medium', warning ? 'text-warning' : 'text-foreground')}>
        {value}
      </dd>
    </div>
  );
}

function visitTypeLabel(t: string) {
  const map: Record<string, string> = {
    office: 'مكتب',
    branch: 'فرع',
    cashvan: 'كاش فان',
  };
  return map[t] ?? t;
}
