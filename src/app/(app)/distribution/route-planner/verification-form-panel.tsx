'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2, Check, AlertTriangle, ChevronUp, ChevronDown, ClipboardList } from 'lucide-react';
import { useI18n } from '@/lib/i18n/provider';
import { getFvVerificationForm, saveFvVerificationForm, resetFvVerificationForm } from './rp-verification-form-actions';
import type { ResolvedFvField } from './fv-verification-form';

type Msg = { tone: 'ok' | 'err'; text: string } | null;

/**
 * FV Setup → Verification form (Form Builder Phase 1, admin editor). Configure the EXISTING
 * verification fields — show/hide, required/optional, order, AR/EN label, help — plus the
 * form-level GPS/radius lock. Reuses the resolveFvForm config the rep form consumes (no drift).
 * Core fields (city/channel/outside photo) default visible+required but may be relaxed with a
 * warning. Writes the form DEFINITION only (no verification rows / customers / photos).
 * The live mobile PREVIEW arrives in the follow-up PR (2b).
 */
export function VerificationFormPanel() {
  const { t } = useI18n();
  const [fields, setFields] = useState<ResolvedFvField[]>([]);
  const [requireGps, setRequireGps] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await getFvVerificationForm();
    if (res.ok) { setFields(res.data.fields); setRequireGps(res.data.requireGps); }
    setLoading(false);
  }, []);
  useEffect(() => { void load(); }, [load]);

  function patch(key: string, p: Partial<ResolvedFvField>) {
    setFields((fs) => fs.map((f) => (f.key === key ? { ...f, ...p } : f)));
    setMsg(null);
  }
  function move(idx: number, dir: -1 | 1) {
    setFields((fs) => {
      const next = [...fs];
      const j = idx + dir;
      if (j < 0 || j >= next.length) return fs;
      [next[idx], next[j]] = [next[j], next[idx]];
      return next.map((f, i) => ({ ...f, order: i }));
    });
    setMsg(null);
  }

  async function onSave() {
    setSaving(true); setMsg(null);
    const overrides = fields.map((f, i) => ({
      key: f.key, visible: f.visible, required: f.required,
      labelEn: f.labelEn, labelAr: f.labelAr, help: f.help, order: i,
    }));
    const res = await saveFvVerificationForm({ overrides, requireGps });
    setMsg(res.ok ? { tone: 'ok', text: t('rpVerifyAdmin.formSaved') } : { tone: 'err', text: res.error });
    setSaving(false);
  }
  async function onReset() {
    setSaving(true); setMsg(null);
    const res = await resetFvVerificationForm();
    if (res.ok) await load();
    setMsg(res.ok ? null : { tone: 'err', text: res.error });
    setSaving(false);
  }

  return (
    <section id="fv-form" className="scroll-mt-20 rounded-xl border bg-card p-4">
      <h3 className="flex items-center gap-2 text-sm font-bold"><ClipboardList className="h-4 w-4" />{t('rpVerifyAdmin.formTitle')}</h3>
      <p className="mt-1 text-xs text-muted-foreground">{t('rpVerifyAdmin.formHint')}</p>

      {/* form-level GPS / radius lock */}
      <label className="mt-3 flex items-start gap-2 rounded-lg border bg-background p-3">
        <input type="checkbox" className="mt-0.5" checked={requireGps} onChange={(e) => { setRequireGps(e.target.checked); setMsg(null); }} />
        <span>
          <span className="text-sm font-semibold">{t('rpVerifyAdmin.formRequireGps')}</span>
          <span className="block text-[11px] text-muted-foreground">{t('rpVerifyAdmin.formRequireGpsHint')}</span>
        </span>
      </label>

      {msg && (
        <p className={`mt-3 flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${msg.tone === 'ok' ? 'border-emerald-300 bg-emerald-50 text-emerald-700' : 'border-red-300 bg-red-50 text-red-700'}`}>
          {msg.tone === 'ok' ? <Check className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}{msg.text}
        </p>
      )}

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /></div>
      ) : (
        <div className="mt-3 space-y-2">
          {fields.map((f, idx) => {
            const relaxed = f.warnOnRelax && (!f.visible || !f.required);
            return (
              <div key={f.key} className="rounded-lg border p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-sm font-semibold">
                    {t(f.labelKey)}
                    {f.warnOnRelax && <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">core</span>}
                  </div>
                  <div className="flex items-center gap-1">
                    <button type="button" aria-label={t('rpVerifyAdmin.formMoveUp')} onClick={() => move(idx, -1)} disabled={idx === 0}
                      className="flex h-7 w-7 items-center justify-center rounded-md border disabled:opacity-40"><ChevronUp className="h-4 w-4" /></button>
                    <button type="button" aria-label={t('rpVerifyAdmin.formMoveDown')} onClick={() => move(idx, 1)} disabled={idx === fields.length - 1}
                      className="flex h-7 w-7 items-center justify-center rounded-md border disabled:opacity-40"><ChevronDown className="h-4 w-4" /></button>
                  </div>
                </div>

                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2">
                  <label className="inline-flex items-center gap-1.5 text-xs font-medium">
                    <input type="checkbox" checked={f.visible} onChange={(e) => patch(f.key, { visible: e.target.checked, required: e.target.checked ? f.required : false })} />
                    {t('rpVerifyAdmin.formShow')}
                  </label>
                  <label className="inline-flex items-center gap-1.5 text-xs font-medium">
                    <input type="checkbox" checked={f.required} disabled={!f.visible} onChange={(e) => patch(f.key, { required: e.target.checked })} />
                    {t('rpVerifyAdmin.formRequired')}
                  </label>
                  {relaxed && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700">
                      <AlertTriangle className="h-3 w-3" />{t('rpVerifyAdmin.formRelaxWarning')}
                    </span>
                  )}
                </div>

                <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
                  <input value={f.labelEn ?? ''} onChange={(e) => patch(f.key, { labelEn: e.target.value })} placeholder={`${t('rpVerifyAdmin.formLabelEn')} — ${t(f.labelKey)}`}
                    className="h-9 rounded-lg border bg-background px-2 text-sm" />
                  <input value={f.labelAr ?? ''} onChange={(e) => patch(f.key, { labelAr: e.target.value })} placeholder={t('rpVerifyAdmin.formLabelAr')} dir="rtl"
                    className="h-9 rounded-lg border bg-background px-2 text-sm" />
                  <input value={f.help ?? ''} onChange={(e) => patch(f.key, { help: e.target.value })} placeholder={t('rpVerifyAdmin.formHelp')}
                    className="h-9 rounded-lg border bg-background px-2 text-sm" />
                </div>
              </div>
            );
          })}

          <div className="flex flex-wrap items-center gap-2 pt-1">
            <button onClick={() => void onSave()} disabled={saving}
              className="inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-bold text-primary-foreground disabled:opacity-50">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}{saving ? t('rpVerifyAdmin.formSaving') : t('rpVerifyAdmin.formSave')}
            </button>
            <button onClick={() => void onReset()} disabled={saving}
              className="inline-flex h-9 items-center rounded-lg border px-3 text-sm font-semibold disabled:opacity-50">
              {t('rpVerifyAdmin.formResetDefault')}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
