'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Loader2, ClipboardList, ArrowRight, MapPin, Camera } from 'lucide-react';
import { useI18n } from '@/lib/i18n/provider';
import { getMyForms, type MyFormCard } from './rp-myforms-actions';

/**
 * Rep "My Forms" launcher: the published custom forms assigned to the caller. Selecting one
 * opens the generic runner. The Field Verification flow stays at /field-verification/my-customers
 * (unchanged) — this lists custom forms only. Gated by field_verification.verify + the flag.
 */
export function MyFormsPanel() {
  const { t, locale } = useI18n();
  const [forms, setForms] = useState<MyFormCard[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      const res = await getMyForms();
      if (res.ok) setForms(res.data);
      setLoading(false);
    })();
  }, []);

  const name = (f: MyFormCard) => (locale === 'ar' ? f.nameAr : f.nameEn) || (locale === 'ar' ? f.nameEn : f.nameAr) || f.code;

  return (
    <div className="mx-auto max-w-md space-y-3">
      <div>
        <h1 className="flex items-center gap-2 text-lg font-extrabold"><ClipboardList className="h-5 w-5" />{t('rpMyForms.title')}</h1>
        <p className="text-xs text-muted-foreground">{t('rpMyForms.subtitle')}</p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /></div>
      ) : forms.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-2xl border bg-muted/30 p-8 text-center">
          <ClipboardList className="h-10 w-10 text-muted-foreground" />
          <p className="text-sm font-semibold">{t('rpMyForms.empty')}</p>
          <p className="text-xs text-muted-foreground">{t('rpMyForms.emptyHint')}</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {forms.map((f) => (
            <li key={f.id}>
              <Link href={`/field-verification/my-forms/${f.id}`}
                className="flex items-center gap-3 rounded-2xl border bg-card p-3.5 shadow-sm active:scale-[0.99]">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary"><ClipboardList className="h-5 w-5" /></div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold">{name(f)}</p>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
                    <span>{t('rpMyForms.fieldCount', { n: f.fieldCount })}</span>
                    {f.settings.requireGps && <span className="inline-flex items-center gap-0.5"><MapPin className="h-3 w-3" />GPS</span>}
                    {f.settings.customerLink !== 'none' && <span className="inline-flex items-center gap-0.5"><Camera className="h-3 w-3" />{t('rpMyForms.customerLinked')}</span>}
                  </div>
                </div>
                <ArrowRight className="h-5 w-5 shrink-0 text-muted-foreground rtl:rotate-180" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
