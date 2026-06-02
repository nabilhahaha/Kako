'use client';

import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useI18n } from '@/lib/i18n/provider';

// Shared clinical UI for the clinic vertical (reception + doctor + full views).

export interface PatientOption { id: string; name: string; phone: string | null }

export interface ServiceOption { id: string; name: string; price: number }

/** Service picker + fee field as one unit: choosing a service fills the fee.
 *  Emits name="service_id" and name="fee". */
export function ServicePicker({ services }: { services: ServiceOption[] }) {
  const { t } = useI18n();
  const [fee, setFee] = useState('0');
  const [serviceId, setServiceId] = useState('');
  function pick(id: string) {
    setServiceId(id);
    const s = services.find((x) => x.id === id);
    if (s) setFee(String(s.price));
  }
  return (
    <>
      {services.length > 0 && (
        <div className="space-y-1">
          <Label>{t('clinic.ui.serviceLabel')}</Label>
          <select className={selectCls} value={serviceId} onChange={(e) => pick(e.target.value)}>
            <option value="">{t('clinic.ui.serviceNone')}</option>
            {services.map((s) => <option key={s.id} value={s.id}>{s.name} — {s.price}</option>)}
          </select>
          <input type="hidden" name="service_id" value={serviceId} />
        </div>
      )}
      <div className="space-y-1">
        <Label>{t('clinic.ui.visitFeeLabel')}</Label>
        <Input name="fee" type="number" min={0} step="0.01" dir="ltr" value={fee} onChange={(e) => setFee(e.target.value)} />
      </div>
    </>
  );
}

export interface DoctorOption { id: string; full_name: string | null; email: string | null }

/** Display name for a doctor id, from the company's doctor list. */
export function doctorName(doctors: DoctorOption[], id: string | null | undefined): string {
  if (!id) return '—';
  const d = doctors.find((x) => x.id === id);
  return d?.full_name || d?.email || 'Doctor';
}

export interface ClinicVisit {
  id: string;
  patient_id: string;
  doctor_id: string | null;
  visit_date: string;
  visit_type: string;
  complaint: string | null;
  diagnosis: string | null;
  prescription: string | null;
  tests: string | null;
  fee: number;
  paid_amount: number;
  status: string;
  temperature: number | null;
  blood_pressure: string | null;
  pulse: number | null;
  weight: number | null;
  height: number | null;
  followup_date: string | null;
  patient: { name: string; phone: string | null } | null;
}

export function getVisitStatusMap(t: (key: string) => string): Record<string, { label: string; variant: 'secondary' | 'info' | 'success' | 'destructive' | 'warning' }> {
  return {
    waiting: { label: t('clinic.visitStatus.waiting'), variant: 'info' },
    in_progress: { label: t('clinic.visitStatus.in_progress'), variant: 'warning' },
    done: { label: t('clinic.visitStatus.done'), variant: 'success' },
    cancelled: { label: t('clinic.visitStatus.cancelled'), variant: 'destructive' },
  };
}

export const VISIT_STATUS: Record<string, { label: string; variant: 'secondary' | 'info' | 'success' | 'destructive' | 'warning' }> = {
  waiting: { label: 'في الانتظار', variant: 'info' },
  in_progress: { label: 'جاري الكشف', variant: 'warning' },
  done: { label: 'تم', variant: 'success' },
  cancelled: { label: 'ملغي', variant: 'destructive' },
};

export const TYPE: Record<string, string> = { consultation: 'كشف', followup: 'متابعة', procedure: 'إجراء' };

/** Quick-pick templates for common lab tests / imaging, grouped. The doctor
 *  taps one and it's appended to the request field on its own line. */
export const TEST_TEMPLATES: { group: string; items: string[] }[] = [
  {
    group: 'تحاليل',
    items: [
      'صورة دم كاملة (CBC)', 'سكر صائم', 'سكر فاطر', 'سكر تراكمي (HbA1c)',
      'وظائف كبد', 'وظائف كلى', 'سرعة ترسيب (ESR)', 'CRP',
      'دهون (كوليسترول/ثلاثية)', 'وظائف الغدة الدرقية (TSH)', 'فيتامين د',
      'تحليل بول كامل', 'تحليل براز',
    ],
  },
  {
    group: 'أشعة',
    items: [
      'أشعة صدر', 'سونار بطن وحوض', 'رسم قلب (ECG)',
      'إيكو على القلب', 'أشعة مقطعية (CT)', 'رنين مغناطيسي (MRI)',
    ],
  },
];

export const selectCls =
  'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';
export const taCls = 'w-full rounded-md border border-input bg-background p-2 text-sm';

/** Vital-sign inputs, shared by the new-visit and exam forms. */
export function VitalsFields({ v }: { v?: ClinicVisit }) {
  const { t } = useI18n();
  return (
    <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
      <div className="space-y-1"><Label>{t('clinic.vitals.temperature')}</Label><Input name="temperature" type="number" step="0.1" dir="ltr" defaultValue={v?.temperature ?? ''} /></div>
      <div className="space-y-1"><Label>{t('clinic.vitals.bloodPressure')}</Label><Input name="blood_pressure" placeholder="120/80" dir="ltr" defaultValue={v?.blood_pressure ?? ''} /></div>
      <div className="space-y-1"><Label>{t('clinic.vitals.pulse')}</Label><Input name="pulse" type="number" dir="ltr" defaultValue={v?.pulse ?? ''} /></div>
      <div className="space-y-1"><Label>{t('clinic.vitals.weight')}</Label><Input name="weight" type="number" step="0.1" dir="ltr" defaultValue={v?.weight ?? ''} /></div>
      <div className="space-y-1"><Label>{t('clinic.vitals.height')}</Label><Input name="height" type="number" step="0.1" dir="ltr" defaultValue={v?.height ?? ''} /></div>
    </div>
  );
}

export function VitalsLine({ v }: { v: ClinicVisit }) {
  const has = v.temperature != null || v.blood_pressure || v.pulse != null || v.weight != null;
  if (!has) return null;
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground" dir="ltr">
      {v.temperature != null && <span>🌡 {v.temperature}°</span>}
      {v.blood_pressure && <span>🩸 {v.blood_pressure}</span>}
      {v.pulse != null && <span>💓 {v.pulse}</span>}
      {v.weight != null && <span>⚖ {v.weight}kg</span>}
    </div>
  );
}
