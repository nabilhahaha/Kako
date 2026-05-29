import { redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { requireAnyPermission } from '@/lib/erp/guards';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { AppointmentsManager, type Appointment, type PatientOption } from './appointments-manager';
import type { DoctorOption } from '../clinical-ui';

export default async function AppointmentsPage({
  searchParams,
}: {
  searchParams: Promise<{ patient?: string }>;
}) {
  await requireAnyPermission(['clinic.manage', 'clinic.reception']);
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  if (!ctx.companyId) {
    return (
      <div>
        <PageHeader title="المواعيد" />
        <p className="rounded-md border bg-card p-8 text-center text-sm text-muted-foreground">
          إدارة العيادة تتم من داخل حساب العيادة.
        </p>
      </div>
    );
  }

  const { patient: initialPatientId } = await searchParams;

  const supabase = await createClient();
  // Show appointments from the start of today onward (plus very recent past),
  // newest schedule first is confusing for a queue, so order ascending by time.
  const since = new Date();
  since.setDate(since.getDate() - 1);

  const [{ data: appointments }, { data: patients }, { data: doctors }] = await Promise.all([
    supabase
      .from('erp_clinic_appointments')
      .select('id, scheduled_at, duration_min, reason, status, doctor_id, patient:erp_patients(name, phone)')
      .gte('scheduled_at', since.toISOString())
      .order('scheduled_at', { ascending: true })
      .limit(200),
    supabase.from('erp_patients').select('id, name, phone').eq('is_active', true).order('name'),
    supabase.rpc('erp_clinic_doctors'),
  ]);

  return (
    <div>
      <PageHeader title="المواعيد" description="حجوزات المرضى — احجز موعداً وسجّل وصول المريض ليتحوّل إلى كشف." />
      <AppointmentsManager
        appointments={(appointments as unknown as Appointment[]) ?? []}
        patients={(patients as PatientOption[]) ?? []}
        doctors={(doctors as DoctorOption[]) ?? []}
        initialPatientId={initialPatientId ?? null}
      />
    </div>
  );
}
