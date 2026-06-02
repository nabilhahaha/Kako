'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Plus, Loader2, Power, Tags } from 'lucide-react';
import type { CustomerLookup } from '@/lib/erp/types';
import { CUSTOMER_LOOKUP_KINDS } from '@/lib/erp/constants';
import { useI18n } from '@/lib/i18n/provider';
import { upsertCustomerLookup, toggleCustomerLookupActive } from './actions';

export function CustomerDataManager({ lookups }: { lookups: CustomerLookup[] }) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const ar = locale === 'ar';

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    startTransition(async () => {
      const res = await upsertCustomerLookup(fd);
      if (!res.ok) { toast.error(res.error ?? t('customerData.toastError')); return; }
      toast.success(t('customerData.toastSaved'));
      form.reset();
      router.refresh();
    });
  }
  function toggle(id: string, v: boolean) {
    startTransition(async () => {
      const res = await toggleCustomerLookupActive(id, v);
      if (!res.ok) { toast.error(res.error ?? t('customerData.toastError')); return; }
      router.refresh();
    });
  }

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      {CUSTOMER_LOOKUP_KINDS.map(({ kind, en, ar: arLabel }) => {
        const rows = lookups.filter((l) => l.kind === kind);
        return (
          <Card key={kind}>
            <CardContent className="space-y-4 pt-6">
              <h3 className="flex items-center gap-2 font-semibold">
                <Tags className="h-4 w-4" /> {ar ? arLabel : en}
              </h3>
              {rows.length > 0 ? (
                <div className="divide-y rounded-md border">
                  {rows.map((l) => (
                    <div key={l.id} className="flex items-center justify-between p-3 text-sm">
                      <span className="font-medium">
                        {ar ? l.name_ar || l.name : l.name}
                        {!l.is_active && <Badge variant="secondary" className="ms-2">{t('customerData.inactive')}</Badge>}
                      </span>
                      <Button size="sm" variant="outline" disabled={pending} onClick={() => toggle(l.id, !l.is_active)}>
                        <Power className="h-3.5 w-3.5" /> {l.is_active ? t('customerData.deactivate') : t('customerData.activate')}
                      </Button>
                    </div>
                  ))}
                </div>
              ) : <p className="text-sm text-muted-foreground">{t('customerData.empty')}</p>}
              <form onSubmit={onSubmit} className="grid gap-2">
                <input type="hidden" name="kind" value={kind} />
                <Input name="name" placeholder={t('customerData.namePlaceholder')} required />
                <Input name="name_ar" placeholder={t('customerData.nameArPlaceholder')} />
                <Button type="submit" size="sm" disabled={pending}>
                  {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} {t('customerData.addValue')}
                </Button>
              </form>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
