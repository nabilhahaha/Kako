import { redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { BookingsManager, type Booking, type RoomOption } from './bookings-manager';
import { getT } from '@/lib/i18n/server';

export default async function BookingsPage() {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  const { t } = await getT();

  if (!ctx.companyId) {
    return (
      <div>
        <PageHeader title={t('hotel.bookings.title')} />
        <p className="rounded-md border bg-card p-8 text-center text-sm text-muted-foreground">
          {t('hotel.noCompany')}
        </p>
      </div>
    );
  }

  const supabase = await createClient();
  const [{ data: bookings }, { data: rooms }] = await Promise.all([
    supabase
      .from('erp_bookings')
      .select('id, guest_name, guest_phone, check_in, check_out, nights, nightly_rate, total_amount, paid_amount, status, room:erp_rooms(code, name)')
      .order('check_in', { ascending: false })
      .limit(200),
    supabase
      .from('erp_rooms')
      .select('id, code, name, nightly_rate')
      .eq('is_active', true)
      .order('code', { ascending: true }),
  ]);

  return (
    <div>
      <PageHeader title={t('hotel.bookings.title')} description={t('hotel.bookings.description')} />
      <BookingsManager
        bookings={(bookings as unknown as Booking[]) ?? []}
        rooms={(rooms as RoomOption[]) ?? []}
      />
    </div>
  );
}
