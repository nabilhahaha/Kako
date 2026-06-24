'use client';

import { useMemo, useState } from 'react';
import { Camera, Images, ChevronRight, MapPin, Check, Smartphone, Store, Calendar, Hash, Phone, ToggleLeft, AlignLeft, Type } from 'lucide-react';
import { useI18n } from '@/lib/i18n/provider';
import type { Locale } from '@/lib/i18n/config';
import { visibleFields, fieldLabel, type FormSchema, type FormField } from '@/lib/forms/form-schema';

/**
 * Generic live form preview (Multi-Form Builder). A READ-ONLY mock of the rep runner rendered
 * straight from the working FormSchema — updates instantly as the admin edits. Strictly
 * presentational: no submit, no DB writes, no photo capture, no GPS, no file inputs. The EN/AR
 * toggle previews either language without changing the app locale. Generalizes the FV preview.
 */
export function FormPreview({ schema }: { schema: FormSchema }) {
  const { t, locale } = useI18n();
  const [previewLocale, setPreviewLocale] = useState<Locale>(locale);
  const dir = previewLocale === 'ar' ? 'rtl' : 'ltr';
  const visible = useMemo(() => visibleFields(schema), [schema]);
  const lang: 'ar' | 'en' = previewLocale === 'ar' ? 'ar' : 'en';

  return (
    <section className="rounded-xl border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-bold"><Smartphone className="h-4 w-4" />{t('rpFormBuilder.previewTitle')}</h3>
        <div className="inline-flex overflow-hidden rounded-lg border" role="group" aria-label={t('rpFormBuilder.previewLang')}>
          {(['en', 'ar'] as const).map((lng) => (
            <button key={lng} type="button" onClick={() => setPreviewLocale(lng)}
              className={`h-7 px-3 text-xs font-bold ${previewLocale === lng ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}
              aria-pressed={previewLocale === lng}>
              {lng.toUpperCase()}
            </button>
          ))}
        </div>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{t('rpFormBuilder.previewHint')}</p>

      <div className="mt-3 flex justify-center">
        <div dir={dir} className="w-full max-w-xs rounded-[1.75rem] border-4 border-foreground/10 bg-background p-3 shadow-sm">
          <div className="space-y-3">
            {/* customer link mock */}
            {schema.settings.customerLink !== 'none' && (
              <div className="flex h-10 items-center justify-between rounded-xl border bg-muted/20 px-3 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1.5"><Store className="h-3.5 w-3.5" />{t('rpFormBuilder.previewCustomer')}{schema.settings.customerLink === 'required' && <span className="text-red-500">*</span>}</span>
                <ChevronRight className="h-4 w-4 rtl:rotate-180" />
              </div>
            )}

            {/* GPS / radius note */}
            <div className={`flex items-start gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] ${schema.settings.requireGps ? 'border-emerald-300 bg-emerald-50 text-emerald-700' : 'border-muted bg-muted/40 text-muted-foreground'}`}>
              <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{schema.settings.requireGps ? t('rpFormBuilder.previewGpsOn') : t('rpFormBuilder.previewGpsOff')}</span>
            </div>

            {visible.length === 0 ? (
              <p className="rounded-lg border border-dashed px-3 py-6 text-center text-xs text-muted-foreground">{t('rpFormBuilder.previewEmpty')}</p>
            ) : (
              visible.map((f) => (
                <PreviewField key={f.id} label={fieldLabel(f, lang)} required={f.required} help={f.help}>
                  <PreviewControl f={f} lang={lang} chooseText={t('rpFormBuilder.previewChoose')} />
                </PreviewField>
              ))
            )}

            <button type="button" disabled aria-disabled
              className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-primary/60 text-sm font-bold text-primary-foreground">
              <Check className="h-4 w-4" />{t('rpFormBuilder.previewSubmit')}
            </button>
            <p className="text-center text-[10px] text-muted-foreground">{t('rpFormBuilder.previewNoSubmit')}</p>
          </div>
        </div>
      </div>
    </section>
  );
}

function PreviewField({ label, required, help, children }: { label: string; required?: boolean; help?: string | null; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1 flex items-center gap-1.5">
        <span className="text-xs font-semibold">{label}</span>
        {required && <span className="text-red-500">*</span>}
      </div>
      {children}
      {help && <span className="mt-1 block text-[10px] text-muted-foreground">{help}</span>}
    </div>
  );
}

/** Read-only control mock per field type. No interaction, no capture. */
function PreviewControl({ f, lang, chooseText }: { f: FormField; lang: 'ar' | 'en'; chooseText: string }) {
  switch (f.type) {
    case 'select':
    case 'multiselect':
      return (
        <div className="flex h-10 items-center justify-between rounded-xl border bg-muted/20 px-3 text-xs text-muted-foreground">
          <span>{f.options[0] ? (lang === 'ar' ? f.options[0].labelAr : f.options[0].labelEn) : chooseText}</span>
          <ChevronRight className="h-4 w-4 rtl:rotate-180" />
        </div>
      );
    case 'photo':
      return <div className="flex h-20 items-center justify-center rounded-xl border border-dashed bg-muted/20 text-muted-foreground"><Camera className="h-5 w-5" /></div>;
    case 'photos':
      return <div className="flex h-20 items-center justify-center rounded-xl border border-dashed bg-muted/20 text-muted-foreground"><Images className="h-5 w-5" /></div>;
    case 'textarea':
      return <div className="flex h-16 items-start gap-1.5 rounded-xl border bg-muted/20 p-2 text-muted-foreground"><AlignLeft className="h-3.5 w-3.5" /></div>;
    case 'boolean':
      return <div className="flex h-10 items-center gap-1.5 rounded-xl border bg-muted/20 px-3 text-muted-foreground"><ToggleLeft className="h-4 w-4" /></div>;
    case 'number':
      return <div className="flex h-10 items-center gap-1.5 rounded-xl border bg-muted/20 px-3 text-muted-foreground"><Hash className="h-3.5 w-3.5" /></div>;
    case 'phone':
      return <div className="flex h-10 items-center gap-1.5 rounded-xl border bg-muted/20 px-3 text-muted-foreground"><Phone className="h-3.5 w-3.5" /></div>;
    case 'date':
      return <div className="flex h-10 items-center gap-1.5 rounded-xl border bg-muted/20 px-3 text-muted-foreground"><Calendar className="h-3.5 w-3.5" /></div>;
    default:
      return <div className="flex h-10 items-center gap-1.5 rounded-xl border bg-muted/20 px-3 text-muted-foreground"><Type className="h-3.5 w-3.5" /></div>;
  }
}
