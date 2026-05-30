'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Scissors, Plus, Loader2 } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import { useI18n } from '@/lib/i18n/provider';
import { INTL_LOCALE } from '@/lib/i18n/config';
import { createTicket } from '../actions';

export interface StylistOption { id: string; full_name: string | null; email: string | null }
export interface OpenTicket { id: string; customer_name: string | null; stylist_id: string | null; total: number; item_count: number }

export function TicketsList({ tickets, staff }: { tickets: OpenTicket[]; staff: StylistOption[] }) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const stylistName = (id: string | null) => { const s = staff.find((x) => x.id === id); return s ? (s.full_name || s.email) : null; };

  function start() {
    startTransition(async () => {
      const res = await createTicket({});
      if (!res.ok || !res.data) { toast.error(res.error ?? t('salon.tickets.toastOpenFailed')); return; }
      router.push(`/salon/tickets/${res.data}`);
    });
  }

  return (
    <div className="space-y-4">
      <Button disabled={pending} onClick={start}>{pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} {t('salon.tickets.newButton')}</Button>
      {tickets.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">{t('salon.tickets.emptyList')}</CardContent></Card>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {tickets.map((tk) => (
            <Card key={tk.id} className="cursor-pointer transition-colors hover:border-primary/40" onClick={() => router.push(`/salon/tickets/${tk.id}`)}>
              <CardContent className="space-y-2 p-4">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2 font-medium"><Scissors className="h-4 w-4 text-muted-foreground" />{tk.customer_name || t('salon.tickets.defaultCustomer')}</span>
                  {stylistName(tk.stylist_id) && <span className="text-xs text-muted-foreground">{stylistName(tk.stylist_id)}</span>}
                </div>
                <div className="flex items-center justify-between text-sm text-muted-foreground">
                  <span>{t('salon.tickets.serviceCount', { count: tk.item_count })}</span>
                  <span className="tabular-nums font-semibold text-foreground" dir="ltr">{formatCurrency(tk.total, 'EGP', INTL_LOCALE[locale])}</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
