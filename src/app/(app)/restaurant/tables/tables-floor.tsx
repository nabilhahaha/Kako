'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Plus, Loader2, X, Pencil, Users, Settings } from 'lucide-react';
import { useI18n } from '@/lib/i18n/provider';
import { upsertTable, createOrder } from '../actions';

export interface FloorTable { id: string; name: string; seats: number; status: string; openOrderId: string | null }

export function TablesFloor({ tables }: { tables: FloorTable[] }) {
  const router = useRouter();
  const { t } = useI18n();
  const [manage, setManage] = useState(false);
  const [editing, setEditing] = useState<FloorTable | null | 'new'>(null);
  const [pending, startTransition] = useTransition();

  function openTable(tbl: FloorTable) {
    if (tbl.openOrderId) { router.push(`/restaurant/orders/${tbl.openOrderId}`); return; }
    startTransition(async () => {
      const res = await createOrder({ table_id: tbl.id, order_type: 'dine_in' });
      if (!res.ok || !res.data) { toast.error(res.error ?? t('restaurant.tables.errorOpenOrder')); return; }
      router.push(`/restaurant/orders/${res.data}`);
    });
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = await upsertTable(fd);
      if (!res.ok) { toast.error(res.error ?? t('restaurant.errorGeneric')); return; }
      toast.success(t('restaurant.tables.toastSaved'));
      setEditing(null);
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Button variant={manage ? 'default' : 'outline'} onClick={() => { setManage((m) => !m); setEditing(null); }}>
          <Settings className="h-4 w-4" /> {t('restaurant.tables.manageTables')}
        </Button>
        {manage && <Button onClick={() => setEditing('new')}><Plus className="h-4 w-4" /> {t('restaurant.tables.newTable')}</Button>}
      </div>

      {manage && editing && (
        <Card>
          <CardContent className="pt-6">
            <form onSubmit={onSubmit} className="space-y-4">
              {editing !== 'new' && <input type="hidden" name="id" value={editing.id} />}
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="space-y-1"><Label>{t('restaurant.tables.fieldName')}</Label><Input name="name" required defaultValue={editing !== 'new' ? editing.name : ''} placeholder={t('restaurant.tables.namePlaceholder')} /></div>
                <div className="space-y-1"><Label>{t('restaurant.tables.fieldSeats')}</Label><Input name="seats" type="number" min={1} dir="ltr" defaultValue={editing !== 'new' ? editing.seats : 4} /></div>
              </div>
              <div className="flex gap-2">
                <Button type="submit" disabled={pending}>{pending && <Loader2 className="h-4 w-4 animate-spin" />} {t('restaurant.tables.save')}</Button>
                <Button type="button" variant="outline" onClick={() => setEditing(null)}><X className="h-4 w-4" /> {t('restaurant.tables.cancel')}</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {tables.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">{t('restaurant.tables.empty')}</CardContent></Card>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
          {tables.map((tbl) => {
            const occupied = !!tbl.openOrderId || tbl.status === 'occupied';
            return (
              <Card key={tbl.id} className={`relative ${occupied ? 'border-warning/50 bg-warning/5' : 'border-success/40 bg-success/5'}`}>
                <CardContent className="flex flex-col items-center gap-2 p-4 text-center">
                  {manage && (
                    <button onClick={() => setEditing(tbl)} className="absolute end-1 top-1 text-muted-foreground hover:text-foreground"><Pencil className="h-3.5 w-3.5" /></button>
                  )}
                  <span className="text-lg font-bold">{tbl.name}</span>
                  <span className="flex items-center gap-1 text-xs text-muted-foreground"><Users className="h-3 w-3" /> {tbl.seats}</span>
                  <Badge variant={occupied ? 'warning' : 'success'}>{occupied ? t('restaurant.tables.statusOccupied') : t('restaurant.tables.statusFree')}</Badge>
                  {!manage && (
                    <Button size="sm" className="w-full" disabled={pending} onClick={() => openTable(tbl)}>
                      {occupied ? t('restaurant.tables.openOrder') : t('restaurant.tables.openTable')}
                    </Button>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
