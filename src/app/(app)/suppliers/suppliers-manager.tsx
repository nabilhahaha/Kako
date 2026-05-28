'use client';

import { useState, useTransition, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { upsertSupplier, toggleSupplierActive } from './actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { formatCurrency } from '@/lib/utils';
import type { Supplier } from '@/lib/erp/types';
import { Plus, Pencil, Loader2, X, Truck, Search } from 'lucide-react';
import { toast } from 'sonner';

export function SuppliersManager({ suppliers }: { suppliers: Supplier[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<Supplier | null | 'new'>(null);
  const [query, setQuery] = useState('');
  const [pending, startTransition] = useTransition();

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return suppliers;
    return suppliers.filter(
      (s) =>
        s.code.toLowerCase().includes(q) ||
        s.name.toLowerCase().includes(q) ||
        (s.name_ar || '').toLowerCase().includes(q) ||
        (s.phone || '').includes(q),
    );
  }, [suppliers, query]);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = await upsertSupplier(formData);
      if (!res.ok) {
        toast.error(res.error ?? 'حدث خطأ');
        return;
      }
      toast.success(editing === 'new' ? 'تمت إضافة المورد' : 'تم تحديث المورد');
      setEditing(null);
      router.refresh();
    });
  }

  function onToggle(s: Supplier) {
    startTransition(async () => {
      const res = await toggleSupplierActive(s.id, !s.is_active);
      if (!res.ok) toast.error(res.error ?? 'حدث خطأ');
      else router.refresh();
    });
  }

  const current = editing === 'new' ? null : editing;
  const totalPayable = suppliers.reduce((s, x) => s + Number(x.balance || 0), 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {editing === null && (
          <Button onClick={() => setEditing('new')}>
            <Plus className="h-4 w-4" /> مورد جديد
          </Button>
        )}
        <Badge variant="secondary" className="text-sm">
          إجمالي المستحق للموردين: {formatCurrency(totalPayable)}
        </Badge>
        <div className="relative ms-auto">
          <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="بحث…"
            className="w-56 pr-9"
          />
        </div>
      </div>

      {editing !== null && (
        <Card>
          <CardContent className="pt-6">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-semibold">
                {editing === 'new' ? 'مورد جديد' : `تعديل: ${current?.name_ar || current?.name}`}
              </h3>
              <button onClick={() => setEditing(null)} className="rounded-md p-1 hover:bg-secondary">
                <X className="h-4 w-4" />
              </button>
            </div>
            <form onSubmit={onSubmit} className="space-y-4">
              {current && <input type="hidden" name="id" value={current.id} />}
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <Field label="كود المورد *"><Input name="code" dir="ltr" defaultValue={current?.code ?? ''} required /></Field>
                <Field label="الاسم (عربي)"><Input name="name_ar" defaultValue={current?.name_ar ?? ''} /></Field>
                <Field label="الاسم (إنجليزي) *"><Input name="name" defaultValue={current?.name ?? ''} required /></Field>
                <Field label="الهاتف"><Input name="phone" dir="ltr" defaultValue={current?.phone ?? ''} /></Field>
                <Field label="البريد الإلكتروني"><Input name="email" type="email" dir="ltr" defaultValue={current?.email ?? ''} /></Field>
                <Field label="الرقم الضريبي"><Input name="tax_number" dir="ltr" defaultValue={current?.tax_number ?? ''} /></Field>
                <Field label="المدينة"><Input name="city" defaultValue={current?.city ?? ''} /></Field>
                <Field label="العنوان"><Input name="address" defaultValue={current?.address ?? ''} /></Field>
              </div>
              <div className="flex gap-2">
                <Button type="submit" disabled={pending}>
                  {pending && <Loader2 className="h-4 w-4 animate-spin" />} حفظ
                </Button>
                <Button type="button" variant="outline" onClick={() => setEditing(null)}>إلغاء</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {filtered.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 p-8 text-center text-muted-foreground">
            <Truck className="h-8 w-8" />
            <p>{suppliers.length === 0 ? 'لا يوجد موردون بعد.' : 'لا توجد نتائج.'}</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-secondary/50 text-muted-foreground">
                  <tr>
                    <th className="p-3 text-right font-medium">الكود</th>
                    <th className="p-3 text-right font-medium">المورد</th>
                    <th className="p-3 text-right font-medium">الهاتف</th>
                    <th className="p-3 text-right font-medium">المدينة</th>
                    <th className="p-3 text-left font-medium">الرصيد المستحق</th>
                    <th className="p-3 text-center font-medium">الحالة</th>
                    <th className="p-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((s) => (
                    <tr key={s.id} className="border-b last:border-0 hover:bg-secondary/30">
                      <td className="p-3 font-mono text-xs" dir="ltr">{s.code}</td>
                      <td className="p-3 font-medium">{s.name_ar || s.name}</td>
                      <td className="p-3 text-muted-foreground" dir="ltr">{s.phone || '—'}</td>
                      <td className="p-3 text-muted-foreground">{s.city || '—'}</td>
                      <td className="p-3 text-left tabular-nums" dir="ltr">{formatCurrency(s.balance)}</td>
                      <td className="p-3 text-center">
                        {s.is_active ? <Badge variant="success">نشط</Badge> : <Badge variant="destructive">موقوف</Badge>}
                      </td>
                      <td className="p-3">
                        <div className="flex justify-end gap-1">
                          <button onClick={() => setEditing(s)} className="rounded-md p-1.5 hover:bg-secondary" aria-label="تعديل">
                            <Pencil className="h-4 w-4" />
                          </button>
                          <Button variant="ghost" size="sm" disabled={pending} onClick={() => onToggle(s)} className="text-xs">
                            {s.is_active ? 'إيقاف' : 'تفعيل'}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}
