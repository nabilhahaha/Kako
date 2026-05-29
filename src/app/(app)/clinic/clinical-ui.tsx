'use client';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

// Shared clinical UI for the clinic vertical (reception + doctor + full views).

export interface PatientOption { id: string; name: string; phone: string | null }

export interface ClinicVisit {
  id: string;
  patient_id: string;
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

export const VISIT_STATUS: Record<string, { label: string; variant: 'secondary' | 'info' | 'success' | 'destructive' | 'warning' }> = {
  waiting: { label: 'في الانتظار', variant: 'info' },
  in_progress: { label: 'جاري الكشف', variant: 'warning' },
  done: { label: 'تم', variant: 'success' },
  cancelled: { label: 'ملغي', variant: 'destructive' },
};

export const TYPE: Record<string, string> = { consultation: 'كشف', followup: 'متابعة', procedure: 'إجراء' };

export const selectCls =
  'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';
export const taCls = 'w-full rounded-md border border-input bg-background p-2 text-sm';

/** Vital-sign inputs, shared by the new-visit and exam forms. */
export function VitalsFields({ v }: { v?: ClinicVisit }) {
  return (
    <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
      <div className="space-y-1"><Label>الحرارة °م</Label><Input name="temperature" type="number" step="0.1" dir="ltr" defaultValue={v?.temperature ?? ''} /></div>
      <div className="space-y-1"><Label>الضغط</Label><Input name="blood_pressure" placeholder="120/80" dir="ltr" defaultValue={v?.blood_pressure ?? ''} /></div>
      <div className="space-y-1"><Label>النبض</Label><Input name="pulse" type="number" dir="ltr" defaultValue={v?.pulse ?? ''} /></div>
      <div className="space-y-1"><Label>الوزن كجم</Label><Input name="weight" type="number" step="0.1" dir="ltr" defaultValue={v?.weight ?? ''} /></div>
      <div className="space-y-1"><Label>الطول سم</Label><Input name="height" type="number" step="0.1" dir="ltr" defaultValue={v?.height ?? ''} /></div>
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
