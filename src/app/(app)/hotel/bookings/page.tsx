import { redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { BookingsManager, type Booking, type RoomOption } from './bookings-manager';

export default async function BookingsPage() {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');

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
      <PageHeader title="الحجوزات" description="حجوزات الغرف وتسجيل الدخول والخروج." />
      <BookingsManager
        bookings={(bookings as unknown as Booking[]) ?? []}
        rooms={(rooms as RoomOption[]) ?? []}
      />
    </div>
  );
}
