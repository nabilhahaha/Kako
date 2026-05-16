import { STANDARD_FIELDS, type StandardFieldKey } from '@/lib/excelParser';
import { Label } from '@/components/ui/label';

interface ColumnMapperProps {
  excelHeaders: string[];
  mapping: Record<StandardFieldKey, string>;
  onChange: (next: Record<StandardFieldKey, string>) => void;
}

const SKIP = '__skip__';

export function ColumnMapper({ excelHeaders, mapping, onChange }: ColumnMapperProps) {
  function setField(field: StandardFieldKey, header: string) {
    onChange({ ...mapping, [field]: header });
  }

  return (
    <div className="space-y-3">
      <p className="text-caption">
        طابق كل حقل في النظام مع العمود المناسب من ملفك (اختر "تجاهل" إن لم يكن متاحًا).
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        {STANDARD_FIELDS.map((f) => (
          <div key={f.key} className="space-y-1.5">
            <Label htmlFor={`map-${f.key}`}>{f.label}</Label>
            <select
              id={`map-${f.key}`}
              value={mapping[f.key] || SKIP}
              onChange={(e) =>
                setField(f.key, e.target.value === SKIP ? '' : e.target.value)
              }
              className="flex h-10 w-full rounded-lg border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value={SKIP}>— تجاهل —</option>
              {excelHeaders.map((h) => (
                <option key={h} value={h}>
                  {h}
                </option>
              ))}
            </select>
          </div>
        ))}
      </div>
    </div>
  );
}
