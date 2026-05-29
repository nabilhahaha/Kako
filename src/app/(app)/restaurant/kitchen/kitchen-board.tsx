'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ChefHat, Flame, Check } from 'lucide-react';
import { setItemKitchenStatus } from '../actions';

export interface KitchenItem { id: string; name: string; qty: number; notes: string | null; kitchen_status: string }
export interface KitchenOrder { id: string; label: string; order_type: string; items: KitchenItem[] }

export function KitchenBoard({ orders }: { orders: KitchenOrder[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function mark(itemId: string, status: string, ok: string) {
    startTransition(async () => {
      const res = await setItemKitchenStatus(itemId, status);
      if (!res.ok) { toast.error(res.error ?? 'حدث خطأ'); return; }
      toast.success(ok);
      router.refresh();
    });
  }

  if (orders.length === 0) {
    return <Card><CardContent className="flex flex-col items-center gap-2 p-10 text-center text-muted-foreground"><ChefHat className="h-10 w-10" /><p>لا أصناف في المطبخ حالياً.</p></CardContent></Card>;
  }

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {orders.map((o) => (
        <Card key={o.id} className="border-warning/40">
          <CardContent className="space-y-2 p-4">
            <div className="flex items-center justify-between border-b pb-2">
              <span className="font-semibold">{o.label}</span>
            </div>
            <ul className="space-y-2">
              {o.items.map((it) => (
                <li key={it.id} className="space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium"><span className="tabular-nums">{it.qty}×</span> {it.name}</span>
                    <Badge variant={it.kitchen_status === 'preparing' ? 'warning' : 'secondary'}>{it.kitchen_status === 'preparing' ? 'تحضير' : 'جديد'}</Badge>
                  </div>
                  {it.notes && <p className="text-xs text-muted-foreground">📝 {it.notes}</p>}
                  <div className="flex gap-1">
                    {it.kitchen_status === 'new' && (
                      <Button size="sm" variant="outline" className="flex-1" disabled={pending} onClick={() => mark(it.id, 'preparing', 'بدأ التحضير')}><Flame className="h-3.5 w-3.5" /> تحضير</Button>
                    )}
                    <Button size="sm" className="flex-1" disabled={pending} onClick={() => mark(it.id, 'ready', 'جاهز')}><Check className="h-3.5 w-3.5" /> جاهز</Button>
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
