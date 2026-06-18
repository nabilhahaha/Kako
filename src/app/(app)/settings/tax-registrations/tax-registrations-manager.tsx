'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, Loader2, Receipt, X, Star } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select } from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { EmptyState } from '@/components/shared/empty-state';
import { useI18n } from '@/lib/i18n/provider';
import { TAX_KINDS } from '@/lib/onboarding/tax-registration';
import type { CountryVat } from '@/lib/onboarding/finance';
import {
  saveTaxRegistration, deleteTaxRegistration, type TaxRegistrationRow,
} from '@/lib/onboarding/tax-registration-server';

type Editing = TaxRegistrationRow | 'new' | null;

export function TaxRegistrationsManager({
  registrations,
  countries,
  companyCountry,
}: {
  registrations: TaxRegistrationRow[];
  countries: CountryVat[];
  companyCountry: string | null;
}) {
  const router = useRouter();
  const { t, locale } = useI18n();
  const ar = locale === 'ar';
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState<Editing>(null);

  const countryName = (code: string) => {
    const c = countries.find((x) => x.code === code);
    return c ? (ar ? c.nameAr : c.nameEn) : code;
  };

  function remove(id: string) {
    if (!confirm(t('taxReg.confirmDelete'))) return;
    startTransition(async () => {
      const res = await deleteTaxRegistration({ id });
      if (!res.ok) { toast.error(t(`taxReg.err.${res.error ?? 'generic'}`)); return; }
      toast.success(t('taxReg.toast.deleted'));
      router.refresh();
    });
  }

  return (
    <div className="max-w-3xl space-y-4">
      {editing === null && (
        <Button onClick={() => setEditing('new')}>
          <Plus className="h-4 w-4" /> {t('taxReg.add')}
        </Button>
      )}

      {editing !== null && (
        <Editor
          row={editing === 'new' ? null : editing}
          countries={countries}
          defaultCountry={companyCountry}
          pending={pending}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); router.refresh(); }}
          start={startTransition}
        />
      )}

      {registrations.length === 0 && editing === null ? (
        <EmptyState
          icon={<Receipt />}
          title={t('taxReg.emptyTitle')}
          description={t('taxReg.emptyDescription')}
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {registrations.map((r) => (
            <Card key={r.id}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline">{t(`taxReg.kind.${r.taxKind}`) || r.taxKind.toUpperCase()}</Badge>
                      {r.isDefault && <Badge variant="info" className="gap-1"><Star className="h-3 w-3" />{t('taxReg.default')}</Badge>}
                    </div>
                    <p className="mt-2 font-mono text-sm" dir="ltr">{r.registrationNumber}</p>
                    <p className="text-xs text-muted-foreground">{countryName(r.country)}</p>
                    {(r.effectiveFrom || r.effectiveTo) && (
                      <p className="mt-1 text-xs text-muted-foreground" dir="ltr">
                        {r.effectiveFrom ?? '…'} → {r.effectiveTo ?? '…'}
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 gap-0.5">
                    <button onClick={() => setEditing(r)} className="rounded-md p-1.5 hover:bg-secondary" aria-label={t('taxReg.edit')}>
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button onClick={() => remove(r.id)} className="rounded-md p-1.5 hover:bg-secondary" aria-label={t('taxReg.delete')}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function Editor({
  row, countries, defaultCountry, pending, onClose, onSaved, start,
}: {
  row: TaxRegistrationRow | null;
  countries: CountryVat[];
  defaultCountry: string | null;
  pending: boolean;
  onClose: () => void;
  onSaved: () => void;
  start: React.TransitionStartFunction;
}) {
  const { t, locale } = useI18n();
  const ar = locale === 'ar';
  const [country, setCountry] = useState(row?.country || defaultCountry || '');
  const [taxKind, setTaxKind] = useState(row?.taxKind || 'vat');
  const [number, setNumber] = useState(row?.registrationNumber || '');
  const [isDefault, setIsDefault] = useState(row?.isDefault ?? false);
  const [from, setFrom] = useState(row?.effectiveFrom || '');
  const [to, setTo] = useState(row?.effectiveTo || '');

  function save() {
    start(async () => {
      const res = await saveTaxRegistration({
        id: row?.id, country: country || null, taxKind, registrationNumber: number,
        isDefault, effectiveFrom: from || null, effectiveTo: to || null,
      });
      if (!res.ok) { toast.error(t(`taxReg.err.${res.error ?? 'generic'}`)); return; }
      toast.success(t('taxReg.toast.saved'));
      onSaved();
    });
  }

  return (
    <Card className="border-primary/40">
      <CardContent className="space-y-3 p-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">{row ? t('taxReg.editTitle') : t('taxReg.newTitle')}</h3>
          <button onClick={onClose} className="rounded-md p-1 hover:bg-secondary" aria-label={t('taxReg.cancel')}>
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="tr-kind">{t('taxReg.kindLabel')}</Label>
            <Select id="tr-kind" value={taxKind} onChange={(e) => setTaxKind(e.target.value)}>
              {TAX_KINDS.map((k) => <option key={k} value={k}>{t(`taxReg.kind.${k}`)}</option>)}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="tr-country">{t('taxReg.country')}</Label>
            <Select id="tr-country" value={country} onChange={(e) => setCountry(e.target.value)}>
              <option value="">{t('taxReg.selectCountry')}</option>
              {countries.map((c) => <option key={c.code} value={c.code}>{ar ? c.nameAr : c.nameEn}</option>)}
            </Select>
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="tr-number">{t('taxReg.number')}</Label>
            <Input id="tr-number" value={number} dir="ltr" onChange={(e) => setNumber(e.target.value)} placeholder="100200300" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="tr-from">{t('taxReg.from')}</Label>
            <Input id="tr-from" type="date" dir="ltr" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="tr-to">{t('taxReg.to')}</Label>
            <Input id="tr-to" type="date" dir="ltr" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={isDefault} onChange={(e) => setIsDefault(e.target.checked)} className="h-4 w-4" />
          {t('taxReg.setDefault')}
        </label>
        <div className="flex gap-2">
          <Button size="sm" onClick={save} disabled={pending}>
            {pending && <Loader2 className="h-4 w-4 animate-spin" />} {t('taxReg.save')}
          </Button>
          <Button size="sm" variant="outline" onClick={onClose}>{t('taxReg.cancel')}</Button>
        </div>
      </CardContent>
    </Card>
  );
}
