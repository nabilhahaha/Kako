'use client';

import { useMemo, useState } from 'react';
import { Camera, Images, ChevronRight, AlertTriangle, MapPin, Check, Smartphone } from 'lucide-react';
import { useI18n } from '@/lib/i18n/provider';
import { createT } from '@/lib/i18n';
import type { Locale } from '@/lib/i18n/config';
import { resolveFvForm, type ResolvedFvField } from './fv-verification-form';

/**
 * Live rep-form preview (Form Builder Phase 1, PR 2b).
 *
 * A read-only mock of the mobile verification form, rendered from the SAME resolver the rep
 * form consumes: the admin's working field list is converted back to overrides and run through
 * `resolveFvForm`, so visibility, required state, order and relax flags are computed by the
 * exact same logic the rep sees after publish — no drift. Updates instantly as the admin edits.
 *
 * Strictly presentational: no submit, no DB writes, no photo capture, no GPS. The EN/AR toggle
 * lets the admin preview either language without changing the app locale.
 */
export function VerificationFormPreview({
  fields,
  requireGps,
}: {
  fields: ResolvedFvField[];
  requireGps: boolean;
}) {
  const { t, locale } = useI18n();
  const [previewLocale, setPreviewLocale] = useState<Locale>(locale);
  const tp = useMemo(() => createT(previewLocale), [previewLocale]);
  const dir = previewLocale === 'ar' ? 'rtl' : 'ltr';

  // Re-resolve through the rep form's resolver so the preview can never drift from runtime.
  const resolved = useMemo(() => {
    const overrides = fields.map((f, i) => ({
      key: f.key,
      visible: f.visible,
      required: f.required,
      labelEn: f.labelEn,
      labelAr: f.labelAr,
      help: f.help,
      order: i,
    }));
    return resolveFvForm(overrides);
  }, [fields]);

  const visible = resolved.filter((f) => f.visible);
  const label = (f: ResolvedFvField) => {
    const ov = previewLocale === 'ar' ? f.labelAr : f.labelEn;
    return (ov && ov.trim()) || tp(f.labelKey);
  };

  return (
    <section className="rounded-xl border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-bold">
          <Smartphone className="h-4 w-4" />
          {t('rpVerifyAdmin.previewTitle')}
        </h3>
        <div className="inline-flex overflow-hidden rounded-lg border" role="group" aria-label={t('rpVerifyAdmin.previewLang')}>
          {(['en', 'ar'] as const).map((lng) => (
            <button
              key={lng}
              type="button"
              onClick={() => setPreviewLocale(lng)}
              className={`h-7 px-3 text-xs font-bold ${previewLocale === lng ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}
              aria-pressed={previewLocale === lng}
            >
              {lng.toUpperCase()}
            </button>
          ))}
        </div>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{t('rpVerifyAdmin.previewHint')}</p>

      {/* mock phone frame */}
      <div className="mt-3 flex justify-center">
        <div dir={dir} className="w-full max-w-xs rounded-[1.75rem] border-4 border-foreground/10 bg-background p-3 shadow-sm">
          <div className="space-y-3">
            <h4 className="text-base font-extrabold">{tp('rpVerify.title')}</h4>

            {/* GPS / radius gating note (form-level setting) */}
            <div className={`flex items-start gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] ${requireGps ? 'border-emerald-300 bg-emerald-50 text-emerald-700' : 'border-muted bg-muted/40 text-muted-foreground'}`}>
              <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{requireGps ? t('rpVerifyAdmin.previewGpsOn') : t('rpVerifyAdmin.previewGpsOff')}</span>
            </div>

            {visible.length === 0 ? (
              <p className="rounded-lg border border-dashed px-3 py-6 text-center text-xs text-muted-foreground">
                {t('rpVerifyAdmin.previewEmpty')}
              </p>
            ) : (
              visible.map((f) => (
                <PreviewField key={f.key} label={label(f)} required={f.required} help={f.help} relaxed={f.relaxed} relaxText={t('rpVerifyAdmin.formRelaxWarning')}>
                  <PreviewControl fieldKey={f.key} tp={tp} />
                </PreviewField>
              ))
            )}

            {/* disabled submit — preview only */}
            <button
              type="button"
              disabled
              aria-disabled
              className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-primary/60 text-sm font-bold text-primary-foreground"
            >
              <Check className="h-4 w-4" />
              {tp('rpVerify.submit')}
            </button>
            <p className="text-center text-[10px] text-muted-foreground">{t('rpVerifyAdmin.previewNoSubmit')}</p>
          </div>
        </div>
      </div>
    </section>
  );
}

function PreviewField({
  label,
  required,
  help,
  relaxed,
  relaxText,
  children,
}: {
  label: string;
  required?: boolean;
  help?: string | null;
  relaxed?: boolean;
  relaxText: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-1 flex items-center gap-1.5">
        <span className="text-xs font-semibold">{label}</span>
        {required && <span className="text-red-500">*</span>}
        {relaxed && (
          <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold text-amber-700" title={relaxText}>
            <AlertTriangle className="h-2.5 w-2.5" />
          </span>
        )}
      </div>
      {children}
      {help && <span className="mt-1 block text-[10px] text-muted-foreground">{help}</span>}
    </div>
  );
}

/** Read-only control mock per field type. No interaction, no capture. */
function PreviewControl({ fieldKey, tp }: { fieldKey: ResolvedFvField['key']; tp: (k: string) => string }) {
  switch (fieldKey) {
    case 'city':
    case 'channel':
      return (
        <div className="flex h-10 items-center justify-between rounded-xl border bg-muted/20 px-3 text-xs text-muted-foreground">
          <span>{tp('rpVerify.choose')}</span>
          <ChevronRight className="h-4 w-4 rtl:rotate-180" />
        </div>
      );
    case 'outside_photo':
      return (
        <div className="flex h-20 flex-col items-center justify-center gap-1 rounded-xl border border-dashed bg-muted/20 text-muted-foreground">
          <Camera className="h-5 w-5" />
        </div>
      );
    case 'inside_photos':
      return (
        <div className="flex h-20 flex-col items-center justify-center gap-1 rounded-xl border border-dashed bg-muted/20 text-muted-foreground">
          <Images className="h-5 w-5" />
        </div>
      );
    case 'phone':
      return <div className="h-10 rounded-xl border bg-muted/20" />;
    case 'notes':
      return <div className="h-16 rounded-xl border bg-muted/20" />;
    default:
      return <div className="h-10 rounded-xl border bg-muted/20" />;
  }
}
