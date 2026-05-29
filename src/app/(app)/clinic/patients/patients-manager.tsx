'use client';

import { useState, useTransition, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Plus, Pencil, Loader2, X, Search, UserRound } from 'lucide-react';
import { upsertPatient } from '../actions';

export interface Patient {
  id: string;
  code: string | null;
  name: string;
  phone: string | null;
  gender: string | null;
  blood_type: string | null;
  notes: string | null;
}

const selectCls =
  'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

export function PatientsManager({ patients }: { patients: Patient[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<Patient | null | 'new'>(null);
  const [query, setQuery] = useState('');
  const [pending, startTransition] = useTransition();

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return patients;
    return patients.filter(
      (p) => p.name.toLowerCase().includes(q) || (p.phone || '').includes(q) || (p.code || '').toLowerCase().includes(q),
    );
  }, [patients, query]);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = await upsertPatient(fd);
      if (!res.ok) { toast.error(res.error ?? 'حدث خطأ'); return; }
      toast.success(editing === 'new' ? 'تم تسجيل المريض' : 'تم تحديث الملف');
      setEditing(null);
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button onClick={() => setEditing('new')}><Plus className="h-4 w-4" /> مريض جديد</Button>
        <div className="relative">
          <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="بحث بالاسم أو الهاتف…" className="w-60 pr-9" />
        </div>
      </div>

      {editing && (
        <Card>
          <CardContent className="pt-6">
            <form onSubmit={onSubmit} className="space-y-4">
              {editing !== 'new' && <input type="hidden" name="id" value={editing.id} />}
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <div className="space-y-1"><Label>اسم المريض *</Label><Input name="name" required defaultValue={editing !== 'new' ? editing.name : ''} /></div>
                <div className="space-y-1"><Label>الهاتف</Label><Input name="phone" dir="ltr" defaultValue={editing !== 'new' ? editing.phone ?? '' : ''} /></div>
                <div className="space-y-1"><Label>كود الملف</Label><Input name="code" dir="ltr" defaultValue={editing !== 'new' ? editing.code ?? '' : ''} /></div>
                <div className="space-y-1">
                  <Label>النوع</Label>
                  <select name="gender" className={selectCls} defaultValue={editing !== 'new' ? editing.gender ?? '' : ''}>
                    <option value="">—</option><option value="male">ذكر</option><option value="female">أنثى</option>
                  </select>
                </div>
                <div className="space-y-1"><Label>فصيلة الدم</Label><Input name="blood_type" dir="ltr" defaultValue={editing !== 'new' ? editing.blood_type ?? '' : ''} /></div>
                <div className="space-y-1 sm:col-span-2 lg:col-span-3"><Label>ملاحظات (أمراض مزمنة/حساسية)</Label><Input name="notes" defaultValue={editing !== 'new' ? editing.notes ?? '' : ''} /></div>
              </div>
              <div className="flex gap-2">
                <Button type="submit" disabled={pending}>{pending && <Loader2 className="h-4 w-4 animate-spin" />} حفظ</Button>
                <Button type="button" variant="outline" onClick={() => setEditing(null)}><X className="h-4 w-4" /> إلغاء</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-0">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center gap-2 p-8 text-center text-muted-foreground">
              <UserRound className="h-8 w-8" />
              <p>{patients.length === 0 ? 'لا يوجد مرضى بعد. سجّل أول مريض.' : 'لا توجد نتائج.'}</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-secondary/50 text-muted-foreground">
                  <tr>
                    <th className="p-3 text-right font-medium">المريض</th>
                    <th className="p-3 text-right font-medium">الهاتف</th>
                    <th className="p-3 text-center font-medium">النوع</th>
                    <th className="p-3 text-center font-medium">فصيلة الدم</th>
                    <th className="p-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((p) => (
                    <tr key={p.id} className="border-b">
                      <td className="p-3">
                        <Link href={`/clinic/patients/${p.id}`} className="font-medium text-primary hover:underline">{p.name}</Link>
                        {p.notes && <span className="block text-xs text-muted-foreground">{p.notes}</span>}
                      </td>
                      <td className="p-3 text-muted-foreground" dir="ltr">{p.phone || '—'}</td>
                      <td className="p-3 text-center">{p.gender === 'male' ? 'ذكر' : p.gender === 'female' ? 'أنثى' : '—'}</td>
                      <td className="p-3 text-center" dir="ltr">{p.blood_type || '—'}</td>
                      <td className="p-3 text-left">
                        <Button size="sm" variant="ghost" onClick={() => setEditing(p)}><Pencil className="h-3.5 w-3.5" /></Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
