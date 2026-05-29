'use client';

import { useState, useMemo, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Search, X, Plus } from 'lucide-react';
import { assignCustomerToRoute } from '../../actions';

export interface Cust { id: string; code: string; name: string; route_id: string | null }

export function RouteCustomers({ routeId, customers }: { routeId: string; customers: Cust[] }) {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [pending, startTransition] = useTransition();

  const assigned = useMemo(() => customers.filter((c) => c.route_id === routeId), [customers, routeId]);
  const found = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return [];
    return customers.filter((c) => c.route_id !== routeId && (c.name.toLowerCase().includes(s) || c.code.toLowerCase().includes(s))).slice(0, 12);
  }, [customers, q, routeId]);

  function set(customerId: string, rid: string | null, ok: string) {
    startTransition(async () => {
      const res = await assignCustomerToRoute(customerId, rid);
      if (!res.ok) { toast.error(res.error ?? 'حدث خطأ'); return; }
      toast.success(ok); router.refresh();
    });
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card><CardContent className="p-4">
        <div className="relative mb-3">
          <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ابحث عن عميل لإضافته للخط…" className="pr-9" />
        </div>
        {found.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">{q ? 'لا نتائج.' : 'اكتب اسم/كود عميل.'}</p>
        ) : (
          <ul className="divide-y">
            {found.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                <div><span className="font-medium">{c.name}</span> <span className="text-xs text-muted-foreground" dir="ltr">{c.code}</span>{c.route_id && <span className="ms-2 text-xs text-warning">(بخط آخر)</span>}</div>
                <Button size="sm" variant="outline" disabled={pending} onClick={() => set(c.id, routeId, 'تمت الإضافة للخط')}><Plus className="h-3.5 w-3.5" /> إضافة</Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent></Card>

      <Card><CardContent className="p-0">
        <div className="border-b p-3 font-semibold">عملاء الخط ({assigned.length})</div>
        {assigned.length === 0 ? (
          <p className="p-6 text-center text-sm text-muted-foreground">لا عملاء على الخط بعد.</p>
        ) : (
          <ul className="divide-y">
            {assigned.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-2 p-3 text-sm">
                <div><span className="font-medium">{c.name}</span> <span className="text-xs text-muted-foreground" dir="ltr">{c.code}</span></div>
                <Button size="sm" variant="ghost" disabled={pending} onClick={() => set(c.id, null, 'تمت الإزالة')}><X className="h-3.5 w-3.5" /></Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent></Card>
    </div>
  );
}
