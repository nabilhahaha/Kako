'use client';

import { useState, useRef, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Plus, X, Search, Loader2 } from 'lucide-react';
import { searchClinicalReference, type ReferenceItem } from './reference-actions';
import { useI18n } from '@/lib/i18n/provider';

/** Multi-item clinical field with autocomplete from the reference list (drugs /
 *  lab / radiology). The doctor can add several items, pick from suggestions, or
 *  type anything manually. Serializes to a newline-joined value under `name` so
 *  it stays compatible with the plain-text prescription/tests columns. */
/** Common dosage / usage instructions a doctor appends to a prescription line.
 *  Value is the Arabic text appended after the drug; label shown in the menu. */
export const DOSAGE_OPTIONS = [
  'مرة يومياً',
  'مرتين يومياً',
  '٣ مرات يومياً',
  '٤ مرات يومياً',
  'كل ٨ ساعات',
  'كل ١٢ ساعة',
  'قبل الأكل',
  'بعد الأكل',
  'على الريق',
  'قبل النوم',
  'عند اللزوم',
];

export function ClinicalListField({
  name,
  kinds,
  defaultValue = '',
  searchPlaceholder,
  manualLabel,
  itemPlaceholder,
  withDosage = false,
}: {
  name: string;
  kinds: string[];
  defaultValue?: string;
  searchPlaceholder?: string;
  manualLabel?: string;
  itemPlaceholder?: string;
  /** Show a quick dosage/usage picker on each line (for prescriptions). */
  withDosage?: boolean;
}) {
  const { t } = useI18n();
  const resolvedManualLabel = manualLabel ?? t('clinic.listField.manualLabel');

  const kindsKey = kinds.join(',');
  const [lines, setLines] = useState<string[]>(() =>
    defaultValue.split('\n').map((s) => s.trim()).filter(Boolean),
  );
  const [q, setQ] = useState('');
  const [results, setResults] = useState<ReferenceItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) { setResults([]); setOpen(false); setLoading(false); return; }
    setLoading(true);
    const timer = setTimeout(async () => {
      const r = await searchClinicalReference(kindsKey.split(','), term);
      setResults(r);
      setOpen(true);
      setLoading(false);
    }, 250);
    return () => clearTimeout(timer);
  }, [q, kindsKey]);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  function addLine(text: string) {
    const trimmed = text.trim();
    if (!trimmed) return;
    setLines((ls) => [...ls, trimmed]);
    setQ('');
    setResults([]);
    setOpen(false);
  }

  return (
    <div className="space-y-2">
      <input type="hidden" name={name} value={lines.join('\n')} />

      {lines.length > 0 && (
        <ul className="space-y-1">
          {lines.map((l, i) => (
            <li key={i} className="flex items-center gap-2">
              <span className="w-5 text-center text-xs text-muted-foreground">{i + 1}.</span>
              <Input
                value={l}
                onChange={(e) => setLines((ls) => ls.map((x, j) => (j === i ? e.target.value : x)))}
                placeholder={itemPlaceholder}
                className="h-9"
              />
              {withDosage && (
                <select
                  value=""
                  onChange={(e) => {
                    const dose = e.target.value;
                    if (!dose) return;
                    setLines((ls) => ls.map((x, j) => (j === i ? `${x.replace(/\s+$/, '')} — ${dose}` : x)));
                  }}
                  title={t('clinic.listField.dosageLabel')}
                  className="h-9 shrink-0 rounded-md border border-input bg-background px-2 text-xs"
                >
                  <option value="">{t('clinic.listField.dosageLabel')}</option>
                  {DOSAGE_OPTIONS.map((d) => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              )}
              <button
                type="button"
                onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))}
                className="rounded-md p-1.5 text-destructive hover:bg-destructive/10"
                aria-label={t('clinic.listField.deleteAriaLabel')}
              >
                <X className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="relative" ref={boxRef}>
        <div className="relative">
          <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); addLine(q); }
            }}
            placeholder={searchPlaceholder}
            className="ps-9"
          />
          {loading && <Loader2 className="absolute end-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />}
        </div>

        {open && results.length > 0 && (
          <ul className="absolute z-30 mt-1 max-h-64 w-full overflow-y-auto rounded-md border bg-popover p-1 shadow-lg">
            {results.map((r, i) => (
              <li key={i}>
                <button
                  type="button"
                  onClick={() => addLine(r.name)}
                  className="flex w-full items-center justify-between gap-2 rounded-md px-3 py-2 text-start text-sm hover:bg-secondary"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium">
                      {r.name}
                      {r.name_ar ? <span className="text-muted-foreground"> — {r.name_ar}</span> : null}
                    </span>
                    {r.detail && <span className="block truncate text-xs text-muted-foreground" dir="ltr">{r.detail}</span>}
                  </span>
                  <Plus className="h-4 w-4 shrink-0 text-muted-foreground" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {q.trim().length >= 2 && (
        <button type="button" onClick={() => addLine(q)} className="text-xs text-primary hover:underline">
          + {resolvedManualLabel}: «{q.trim()}»
        </button>
      )}
    </div>
  );
}
