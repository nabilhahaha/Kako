import { redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { RoomsManager, type Room } from './rooms-manager';
import { getT } from '@/lib/i18n/server';

export default async function RoomsPage() {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  const { t } = await getT();

  if (!ctx.companyId) {
    return (
      <div>
        <PageHeader title={t('hotel.rooms.title')} />
        <p className="rounded-md border bg-card p-8 text-center text-sm text-muted-foreground">
          {t('hotel.noCompany')}
        </p>
      </div>
    );
  }

  const supabase = await createClient();
  const { data: rooms } = await supabase
    .from('erp_rooms')
    .select('id, code, name, room_type, capacity, nightly_rate, status, is_active')
    .order('code', { ascending: true });

  return (
    <div>
      <PageHeader title={t('hotel.rooms.title')} description={t('hotel.rooms.description')} />
      <RoomsManager rooms={(rooms as Room[]) ?? []} />
    </div>
  );
}
