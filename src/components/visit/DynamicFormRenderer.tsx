import { Star, Upload, MapPin } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { useDynamicFields } from '@/hooks/useDynamicForms';
import type { DynamicFormField, DynamicFieldType } from '@/lib/types';
import { cn } from '@/lib/utils';

/* ───────────── types ───────────── */

interface DynamicFormRendererProps {
  formKey: string;
  entityId?: string;
  values: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
  readOnly?: boolean;
}

/* ───────────── field type labels (Arabic) ───────────── */

const SECTION_DEFAULT = 'عام';

/* ───────────── helpers ───────────── */

function groupBySection(fields: DynamicFormField[]) {
  const map = new Map<string, DynamicFormField[]>();
  for (const f of fields) {
    const key = f.section ?? SECTION_DEFAULT;
    const arr = map.get(key) ?? [];
    arr.push(f);
    map.set(key, arr);
  }
  return map;
}

/* ───────────── individual field renderers ───────────── */

interface FieldProps {
  field: DynamicFormField;
  value: unknown;
  onChange: (v: unknown) => void;
  readOnly: boolean;
}

function TextField({ field, value, onChange, readOnly }: FieldProps) {
  if (readOnly) return <ReadOnlyValue value={value} />;
  return (
    <Input
      value={(value as string) ?? ''}
      onChange={(e) => onChange(e.target.value)}
      placeholder={field.label_ar || field.label}
    />
  );
}

function NumberField({ field, value, onChange, readOnly }: FieldProps) {
  if (readOnly) return <ReadOnlyValue value={value} />;
  return (
    <Input
      type="number"
      value={value !== undefined && value !== null ? String(value) : ''}
      onChange={(e) => {
        const v = e.target.value;
        onChange(v === '' ? null : Number(v));
      }}
      placeholder={field.label_ar || field.label}
      dir="ltr"
    />
  );
}

function DropdownField({ field, value, onChange, readOnly }: FieldProps) {
  if (readOnly) {
    const opt = field.options?.find((o) => o.value === value);
    return <ReadOnlyValue value={opt?.label_ar || opt?.label || value} />;
  }
  return (
    <select
      value={(value as string) ?? ''}
      onChange={(e) => onChange(e.target.value || null)}
      className="flex h-10 w-full rounded-lg border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <option value="">-- اختر --</option>
      {field.options?.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label_ar || opt.label}
        </option>
      ))}
    </select>
  );
}

function MultiSelectField({ field, value, onChange, readOnly }: FieldProps) {
  const selected: string[] = Array.isArray(value) ? (value as string[]) : [];

  function toggle(optValue: string) {
    if (selected.includes(optValue)) {
      onChange(selected.filter((v) => v !== optValue));
    } else {
      onChange([...selected, optValue]);
    }
  }

  if (readOnly) {
    const labels = selected
      .map((v) => {
        const opt = field.options?.find((o) => o.value === v);
        return opt?.label_ar || opt?.label || v;
      })
      .join('، ');
    return <ReadOnlyValue value={labels || '—'} />;
  }

  return (
    <div className="flex flex-wrap gap-2">
      {field.options?.map((opt) => {
        const checked = selected.includes(opt.value);
        return (
          <label
            key={opt.value}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm cursor-pointer transition-colors select-none',
              checked
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-border bg-card text-muted-foreground hover:border-primary/40',
            )}
          >
            <input
              type="checkbox"
              checked={checked}
              onChange={() => toggle(opt.value)}
              className="h-3.5 w-3.5 accent-primary"
            />
            {opt.label_ar || opt.label}
          </label>
        );
      })}
    </div>
  );
}

function DateField({ value, onChange, readOnly }: FieldProps) {
  if (readOnly) return <ReadOnlyValue value={value} />;
  return (
    <Input
      type="date"
      value={(value as string) ?? ''}
      onChange={(e) => onChange(e.target.value || null)}
      dir="ltr"
    />
  );
}

function TimeField({ value, onChange, readOnly }: FieldProps) {
  if (readOnly) return <ReadOnlyValue value={value} />;
  return (
    <Input
      type="time"
      value={(value as string) ?? ''}
      onChange={(e) => onChange(e.target.value || null)}
      dir="ltr"
    />
  );
}

function PhotoField({ value, onChange, readOnly }: FieldProps) {
  if (readOnly) {
    if (value) {
      return (
        <p className="text-sm text-muted-foreground">
          تم رفع صورة
        </p>
      );
    }
    return <ReadOnlyValue value="لا توجد صورة" />;
  }

  return (
    <label className="inline-flex items-center gap-2 cursor-pointer rounded-lg border border-dashed border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground hover:border-primary/40 transition-colors">
      <Upload className="h-4 w-4" />
      <span>{value ? 'تغيير الصورة' : 'رفع صورة'}</span>
      <input
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onChange(file);
        }}
      />
    </label>
  );
}

function GPSField({ value, onChange, readOnly }: FieldProps) {
  const coords = value as { lat?: number; lng?: number } | null;

  if (readOnly) {
    if (coords?.lat && coords?.lng) {
      return (
        <p className="text-sm text-muted-foreground flex items-center gap-1">
          <MapPin className="h-3.5 w-3.5" />
          {coords.lat.toFixed(6)}، {coords.lng.toFixed(6)}
        </p>
      );
    }
    return <ReadOnlyValue value="لا يوجد موقع" />;
  }

  return (
    <div className="flex gap-2">
      <Input
        type="number"
        step="any"
        placeholder="خط العرض (lat)"
        value={coords?.lat ?? ''}
        onChange={(e) =>
          onChange({ ...(coords ?? {}), lat: e.target.value ? Number(e.target.value) : undefined })
        }
        dir="ltr"
        className="flex-1"
      />
      <Input
        type="number"
        step="any"
        placeholder="خط الطول (lng)"
        value={coords?.lng ?? ''}
        onChange={(e) =>
          onChange({ ...(coords ?? {}), lng: e.target.value ? Number(e.target.value) : undefined })
        }
        dir="ltr"
        className="flex-1"
      />
    </div>
  );
}

function ToggleField({ value, onChange, readOnly }: FieldProps) {
  const checked = Boolean(value);

  if (readOnly) {
    return <ReadOnlyValue value={checked ? 'نعم' : 'لا'} />;
  }

  return (
    <label className="inline-flex items-center gap-2 cursor-pointer select-none">
      <div
        role="switch"
        aria-checked={checked}
        tabIndex={0}
        onClick={() => onChange(!checked)}
        onKeyDown={(e) => {
          if (e.key === ' ' || e.key === 'Enter') {
            e.preventDefault();
            onChange(!checked);
          }
        }}
        className={cn(
          'relative h-6 w-11 rounded-full transition-colors',
          checked ? 'bg-primary' : 'bg-muted',
        )}
      >
        <div
          className={cn(
            'absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform',
            checked ? 'translate-x-0.5' : 'translate-x-5',
          )}
        />
      </div>
      <span className="text-sm">{checked ? 'نعم' : 'لا'}</span>
    </label>
  );
}

function RatingField({ value, onChange, readOnly }: FieldProps) {
  const rating = typeof value === 'number' ? value : 0;

  return (
    <div className="flex items-center gap-1" dir="ltr">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          disabled={readOnly}
          onClick={() => {
            if (!readOnly) onChange(star === rating ? 0 : star);
          }}
          className={cn(
            'p-0.5 transition-colors',
            readOnly ? 'cursor-default' : 'cursor-pointer hover:scale-110',
          )}
          aria-label={`${star} نجوم`}
        >
          <Star
            className={cn(
              'h-6 w-6',
              star <= rating
                ? 'fill-amber-400 text-amber-400'
                : 'fill-none text-muted-foreground/40',
            )}
          />
        </button>
      ))}
      {rating > 0 && (
        <span className="text-xs text-muted-foreground mr-1">{rating}/5</span>
      )}
    </div>
  );
}

function NotesField({ field, value, onChange, readOnly }: FieldProps) {
  if (readOnly) return <ReadOnlyValue value={value} />;
  return (
    <Textarea
      value={(value as string) ?? ''}
      onChange={(e) => onChange(e.target.value)}
      placeholder={field.label_ar || field.label}
      rows={3}
    />
  );
}

/* ── read-only value display ── */

function ReadOnlyValue({ value }: { value: unknown }) {
  const display =
    value === null || value === undefined || value === ''
      ? '—'
      : String(value);
  return (
    <p className="text-sm text-foreground bg-muted/30 rounded-lg px-3 py-2 min-h-[40px] flex items-center">
      {display}
    </p>
  );
}

/* ── field router ── */

const RENDERERS: Record<DynamicFieldType, React.FC<FieldProps>> = {
  text: TextField,
  number: NumberField,
  dropdown: DropdownField,
  multi_select: MultiSelectField,
  date: DateField,
  time: TimeField,
  photo: PhotoField,
  gps: GPSField,
  toggle: ToggleField,
  rating: RatingField,
  notes: NotesField,
};

/* ───────────── Main Component ───────────── */

export function DynamicFormRenderer({
  formKey,
  entityId: _entityId,
  values,
  onChange,
  readOnly = false,
}: DynamicFormRendererProps) {
  const { data: fields, isLoading } = useDynamicFields(formKey);

  if (isLoading) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="space-y-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-10 w-full" />
          </div>
        ))}
      </div>
    );
  }

  if (!fields?.length) {
    return (
      <p className="text-center text-muted-foreground py-6 border border-dashed rounded-lg">
        لا توجد حقول مُعرّفة لهذا النموذج
      </p>
    );
  }

  const sections = groupBySection(fields);

  return (
    <div className="space-y-6">
      {Array.from(sections.entries()).map(([sectionName, sectionFields]) => (
        <div key={sectionName}>
          {sections.size > 1 && (
            <h3 className="text-sm font-semibold text-muted-foreground mb-3 border-b border-border pb-2">
              {sectionName}
            </h3>
          )}
          <div className="space-y-4">
            {sectionFields.map((field) => {
              const Renderer = RENDERERS[field.field_type];
              if (!Renderer) return null;

              return (
                <div key={field.id} className="space-y-1.5">
                  <Label htmlFor={`df-${field.field_key}`}>
                    {field.label_ar || field.label}
                    {field.is_required && (
                      <span className="text-destructive mr-1">*</span>
                    )}
                  </Label>
                  <Renderer
                    field={field}
                    value={values[field.field_key]}
                    onChange={(v) => onChange(field.field_key, v)}
                    readOnly={readOnly}
                  />
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
