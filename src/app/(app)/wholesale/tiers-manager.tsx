'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Plus, Pencil, Loader2, X, Layers, Tags } from 'lucide-react';
import { upsertTier } from './actions';

export interface Tier { id: string; name: string; sort: number; is_active: boolean }

export function TiersManager({ tiers }: { tiers: Tier[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<Tier | null | 'new'>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = await upsertTier(fd);
      if (!res.ok) { toast.error(res.error ?? 'حدث خطأ'); return; }
      toast.success(editing === 'new' ? 'تمت الإضافة' : 'تم التحديث'); setEditing(null); router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <Button onClick={() => setEditing('new')}><Plus className="h-4 w-4" /> مستوى جديد</Button>
      {editing && (
        <Card><CardContent className="pt-6">
          <form onSubmit={onSubmit} className="space-y-4">
            {editing !== 'new' && <input type="hidden" name="id" value={editing.id} />}
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1 sm:col-span-2"><Label>اسم المستوى *</Label><Input name="name" required defaultValue={editing !== 'new' ? editing.name : ''} placeholder="قطاعي / جملة / جملة الجملة" /></div>
              <div className="space-y-1"><Label>الترتيب</Label><Input name="sort" type="number" dir="ltr" defaultValue={editing !== 'new' ? editing.sort : 0} /></div>
            </div>
            <div className="flex gap-2"><Button type="submit" disabled={pending}>{pending && <Loader2 className="h-4 w-4 animate-spin" />} حفظ</Button><Button type="button" variant="outline" onClick={() => setEditing(null)}><X className="h-4 w-4" /> إلغاء</Button></div>
          </form>
        </CardContent></Card>
      )}
      <Card><CardContent className="p-0">
        {tiers.length === 0 ? (
          <div className="flex flex-col items-center gap-2 p-8 text-center text-muted-foreground"><Layers className="h-8 w-8" /><p>لا توجد مستويات بعد. أضف أول مستوى.</p></div>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b bg-secondary/50 text-muted-foreground"><tr><th className="p-3 text-right font-medium">المستوى</th><th className="p-3 text-center font-medium">الحالة</th><th className="p-3"></th></tr></thead>
            <tbody>
              {tiers.map((t) => (
                <tr key={t.id} className="border-b">
                  <td className="p-3 font-medium">{t.name}</td>
                  <td className="p-3 text-center"><Badge variant={t.is_active ? 'success' : 'secondary'}>{t.is_active ? 'مفعّل' : 'موقوف'}</Badge></td>
                  <td className="p-3 text-left">
                    <div className="flex items-center justify-end gap-1">
                      <Link href={`/wholesale/prices?tier=${t.id}`} className={buttonVariants({ size: 'sm', variant: 'ghost' })}><Tags className="h-3.5 w-3.5" /> الأسعار</Link>
                      <Button size="sm" variant="ghost" onClick={() => setEditing(t)}><Pencil className="h-3.5 w-3.5" /></Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CardContent></Card>
    </div>
  );
}
