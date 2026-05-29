'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Plus, Pencil, Loader2, X, Shirt } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import { upsertService } from '../actions';

export interface Service { id: string; name: string; price: number; is_active: boolean }

export function ServicesManager({ services }: { services: Service[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<Service | null | 'new'>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = await upsertService(fd);
      if (!res.ok) { toast.error(res.error ?? 'حدث خطأ'); return; }
      toast.success(editing === 'new' ? 'تمت الإضافة' : 'تم التحديث'); setEditing(null); router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <Button onClick={() => setEditing('new')}><Plus className="h-4 w-4" /> صنف جديد</Button>
      {editing && (
        <Card><CardContent className="pt-6">
          <form onSubmit={onSubmit} className="space-y-4">
            {editing !== 'new' && <input type="hidden" name="id" value={editing.id} />}
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1 sm:col-span-2"><Label>اسم الصنف *</Label><Input name="name" required defaultValue={editing !== 'new' ? editing.name : ''} placeholder="قميص / بنطلون / بدلة" /></div>
              <div className="space-y-1"><Label>السعر</Label><Input name="price" type="number" min={0} step="0.01" dir="ltr" defaultValue={editing !== 'new' ? editing.price : 0} /></div>
              <div className="space-y-1">
                <Label>الحالة</Label>
                <select name="is_active" className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm" defaultValue={editing === 'new' || editing.is_active ? 'true' : 'false'}>
                  <option value="true">مفعّل</option><option value="false">موقوف</option>
                </select>
              </div>
            </div>
            <div className="flex gap-2"><Button type="submit" disabled={pending}>{pending && <Loader2 className="h-4 w-4 animate-spin" />} حفظ</Button><Button type="button" variant="outline" onClick={() => setEditing(null)}><X className="h-4 w-4" /> إلغاء</Button></div>
          </form>
        </CardContent></Card>
      )}
      <Card><CardContent className="p-0">
        {services.length === 0 ? (
          <div className="flex flex-col items-center gap-2 p-8 text-center text-muted-foreground"><Shirt className="h-8 w-8" /><p>لا توجد أصناف بعد.</p></div>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b bg-secondary/50 text-muted-foreground"><tr><th className="p-3 text-right font-medium">الصنف</th><th className="p-3 text-center font-medium">السعر</th><th className="p-3 text-center font-medium">الحالة</th><th className="p-3"></th></tr></thead>
            <tbody>
              {services.map((s) => (
                <tr key={s.id} className="border-b">
                  <td className="p-3 font-medium">{s.name}</td>
                  <td className="p-3 text-center tabular-nums" dir="ltr">{formatCurrency(s.price)}</td>
                  <td className="p-3 text-center"><Badge variant={s.is_active ? 'success' : 'secondary'}>{s.is_active ? 'مفعّل' : 'موقوف'}</Badge></td>
                  <td className="p-3 text-left"><Button size="sm" variant="ghost" onClick={() => setEditing(s)}><Pencil className="h-3.5 w-3.5" /></Button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CardContent></Card>
    </div>
  );
}
