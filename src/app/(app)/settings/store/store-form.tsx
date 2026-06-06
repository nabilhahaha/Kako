'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { updateStore } from './actions';
import { recordMutation, formPayload } from '@/lib/sync/web/write-seam';
import { useI18n } from '@/lib/i18n/provider';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { FormSection } from '@/components/shared/form-section';
import type { Company } from '@/lib/erp/types';
import { Loader2, Store } from 'lucide-react';

// Module-scope so it is not remounted on parent re-render (keeps uncontrolled
// input values when validation toggles state).
function Field({ label, name, defaultValue, type = 'text', dir }: { label: string; name: string; defaultValue?: string | null; type?: string; dir?: 'ltr' | 'rtl' }) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <Input name={name} type={type} defaultValue={defaultValue ?? ''} dir={dir} />
    </label>
  );
}

export function StoreForm({ company }: { company: Company | null }) {
  const { t } = useI18n();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState('');

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    if (!String(fd.get('name') || '').trim()) { setErr(t('settings.store.errNameRequired')); return; }
    setErr('');
    start(async () => {
      const res = await updateStore(fd);
      if (!res.ok) { toast.error(res.error ?? ''); return; }
      // Local-first journal (settings = LWW, keyed by the company id). No-op unless KAKO_SYNC.
      if (company?.id) {
        void recordMutation({ entity: 'settings', op: 'update', pk: company.id, payload: formPayload(fd) });
      }
      toast.success(t('settings.store.saved'));
      router.refresh();
    });
  }

  const c = company;

  return (
    <Card>
      <CardContent className="pt-6">
        <form onSubmit={onSubmit} className="space-y-5">
          <FormSection title={t('settings.store.sectionIdentity')}>
            <Field label={t('settings.store.nameAr')} name="name_ar" defaultValue={c?.name_ar} />
            <Field label={t('settings.store.name')} name="name" defaultValue={c?.name} />
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-muted-foreground">{t('settings.store.currency')}</span>
              <select name="currency" defaultValue={c?.currency ?? 'EGP'} className="h-10 rounded-md border bg-background px-3">
                {['EGP', 'SAR', 'AED', 'USD', 'KWD', 'QAR'].map((cur) => <option key={cur} value={cur}>{cur}</option>)}
              </select>
            </label>
          </FormSection>

          <FormSection title={t('settings.store.sectionContact')}>
            <Field label={t('settings.store.phone')} name="phone" defaultValue={c?.phone} dir="ltr" />
            <Field label={t('settings.store.email')} name="email" type="email" defaultValue={c?.email} dir="ltr" />
            <Field label={t('settings.store.address')} name="address" defaultValue={c?.address} />
            <Field label={t('settings.store.website')} name="website" defaultValue={c?.website} dir="ltr" />
            <Field label={t('settings.store.logoUrl')} name="logo_url" defaultValue={c?.logo_url} dir="ltr" />
          </FormSection>

          <FormSection title={t('settings.store.sectionLegal')}>
            <Field label={t('settings.store.taxNumber')} name="tax_number" defaultValue={c?.tax_number} dir="ltr" />
            <Field label={t('settings.store.crNumber')} name="cr_number" defaultValue={c?.cr_number} dir="ltr" />
          </FormSection>

          {err && <p className="text-sm text-destructive">{err}</p>}
          <Button type="submit" disabled={pending} className="gap-1.5">
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Store className="h-4 w-4" />}
            {t('settings.store.save')}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
