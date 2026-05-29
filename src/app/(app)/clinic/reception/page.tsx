import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { buttonVariants } from '@/components/ui/button';
import { UserPlus, CalendarClock, Wallet } from 'lucide-react';
import { AppointmentsManager, type Appointment } from '../appointments/appointments-manager';
import { ReceptionBilling } from './reception-manager';
import type { ClinicVisit, PatientOption } from '../clinical-ui';

export default async function ReceptionPage({
  searchParams,
}: {
  searchParams: Promise<{ patient?: string }>;
}) {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  if (!ctx.companyId) {
    return (
      <div>
        <PageHeader title="الاستقبال" />
        <p className="rounded-md border bg-card p-8 text-center text-sm text-muted-foreground">
          إدارة العيادة تتم من داخل حساب العيادة.
        </p>
      </div>
    );
  }

  const { patient: initialPatientId } = await searchParams;
  const supabase = await createClient();
  const since = new Date();
  since.setDate(since.getDate() - 1);

  const [{ data: appointments }, { data: patients }, { data: visits }] = await Promise.all([
    supabase
      .from('erp_clinic_appointments')
      .select('id, scheduled_at, duration_min, reason, status, patient:erp_patients(name, phone)')
      .gte('scheduled_at', since.toISOString())
      .order('scheduled_at', { ascending: true })
      .limit(200),
    supabase.from('erp_patients').select('id, name, phone').eq('is_active', true).order('name'),
    supabase
      .from('erp_clinic_visits')
      .select('id, patient_id, visit_date, visit_type, complaint, diagnosis, prescription, tests, fee, paid_amount, status, temperature, blood_pressure, pulse, weight, height, followup_date, patient:erp_patients(name, phone)')
      .order('visit_date', { ascending: false })
      .limit(200),
  ]);

  return (
    <div className="space-y-8">
      <div>
        <PageHeader
          title="الاستقبال"
          description="حجز المواعيد، استقبال المرضى، والتحصيل."
          action={
            <Link href="/clinic/patients" className={buttonVariants({ size: 'sm', variant: 'outline' })}>
              <UserPlus className="h-4 w-4" /> تسجيل مريض جديد
            </Link>
          }
        />
      </div>

      <section>
        <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold"><CalendarClock className="h-5 w-5" /> المواعيد</h2>
        <AppointmentsManager
          appointments={(appointments as unknown as Appointment[]) ?? []}
          patients={(patients as PatientOption[]) ?? []}
          initialPatientId={initialPatientId ?? null}
        />
      </section>

      <section>
        <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold"><Wallet className="h-5 w-5" /> الاستقبال والتحصيل</h2>
        <ReceptionBilling
          visits={(visits as unknown as ClinicVisit[]) ?? []}
          patients={(patients as PatientOption[]) ?? []}
        />
      </section>
    </div>
  );
}
