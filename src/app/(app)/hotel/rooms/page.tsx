import { redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { RoomsManager, type Room } from './rooms-manager';

export default async function RoomsPage() {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');

  if (!ctx.companyId) {
    return (
      <div>
        <PageHeader title="الغرف" />
        <p className="rounded-md border bg-card p-8 text-center text-sm text-muted-foreground">
          إدارة الفندق تتم من داخل حساب الشركة. سجّل الدخول بحساب الفندق لإضافة الغرف والحجوزات.
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
      <PageHeader title="الغرف" description="غرف ووحدات الفندق وحالتها." />
      <RoomsManager rooms={(rooms as Room[]) ?? []} />
    </div>
  );
}
