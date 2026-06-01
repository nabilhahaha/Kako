'use client';

import { Input } from '@/components/ui/input';
import { useI18n } from '@/lib/i18n/provider';
import type { FieldType } from '@/lib/erp/form-builder';

export interface PreviewField {
  key: string; type: FieldType;
  labelAr: string | null; labelEn: string | null; helpAr: string | null; helpEn: string | null;
  section: string | null; required: boolean; options: { value: string; label: string }[] | null; defaultValue: string | null;
}

const selectCls = 'h-10 w-full rounded-md border border-input bg-background px-3 text-sm';

/** Read-only render of a form's fields — the Live Preview. Reflects saved state
 *  and is also the basis for the real submission renderer (B5). */
export function FormPreview({ fields }: { fields: PreviewField[] }) {
  const { t, locale } = useI18n();
  const lab = (f: PreviewField) => (locale === 'ar' ? f.labelAr || f.labelEn : f.labelEn || f.labelAr) || f.key;
  const help = (f: PreviewField) => (locale === 'ar' ? f.helpAr || f.helpEn : f.helpEn || f.helpAr);
  if (fields.length === 0) return <p className="text-sm text-muted-foreground">{t('forms.preview.empty')}</p>;
  return (
    <div className="space-y-4">
      {fields.map((f) => {
        if (f.type === 'section') return <h4 key={f.key} className="border-b pb-1 pt-2 font-semibold">{lab(f)}</h4>;
        return (
          <div key={f.key} className="space-y-1">
            <label className="text-sm font-medium">{lab(f)}{f.required && <span className="text-destructive"> *</span>}</label>
            <FieldInput f={f} />
            {help(f) && <p className="text-xs text-muted-foreground">{help(f)}</p>}
          </div>
        );
      })}
    </div>
  );
}

function FieldInput({ f }: { f: PreviewField }) {
  const { t } = useI18n();
  switch (f.type) {
    case 'text': return <Input disabled defaultValue={f.defaultValue ?? ''} />;
    case 'number': return <Input type="number" disabled dir="ltr" />;
    case 'date': return <Input type="date" disabled dir="ltr" />;
    case 'dropdown':
      return <select disabled className={selectCls}><option>{t('forms.preview.choose')}</option>{(f.options ?? []).map((o) => <option key={o.value}>{o.label}</option>)}</select>;
    case 'multiselect':
      return <div className="space-y-1">{(f.options ?? []).map((o) => <label key={o.value} className="flex items-center gap-2 text-sm"><input type="checkbox" disabled /> {o.label}</label>)}</div>;
    case 'attachment': case 'image': return <Input type="file" disabled />;
    case 'gps': return <div className="flex gap-2"><Input disabled placeholder="lat" dir="ltr" /><Input disabled placeholder="lng" dir="ltr" /></div>;
    case 'signature': return <div className="flex h-20 items-center justify-center rounded-md border border-dashed text-xs text-muted-foreground">{t('forms.preview.signature')}</div>;
    default: return <Input disabled />;
  }
}
