'use client';

import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Database, Plus, Trash2, Save, Power } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useI18n } from '@/lib/i18n/provider';
import { cn } from '@/lib/utils';
import {
  CUSTOM_FIELD_TYPES, CUSTOM_FIELD_TYPE_LABELS,
  type CustomFieldDef, type CustomFieldType, type CustomFieldOption,
} from '@/lib/erp/custom-fields';
import { createCustomField, updateCustomField, setCustomFieldActive, deleteCustomField } from './actions';

export interface CfEntity { key: string; labelAr: string; labelEn: string }

const NEEDS_OPTIONS = (t: CustomFieldType) => t === 'select' || t === 'multiselect';

/** Parse an options textarea: one per line, `value` or `value|labelAr|labelEn`. */
function parseOptions(text: string): CustomFieldOption[] {
  return text.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => {
    const [value, label_ar, label_en] = l.split('|').map((x) => x?.trim());
    return { value, label_ar: label_ar || undefined, label_en: label_en || undefined };
  }).filter((o) => o.value);
}
const optionsToText = (opts: CustomFieldOption[]) =>
  opts.map((o) => [o.value, o.label_ar, o.label_en].filter(Boolean).join('|')).join('\n');

export function CustomFieldsManager({ entities, fields }: { entities: CfEntity[]; fields: CustomFieldDef[] }) {
  const { t, locale } = useI18n();
  const lbl = (m: { en: string; ar: string }) => (locale === 'ar' ? m.ar : m.en);
  const [entity, setEntity] = useState(entities[0]?.key ?? '');
  const [busy, setBusy] = useState(false);

  // new-field form
  const [fLabelAr, setFLabelAr] = useState('');
  const [fLabelEn, setFLabelEn] = useState('');
  const [fType, setFType] = useState<CustomFieldType>('text');
  const [fRequired, setFRequired] = useState(false);
  const [fOptions, setFOptions] = useState('');

  const entityFields = useMemo(
    () => fields.filter((f) => f.entity === entity).sort((a, b) => a.sort - b.sort),
    [fields, entity],
  );

  async function run(fn: () => Promise<{ ok: boolean; error?: string }>, ok: string) {
    setBusy(true);
    try {
      const r = await fn();
      if (!r.ok) return toast.error(r.error ?? t('customFields.toast.error'));
      toast.success(ok);
    } catch {
      toast.error(t('customFields.toast.error'));
    } finally {
      setBusy(false);
    }
  }

  async function add() {
    if (!fLabelAr.trim()) return toast.error(t('customFields.form.labelRequired'));
    await run(() => createCustomField({
      entity, label_ar: fLabelAr, label_en: fLabelEn || undefined, type: fType,
      required: fRequired, options: NEEDS_OPTIONS(fType) ? parseOptions(fOptions) : [],
      sort: entityFields.length,
    }), t('customFields.toast.created'));
    setFLabelAr(''); setFLabelEn(''); setFType('text'); setFRequired(false); setFOptions('');
  }

  return (
    <div className="space-y-6">
      {/* Entity selector */}
      <Card>
        <CardContent className="p-6 space-y-3">
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <Database className="h-4 w-4" /> {t('customFields.entity.title')}
          </h2>
          <div className="flex flex-wrap gap-2">
            {entities.map((e) => (
              <button key={e.key} type="button" onClick={() => setEntity(e.key)}
                className={cn('rounded-lg border px-4 py-2 text-sm transition-colors hover:border-primary/60',
                  entity === e.key ? 'border-primary bg-primary/5 font-medium' : 'border-input')}>
                {lbl({ en: e.labelEn, ar: e.labelAr })}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Existing fields */}
      <Card>
        <CardContent className="p-6 space-y-4">
          <h2 className="text-base font-semibold">{t('customFields.list.title')}</h2>
          {entityFields.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('customFields.list.empty')}</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead className="bg-secondary/50 text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-start font-medium">{t('customFields.list.label')}</th>
                    <th className="px-3 py-2 text-start font-medium">{t('customFields.list.key')}</th>
                    <th className="px-3 py-2 text-start font-medium">{t('customFields.list.type')}</th>
                    <th className="px-3 py-2 text-start font-medium">{t('customFields.list.required')}</th>
                    <th className="px-3 py-2 text-start font-medium">{t('customFields.list.status')}</th>
                    <th className="px-3 py-2 text-start font-medium">{t('customFields.list.actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {entityFields.map((f) => (
                    <tr key={f.id} className={cn('border-t', !f.is_active && 'opacity-60')}>
                      <td className="px-3 py-2">{locale === 'ar' ? f.label_ar : (f.label_en || f.label_ar)}</td>
                      <td className="px-3 py-2 font-mono text-xs" dir="ltr">{f.key}</td>
                      <td className="px-3 py-2">{lbl(CUSTOM_FIELD_TYPE_LABELS[f.type])}</td>
                      <td className="px-3 py-2">{f.required ? <Badge variant="warning">{t('customFields.list.required')}</Badge> : '—'}</td>
                      <td className="px-3 py-2">
                        <Badge variant={f.is_active ? 'success' : 'secondary'}>
                          {f.is_active ? t('customFields.status.active') : t('customFields.status.inactive')}
                        </Badge>
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-1">
                          <Button size="sm" variant="outline" disabled={busy}
                            onClick={() => run(() => setCustomFieldActive(f.id, !f.is_active), t('customFields.toast.saved'))}>
                            <Power className="h-3.5 w-3.5" />
                          </Button>
                          <Button size="sm" variant="outline" disabled={busy}
                            onClick={() => run(() => deleteCustomField(f.id), t('customFields.toast.deleted'))}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add field */}
      <Card>
        <CardContent className="p-6 space-y-4">
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <Plus className="h-4 w-4" /> {t('customFields.form.title')}
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1.5">
              <Label htmlFor="cf-ar">{t('customFields.form.labelAr')}</Label>
              <Input id="cf-ar" value={fLabelAr} onChange={(e) => setFLabelAr(e.target.value)} dir="rtl" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cf-en">{t('customFields.form.labelEn')}</Label>
              <Input id="cf-en" value={fLabelEn} onChange={(e) => setFLabelEn(e.target.value)} dir="ltr" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cf-type">{t('customFields.form.type')}</Label>
              <select id="cf-type" value={fType} onChange={(e) => setFType(e.target.value as CustomFieldType)}
                className="h-10 w-full rounded-md border border-input bg-background px-2 text-sm">
                {CUSTOM_FIELD_TYPES.map((ty) => <option key={ty} value={ty}>{lbl(CUSTOM_FIELD_TYPE_LABELS[ty])}</option>)}
              </select>
            </div>
            <div className="flex items-end">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" className="h-4 w-4" checked={fRequired} onChange={(e) => setFRequired(e.target.checked)} />
                {t('customFields.form.required')}
              </label>
            </div>
          </div>
          {NEEDS_OPTIONS(fType) && (
            <div className="space-y-1.5">
              <Label htmlFor="cf-opts">{t('customFields.form.options')}</Label>
              <textarea id="cf-opts" value={fOptions} onChange={(e) => setFOptions(e.target.value)}
                rows={4} className="w-full rounded-md border border-input bg-background p-2 text-sm font-mono"
                placeholder={t('customFields.form.optionsHint')} />
            </div>
          )}
          <Button onClick={add} disabled={busy}>
            <Save className="h-4 w-4" /> {t('customFields.form.submit')}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
