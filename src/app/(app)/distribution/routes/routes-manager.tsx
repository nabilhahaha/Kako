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
import { Plus, Pencil, Loader2, X, Route as RouteIcon, Users } from 'lucide-react';
import { VISIT_DAYS } from '@/lib/erp/constants';
import { upsertRoute } from '../actions';
import { useI18n } from '@/lib/i18n/provider';

export interface RepOpt { id: string; full_name: string | null; email: string | null }
export interface VanOpt { id: string; name: string }
export interface RouteRow { id: string; name: string; rep_id: string | null; van_warehouse_id: string | null; visit_day: string | null; is_active: boolean; customers: number }

const selectCls = 'flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm';

export function RoutesManager({ routes, reps, vans }: { routes: RouteRow[]; reps: RepOpt[]; vans: VanOpt[] }) {
  const router = useRouter();
  const { t, locale } = useI18n();
  const [editing, setEditing] = useState<RouteRow | null | 'new'>(null);
  const [pending, startTransition] = useTransition();
  const repName = (id: string | null) => { const r = reps.find((x) => x.id === id); return r ? (r.full_name || r.email) : '—'; };
  const vanName = (id: string | null) => vans.find((v) => v.id === id)?.name ?? '—';

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = await upsertRoute(fd);
      if (!res.ok) { toast.error(res.error ?? t('distribution.errorGeneric')); return; }
      toast.success(editing === 'new' ? t('distribution.routeToastAdded') : t('distribution.routeToastUpdated')); setEditing(null); router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <Button onClick={() => setEditing('new')}><Plus className="h-4 w-4" /> {t('distribution.routeBtnNew')}</Button>
      {editing && (
        <Card><CardContent className="pt-6">
          <form onSubmit={onSubmit} className="space-y-4">
            {editing !== 'new' && <input type="hidden" name="id" value={editing.id} />}
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-1"><Label>{t('distribution.routeLabelName')}</Label><Input name="name" required defaultValue={editing !== 'new' ? editing.name : ''} placeholder={t('distribution.routeNamePlaceholder')} /></div>
              <div className="space-y-1"><Label>{t('distribution.routeLabelRep')}</Label>
                <select name="rep_id" className={selectCls} defaultValue={editing !== 'new' ? editing.rep_id ?? '' : ''}>
                  <option value="">—</option>{reps.map((r) => <option key={r.id} value={r.id}>{r.full_name || r.email}</option>)}
                </select>
              </div>
              <div className="space-y-1"><Label>{t('distribution.routeLabelVan')}</Label>
                <select name="van_warehouse_id" className={selectCls} defaultValue={editing !== 'new' ? editing.van_warehouse_id ?? '' : ''}>
                  <option value="">—</option>{vans.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
                </select>
              </div>
              <div className="space-y-1"><Label>{t('distribution.routeLabelVisitDay')}</Label>
                <select name="visit_day" className={selectCls} defaultValue={editing !== 'new' ? editing.visit_day ?? '' : ''}>
                  <option value="">—</option>{VISIT_DAYS.map((d) => <option key={d.value} value={d.value}>{d[locale]}</option>)}
                </select>
              </div>
            </div>
            <div className="flex gap-2"><Button type="submit" disabled={pending}>{pending && <Loader2 className="h-4 w-4 animate-spin" />} {t('distribution.btnSave')}</Button><Button type="button" variant="outline" onClick={() => setEditing(null)}><X className="h-4 w-4" /> {t('distribution.btnCancel')}</Button></div>
          </form>
        </CardContent></Card>
      )}
      <Card><CardContent className="p-0">
        {routes.length === 0 ? (
          <div className="flex flex-col items-center gap-2 p-8 text-center text-muted-foreground"><RouteIcon className="h-8 w-8" /><p>{t('distribution.routeEmptyState')}</p></div>
        ) : (
          <div className="overflow-x-auto"><table className="w-full text-sm">
            <thead className="border-b bg-secondary/50 text-muted-foreground"><tr>
              <th className="p-3 text-start font-medium">{t('distribution.routeColRoute')}</th><th className="p-3 text-start font-medium">{t('distribution.routeColRep')}</th><th className="p-3 text-start font-medium">{t('distribution.routeColVan')}</th><th className="p-3 text-center font-medium">{t('distribution.routeColDay')}</th><th className="p-3 text-center font-medium">{t('distribution.routeColCustomers')}</th><th className="p-3"></th>
            </tr></thead>
            <tbody>
              {routes.map((r) => (
                <tr key={r.id} className="border-b">
                  <td className="p-3 font-medium">{r.name}{!r.is_active && <Badge variant="secondary" className="ms-2">{t('distribution.routeBadgeInactive')}</Badge>}</td>
                  <td className="p-3 text-muted-foreground">{repName(r.rep_id)}</td>
                  <td className="p-3 text-muted-foreground">{vanName(r.van_warehouse_id)}</td>
                  <td className="p-3 text-center">{r.visit_day ? (VISIT_DAYS.find((d) => d.value === r.visit_day)?.[locale] ?? '—') : '—'}</td>
                  <td className="p-3 text-center tabular-nums">{r.customers}</td>
                  <td className="p-3 text-end">
                    <div className="flex items-center justify-end gap-1">
                      <Link href={`/distribution/routes/${r.id}`} className={buttonVariants({ size: 'sm', variant: 'ghost' })}><Users className="h-3.5 w-3.5" /> {t('distribution.routeBtnCustomers')}</Link>
                      <Button size="sm" variant="ghost" onClick={() => setEditing(r)}><Pencil className="h-3.5 w-3.5" /></Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
      </CardContent></Card>
    </div>
  );
}
