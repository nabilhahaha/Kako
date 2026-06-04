import { redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { getT } from '@/lib/i18n/server';
import { SalonAppointments, type Appt, type StylistOption, type ServiceOption } from './appointments-manager';

export default async function SalonAppointmentsPage() {
  const { t } = await getT();
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  if (!ctx.companyId) {
    return (<div><PageHeader title={t('salon.appointments.title')} /><p className="rounded-md border bg-card p-8 text-center text-sm text-muted-foreground">{t('salon.appointments.noCompany')}</p></div>);
  }
  const supabase = await createClient();
  const since = new Date(); since.setDate(since.getDate() - 1);
  const [{ data: appts }, { data: staff }, { data: services }] = await Promise.all([
    supabase.from('erp_salon_appointments').select('id, scheduled_at, status, stylist_id, service_id, customer_name, customer_phone').gte('scheduled_at', since.toISOString()).order('scheduled_at').limit(200),
    supabase.rpc('erp_salon_staff'),
    supabase.from('erp_salon_services').select('id, name, price').eq('is_active', true).order('name'),
  ]);
  return (
    <div>
      <PageHeader title={t('salon.appointments.title')} description={t('salon.appointments.description')} />
      <SalonAppointments
        appts={(appts as Appt[]) ?? []}
        staff={(staff as StylistOption[]) ?? []}
        services={(services as ServiceOption[]) ?? []}
      />
    </div>
  );
}
