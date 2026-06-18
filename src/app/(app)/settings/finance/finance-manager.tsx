'use client';

import { useMemo, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Loader2, Save, Percent, Globe, Coins, Receipt } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { useI18n } from '@/lib/i18n/provider';
import {
  currencyOptions, vatRateForCountry, sanitizeTaxNumber, type CountryVat,
} from '@/lib/onboarding/finance';
import { saveCompanyFinance } from '@/lib/onboarding/finance-server';

export function FinanceManager({
  country: initialCountry,
  currency: initialCurrency,
  taxNumber: initialTax,
  countries,
  vatRate: initialVat,
}: {
  country: string | null;
  currency: string | null;
  taxNumber: string | null;
  countries: CountryVat[];
  vatRate: number | null;
}) {
  const { t, locale } = useI18n();
  const ar = locale === 'ar';
  const [pending, startTransition] = useTransition();

  const [country, setCountry] = useState(initialCountry ?? '');
  const [currency, setCurrency] = useState(initialCurrency ?? '');
  const [taxNumber, setTaxNumber] = useState(initialTax ?? '');

  const currencies = useMemo(() => currencyOptions(initialCurrency), [initialCurrency]);
  const vatRate = useMemo(() => vatRateForCountry(countries, country || null), [countries, country]);

  const dirty =
    (country || null) !== (initialCountry || null) ||
    (currency || null) !== (initialCurrency || null) ||
    (sanitizeTaxNumber(taxNumber) || null) !== (initialTax || null);

  function onSave() {
    startTransition(async () => {
      const res = await saveCompanyFinance({
        country: country || null,
        currency: currency || null,
        taxNumber: taxNumber || null,
      });
      if (!res.ok) { toast.error(t(`finance.err.${res.error ?? 'generic'}`)); return; }
      toast.success(t('finance.toast.saved'));
    });
  }

  const countryName = (c: CountryVat) => (ar ? c.nameAr : c.nameEn);

  return (
    <div className="max-w-2xl space-y-4">
      <Card>
        <CardContent className="space-y-4 p-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="fin-country" className="flex items-center gap-1.5">
                <Globe className="h-3.5 w-3.5 text-muted-foreground" /> {t('finance.country')}
              </Label>
              <Select id="fin-country" value={country} onChange={(e) => setCountry(e.target.value)} disabled={pending}>
                <option value="">{t('finance.selectCountry')}</option>
                {countries.map((c) => (
                  <option key={c.code} value={c.code}>{countryName(c)}</option>
                ))}
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="fin-currency" className="flex items-center gap-1.5">
                <Coins className="h-3.5 w-3.5 text-muted-foreground" /> {t('finance.currency')}
              </Label>
              <Select id="fin-currency" value={currency} onChange={(e) => setCurrency(e.target.value)} disabled={pending}>
                <option value="">{t('finance.selectCurrency')}</option>
                {currencies.map((c) => (
                  <option key={c.code} value={c.code}>{c.code} — {ar ? c.nameAr : c.nameEn}</option>
                ))}
              </Select>
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="fin-tax" className="flex items-center gap-1.5">
                <Receipt className="h-3.5 w-3.5 text-muted-foreground" /> {t('finance.taxNumber')}
              </Label>
              <Input
                id="fin-tax"
                value={taxNumber}
                dir="ltr"
                inputMode="numeric"
                placeholder={t('finance.taxNumberPlaceholder')}
                onChange={(e) => setTaxNumber(e.target.value)}
                disabled={pending}
              />
              <p className="text-xs text-muted-foreground">{t('finance.taxNumberHint')}</p>
            </div>
          </div>

          {/* Standard VAT, derived from the chosen country (read-only info). */}
          <div className="flex items-center gap-3 rounded-lg bg-secondary/60 px-4 py-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-background text-muted-foreground">
              <Percent className="h-4 w-4" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">{t('finance.standardVat')}</p>
              <p className="font-semibold">
                {vatRate == null ? t('finance.vatUnknown') : t('finance.vatValue', { rate: vatRate })}
              </p>
            </div>
          </div>

          <Button onClick={onSave} disabled={pending || !dirty}>
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {t('finance.save')}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
