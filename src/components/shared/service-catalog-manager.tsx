'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { FieldError } from '@/components/ui/field-error';
import { Plus, Pencil, Loader2, X, Tags } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import { useI18n } from '@/lib/i18n/provider';
import { INTL_LOCALE } from '@/lib/i18n/config';

export interface CatalogService {
  id: string;
  name: string;
  price: number;
  is_active: boolean;
  duration_min?: number | null;
}

type Upsert = (formData: FormData) => Promise<{ ok: boolean; error?: string }>;

/** Shared price-list manager reused by the clinic / salon / laundry verticals.
 *  The vertical passes its own upsert server action and optional config. */
export function ServiceCatalogManager({
  services,
  upsert,
  showDuration = false,
  entityLabel,
  namePlaceholder,
}: {
  services: CatalogService[];
  upsert: Upsert;
  showDuration?: boolean;
  entityLabel?: string;
  namePlaceholder?: string;
}) {
  const { t, locale } = useI18n();
  const intl = INTL_LOCALE[locale];
  const entity = entityLabel ?? t('shared.serviceCatalog.defaultEntity');
  const router = useRouter();
  const [editing, setEditing] = useState<CatalogService | null | 'new'>(null);
  const [nameErr, setNameErr] = useState('');
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    if (!String(fd.get('name') ?? '').trim()) {
      setNameErr(t('shared.serviceCatalog.nameRequired', { entity }));
      return;
    }
    startTransition(async () => {
      const res = await upsert(fd);
      if (!res.ok) { toast.error(res.error ?? t('shared.serviceCatalog.genericError')); return; }
      toast.success(editing === 'new' ? t('shared.serviceCatalog.added') : t('shared.serviceCatalog.updated'));
      setEditing(null);
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <Button onClick={() => { setNameErr(''); setEditing('new'); }}><Plus className="h-4 w-4" /> {t('shared.serviceCatalog.newEntity', { entity })}</Button>

      {editing && (
        <Card><CardContent className="pt-6">
          <form onSubmit={onSubmit} className="space-y-4">
            {editing !== 'new' && <input type="hidden" name="id" value={editing.id} />}
            <div className="grid gap-3 sm:grid-cols-4">
              <div className="space-y-1 sm:col-span-2"><Label>{t('shared.serviceCatalog.nameLabel', { entity })}</Label><Input name="name" defaultValue={editing !== 'new' ? editing.name : ''} placeholder={namePlaceholder} onChange={() => setNameErr('')} /><FieldError>{nameErr}</FieldError></div>
              <div className="space-y-1"><Label>{t('shared.serviceCatalog.price')}</Label><Input name="price" type="number" min={0} step="0.01" dir="ltr" defaultValue={editing !== 'new' ? editing.price : 0} /></div>
              {showDuration && (
                <div className="space-y-1"><Label>{t('shared.serviceCatalog.durationMin')}</Label><Input name="duration_min" type="number" min={5} step={5} dir="ltr" defaultValue={editing !== 'new' ? (editing.duration_min ?? 30) : 30} /></div>
              )}
              <div className="space-y-1">
                <Label>{t('shared.serviceCatalog.status')}</Label>
                <select name="is_active" className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm" defaultValue={editing === 'new' || editing.is_active ? 'true' : 'false'}>
                  <option value="true">{t('shared.serviceCatalog.active')}</option><option value="false">{t('shared.serviceCatalog.inactive')}</option>
                </select>
              </div>
            </div>
            <div className="flex gap-2">
              <Button type="submit" disabled={pending}>{pending && <Loader2 className="h-4 w-4 animate-spin" />} {t('shared.serviceCatalog.save')}</Button>
              <Button type="button" variant="outline" onClick={() => setEditing(null)}><X className="h-4 w-4" /> {t('shared.serviceCatalog.cancel')}</Button>
            </div>
          </form>
        </CardContent></Card>
      )}

      <Card><CardContent className="p-0">
        {services.length === 0 ? (
          <div className="flex flex-col items-center gap-2 p-8 text-center text-muted-foreground"><Tags className="h-8 w-8" /><p>{t('shared.serviceCatalog.empty')}</p></div>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b bg-secondary/50 text-muted-foreground"><tr>
              <th className="p-3 text-start font-medium">{entity}</th>
              {showDuration && <th className="p-3 text-center font-medium">{t('shared.serviceCatalog.durationCol')}</th>}
              <th className="p-3 text-center font-medium">{t('shared.serviceCatalog.priceCol')}</th>
              <th className="p-3 text-center font-medium">{t('shared.serviceCatalog.statusCol')}</th>
              <th className="p-3"></th>
            </tr></thead>
            <tbody>
              {services.map((s) => (
                <tr key={s.id} className="border-b">
                  <td className="p-3 font-medium">{s.name}</td>
                  {showDuration && <td className="p-3 text-center text-muted-foreground tabular-nums">{s.duration_min ?? 0} {t('shared.serviceCatalog.minutesShort')}</td>}
                  <td className="p-3 text-center tabular-nums" dir="ltr">{formatCurrency(s.price, 'EGP', intl)}</td>
                  <td className="p-3 text-center"><Badge variant={s.is_active ? 'success' : 'secondary'}>{s.is_active ? t('shared.serviceCatalog.active') : t('shared.serviceCatalog.inactive')}</Badge></td>
                  <td className="p-3 text-end"><Button size="sm" variant="ghost" onClick={() => setEditing(s)}><Pencil className="h-3.5 w-3.5" /></Button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CardContent></Card>
    </div>
  );
}
