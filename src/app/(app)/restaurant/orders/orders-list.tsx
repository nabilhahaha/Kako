'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/shared/empty-state';
import { ShoppingBag, Bike, UtensilsCrossed, Loader2 } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import { useI18n } from '@/lib/i18n/provider';
import { createOrder } from '../actions';

export interface OpenOrder {
  id: string; order_type: string; customer_name: string | null; table_name: string | null;
  total: number; item_count: number;
}

export function OrdersList({ orders }: { orders: OpenOrder[] }) {
  const router = useRouter();
  const { t } = useI18n();
  const [pending, startTransition] = useTransition();

  function start(order_type: string) {
    startTransition(async () => {
      const res = await createOrder({ order_type });
      if (!res.ok || !res.data) { toast.error(res.error ?? t('restaurant.orders.errorOpenOrder')); return; }
      router.push(`/restaurant/orders/${res.data}`);
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Button disabled={pending} onClick={() => start('takeaway')}>{pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShoppingBag className="h-4 w-4" />} {t('restaurant.orders.btnNewTakeaway')}</Button>
        <Button variant="outline" disabled={pending} onClick={() => start('delivery')}><Bike className="h-4 w-4" /> {t('restaurant.orders.btnNewDelivery')}</Button>
      </div>

      {orders.length === 0 ? (
        <EmptyState icon={<UtensilsCrossed />} title={t('restaurant.orders.empty')} />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {orders.map((o) => (
            <Card key={o.id} className="cursor-pointer transition-colors hover:border-primary/40" onClick={() => router.push(`/restaurant/orders/${o.id}`)}>
              <CardContent className="space-y-2 p-4">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2 font-medium">
                    <UtensilsCrossed className="h-4 w-4 text-muted-foreground" />
                    {o.table_name
                      ? t('restaurant.orders.tableLabel', { name: o.table_name })
                      : (o.customer_name || t(`restaurant.orderType.${o.order_type}`))}
                  </span>
                  <Badge variant="secondary">{t(`restaurant.orderType.${o.order_type}`) ?? o.order_type}</Badge>
                </div>
                <div className="flex items-center justify-between text-sm text-muted-foreground">
                  <span>{t('restaurant.orders.itemCount', { count: o.item_count })}</span>
                  <span className="tabular-nums font-semibold text-foreground" dir="ltr">{formatCurrency(o.total)}</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
