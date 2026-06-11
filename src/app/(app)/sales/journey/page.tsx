import { redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import type { ErpCustomer, Profile } from '@/lib/erp/types';
import { JourneyManager } from './journey-manager';
import { getT } from '@/lib/i18n/server';

export default async function JourneyPage() {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  const { t } = await getT();

  const supabase = await createClient();
  const [{ data: customers }, { data: profiles }] = await Promise.all([
    supabase.from('erp_customers').select('*').eq('is_active', true).order('name'),
    // Role-scoped reps: only users this person may see/assign (self for a rep,
    // team for a supervisor, region for an area manager, all for admin). Also
    // enforced at the DB by the erp_profiles RLS (erp_visible_user_ids()).
    supabase.rpc('erp_assignable_reps'),
  ]);

  return (
    <div>
      <PageHeader
        title={t('sales.journeyTitle')}
        description={t('sales.journeyDescription')}
      />
      <JourneyManager
        customers={(customers as ErpCustomer[]) ?? []}
        reps={(profiles as Pick<Profile, 'id' | 'full_name' | 'email'>[]) ?? []}
      />
    </div>
  );
}
