import { notFound, redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { createClient } from '@/lib/supabase/server';
import { TicketEditor, type EditorTicket, type TicketItem, type MenuService, type StylistOption } from './ticket-editor';

export default async function TicketEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  const { id } = await params;
  const supabase = await createClient();
  const { data: ticket } = await supabase
    .from('erp_salon_tickets')
    .select('id, status, stylist_id, customer_name, customer_phone, discount_value')
    .eq('id', id).maybeSingle();
  if (!ticket) notFound();
  const t = ticket as unknown as EditorTicket;

  const [{ data: items }, { data: services }, { data: staff }] = await Promise.all([
    supabase.from('erp_salon_ticket_items').select('id, name, price, qty').eq('ticket_id', id).order('created_at'),
    supabase.from('erp_salon_services').select('id, name, price').eq('is_active', true).order('name'),
    supabase.rpc('erp_salon_staff'),
  ]);

  return (
    <TicketEditor
      ticket={{ ...t, discount_value: Number(t.discount_value || 0) }}
      items={(items as TicketItem[]) ?? []}
      services={(services as MenuService[]) ?? []}
      staff={(staff as StylistOption[]) ?? []}
    />
  );
}
