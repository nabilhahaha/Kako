'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Plus, Loader2, Power, MapPin, Map } from 'lucide-react';
import type { Region, Area } from '@/lib/erp/types';
import { useI18n } from '@/lib/i18n/provider';
import { upsertRegion, upsertArea, toggleRegionActive, toggleAreaActive } from './actions';

const selectCls =
  'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

export function RegionsManager({ regions, areas }: { regions: Region[]; areas: Area[] }) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const ar = locale === 'ar';

  function onSubmit(e: React.FormEvent<HTMLFormElement>, fn: (fd: FormData) => Promise<{ ok: boolean; error?: string }>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    startTransition(async () => {
      const res = await fn(fd);
      if (!res.ok) { toast.error(res.error ?? t('regions.toastError')); return; }
      toast.success(t('regions.toastSaved'));
      form.reset();
      router.refresh();
    });
  }
  function toggle(fn: (id: string, v: boolean) => Promise<{ ok: boolean; error?: string }>, id: string, v: boolean) {
    startTransition(async () => {
      const res = await fn(id, v);
      if (!res.ok) { toast.error(res.error ?? t('regions.toastError')); return; }
      router.refresh();
    });
  }
  const regionName = (r: Region) => (ar ? r.name_ar || r.name : r.name);
  const areaRegion = (a: Area) => regions.find((r) => r.id === a.region_id);

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {/* Regions */}
      <Card>
        <CardContent className="space-y-4 pt-6">
          <h3 className="flex items-center gap-2 font-semibold"><Map className="h-4 w-4" /> {t('regions.regionsTitle')}</h3>
          {regions.length > 0 ? (
            <div className="divide-y rounded-md border">
              {regions.map((r) => (
                <div key={r.id} className="flex items-center justify-between p-3 text-sm">
                  <span className="font-medium">{regionName(r)}{!r.is_active && <Badge variant="secondary" className="ms-2">{t('regions.inactive')}</Badge>}</span>
                  <Button size="sm" variant="outline" disabled={pending} onClick={() => toggle(toggleRegionActive, r.id, !r.is_active)}>
                    <Power className="h-3.5 w-3.5" /> {r.is_active ? t('regions.deactivate') : t('regions.activate')}
                  </Button>
                </div>
              ))}
            </div>
          ) : <p className="text-sm text-muted-foreground">{t('regions.emptyRegions')}</p>}
          <form onSubmit={(e) => onSubmit(e, upsertRegion)} className="grid gap-2 sm:grid-cols-3">
            <Input name="name" placeholder={t('regions.namePlaceholder')} required />
            <Input name="name_ar" placeholder={t('regions.nameArPlaceholder')} />
            <Button type="submit" size="sm" disabled={pending}>
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} {t('regions.addRegion')}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Areas */}
      <Card>
        <CardContent className="space-y-4 pt-6">
          <h3 className="flex items-center gap-2 font-semibold"><MapPin className="h-4 w-4" /> {t('regions.areasTitle')}</h3>
          {areas.length > 0 ? (
            <div className="divide-y rounded-md border">
              {areas.map((a) => (
                <div key={a.id} className="flex items-center justify-between p-3 text-sm">
                  <span className="font-medium">
                    {ar ? a.name_ar || a.name : a.name}
                    {areaRegion(a) && <span className="ms-1 text-muted-foreground">· {regionName(areaRegion(a)!)}</span>}
                    {!a.is_active && <Badge variant="secondary" className="ms-2">{t('regions.inactive')}</Badge>}
                  </span>
                  <Button size="sm" variant="outline" disabled={pending} onClick={() => toggle(toggleAreaActive, a.id, !a.is_active)}>
                    <Power className="h-3.5 w-3.5" /> {a.is_active ? t('regions.deactivate') : t('regions.activate')}
                  </Button>
                </div>
              ))}
            </div>
          ) : <p className="text-sm text-muted-foreground">{t('regions.emptyAreas')}</p>}
          <form onSubmit={(e) => onSubmit(e, upsertArea)} className="grid gap-2 sm:grid-cols-2">
            <Input name="name" placeholder={t('regions.areaNamePlaceholder')} required />
            <Input name="name_ar" placeholder={t('regions.nameArPlaceholder')} />
            <select name="region_id" className={selectCls} defaultValue="">
              <option value="">{t('regions.noRegion')}</option>
              {regions.filter((r) => r.is_active).map((r) => (
                <option key={r.id} value={r.id}>{regionName(r)}</option>
              ))}
            </select>
            <Button type="submit" size="sm" disabled={pending}>
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} {t('regions.addArea')}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
