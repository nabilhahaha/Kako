'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Loader2, ShieldCheck } from 'lucide-react';
import { useI18n } from '@/lib/i18n/provider';
import { saveEtaSettings } from './actions';

export interface EtaSettings {
  tax_registration_number: string | null;
  taxpayer_activity_code: string | null;
  branch_id: string | null;
  issuer_name: string | null;
  environment: string | null;
  enabled: boolean | null;
  address: {
    country?: string;
    governate?: string;
    regionCity?: string;
    street?: string;
    buildingNumber?: string;
  } | null;
}

export function EtaSettingsForm({ settings }: { settings: EtaSettings | null }) {
  const { t } = useI18n();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const a = settings?.address ?? {};

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = await saveEtaSettings(fd);
      if (!res.ok) {
        toast.error(res.error ?? t('settings.eta.genericError'));
        return;
      }
      toast.success(t('settings.eta.saved'));
      router.refresh();
    });
  }

  return (
    <Card>
      <CardContent className="pt-6">
        <form onSubmit={onSubmit} className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('settings.eta.taxRegistrationNumber')}>
              <Input name="tax_registration_number" dir="ltr" defaultValue={settings?.tax_registration_number ?? ''} placeholder="313456789" />
            </Field>
            <Field label={t('settings.eta.activityCode')}>
              <Input name="taxpayer_activity_code" dir="ltr" defaultValue={settings?.taxpayer_activity_code ?? ''} placeholder="4649" />
            </Field>
            <Field label={t('settings.eta.issuerName')}>
              <Input name="issuer_name" defaultValue={settings?.issuer_name ?? ''} />
            </Field>
            <Field label={t('settings.eta.branchId')}>
              <Input name="branch_id" dir="ltr" defaultValue={settings?.branch_id ?? '0'} placeholder="0" />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field label={t('settings.eta.country')}>
              <Input name="country" dir="ltr" defaultValue={a.country ?? 'EG'} />
            </Field>
            <Field label={t('settings.eta.governate')}>
              <Input name="governate" defaultValue={a.governate ?? ''} />
            </Field>
            <Field label={t('settings.eta.regionCity')}>
              <Input name="regionCity" defaultValue={a.regionCity ?? ''} />
            </Field>
            <Field label={t('settings.eta.street')}>
              <Input name="street" defaultValue={a.street ?? ''} />
            </Field>
            <Field label={t('settings.eta.buildingNumber')}>
              <Input name="buildingNumber" dir="ltr" defaultValue={a.buildingNumber ?? ''} />
            </Field>
            <Field label={t('settings.eta.environment')}>
              <select name="environment" defaultValue={settings?.environment ?? 'preprod'} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                <option value="preprod">{t('settings.eta.envPreprod')}</option>
                <option value="production">{t('settings.eta.envProduction')}</option>
              </select>
            </Field>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="enabled" defaultChecked={settings?.enabled ?? false} className="h-4 w-4" />
            {t('settings.eta.enableLabel')}
          </label>

          <div className="flex items-center gap-3 rounded-md bg-secondary/40 p-3 text-xs text-muted-foreground">
            <ShieldCheck className="h-4 w-4 shrink-0" />
            {t('settings.eta.signingNote')}
          </div>

          <Button type="submit" disabled={pending}>
            {pending && <Loader2 className="h-4 w-4 animate-spin" />} {t('settings.eta.save')}
          </Button>
        </form>
      </CardContent>
    </Card>
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
