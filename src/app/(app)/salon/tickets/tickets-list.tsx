'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Scissors, Plus, Loader2 } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import { createTicket } from '../actions';

export interface StylistOption { id: string; full_name: string | null; email: string | null }
export interface OpenTicket { id: string; customer_name: string | null; stylist_id: string | null; total: number; item_count: number }

export function TicketsList({ tickets, staff }: { tickets: OpenTicket[]; staff: StylistOption[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const stylistName = (id: string | null) => { const s = staff.find((x) => x.id === id); return s ? (s.full_name || s.email) : null; };

  function start() {
    startTransition(async () => {
      const res = await createTicket({});
      if (!res.ok || !res.data) { toast.error(res.error ?? 'تعذّر فتح التذكرة'); return; }
      router.push(`/salon/tickets/${res.data}`);
    });
  }

  return (
    <div className="space-y-4">
      <Button disabled={pending} onClick={start}>{pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} تذكرة جديدة</Button>
      {tickets.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">لا توجد تذاكر مفتوحة.</CardContent></Card>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {tickets.map((t) => (
            <Card key={t.id} className="cursor-pointer transition-colors hover:border-primary/40" onClick={() => router.push(`/salon/tickets/${t.id}`)}>
              <CardContent className="space-y-2 p-4">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2 font-medium"><Scissors className="h-4 w-4 text-muted-foreground" />{t.customer_name || 'عميل'}</span>
                  {stylistName(t.stylist_id) && <span className="text-xs text-muted-foreground">{stylistName(t.stylist_id)}</span>}
                </div>
                <div className="flex items-center justify-between text-sm text-muted-foreground">
                  <span>{t.item_count} خدمة</span>
                  <span className="tabular-nums font-semibold text-foreground" dir="ltr">{formatCurrency(t.total)}</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
