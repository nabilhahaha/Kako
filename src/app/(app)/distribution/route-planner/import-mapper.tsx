'use client';

import type { ReactNode } from 'react';
import { Check, AlertTriangle, FileDown } from 'lucide-react';
import { useI18n } from '@/lib/i18n/provider';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

export interface MapperField { key: string; label: string; required?: boolean }
export interface MapperStat { label: string; value: number; tone?: 'ok' | 'warn' | 'bad' }

const toneClass = (t?: MapperStat['tone']) => (t === 'ok' ? 'text-emerald-600' : t === 'warn' ? 'text-amber-600' : t === 'bad' ? 'text-red-600' : '');

/**
 * Shared import-mapping wizard step — the single, consistent UX for EVERY customer/route/
 * territory/hierarchy import across the product (Day Planner, Route Builder, …):
 * preview columns → map fields (auto-detected) → validation summary → confirm. The caller
 * owns the data pipeline (auto-detect, validate, build-entity); this only standardizes the
 * UI so no section reinvents its own import experience.
 */
export function ImportMapper({
  title, fileName, rowCount, headers, records, fields, mapping, onMap,
  stats, requiredOk, warning, canContinue, continueLabel, onBack, onContinue, badge, aside,
}: {
  title: string;
  fileName?: string | null;
  rowCount: number;
  headers: string[];
  records: Record<string, string>[];
  fields: MapperField[];
  mapping: Record<string, string | undefined>;
  onMap: (key: string, header: string | undefined) => void;
  stats: MapperStat[];
  requiredOk: boolean;
  warning?: string;       // shown when requiredOk is false
  canContinue: boolean;
  continueLabel: string;
  onBack: () => void;
  onContinue: () => void;
  badge?: ReactNode;      // e.g. an applied-template chip
  aside?: ReactNode;      // extra right-column content (templates, rejected-rows, …)
}) {
  const { t } = useI18n();
  return (
    <div className="grid min-h-0 flex-1 gap-2 overflow-hidden lg:grid-cols-[minmax(0,1fr)_320px]">
      {/* Left: mapping + preview */}
      <Card className="flex min-h-0 flex-col"><CardContent className="flex min-h-0 flex-1 flex-col gap-3 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-bold">{title}</p>
          {fileName && <span className="truncate text-[11px] text-muted-foreground">{fileName} · {rowCount} {t('dayPlanner.rows')}</span>}
          {badge}
        </div>
        <div className="grid gap-1.5 sm:grid-cols-2">
          {fields.map((f) => {
            const sample = mapping[f.key] ? (records[0]?.[mapping[f.key]!] ?? '') : '';
            return (
              <label key={f.key} className="flex items-center gap-2 rounded border px-2 py-1 text-xs">
                <span className="w-28 shrink-0 font-medium">{f.label}{f.required && <span className="text-red-500"> *</span>}</span>
                <select
                  value={mapping[f.key] ?? ''}
                  onChange={(e) => onMap(f.key, e.target.value || undefined)}
                  className={`h-7 min-w-0 flex-1 rounded border bg-background px-1 text-[11px] ${f.required && !mapping[f.key] ? 'border-red-300' : ''}`}
                >
                  <option value="">{t('dayPlanner.notMapped')}</option>
                  {headers.map((h) => <option key={h} value={h}>{h}</option>)}
                </select>
                {sample && <span className="hidden max-w-[80px] shrink-0 truncate text-[10px] text-muted-foreground sm:inline" dir="ltr" title={sample}>{sample}</span>}
              </label>
            );
          })}
        </div>
        <div className="min-h-0 flex-1 overflow-auto rounded border">
          <table className="w-full text-[11px]">
            <thead className="sticky top-0 bg-muted"><tr>{headers.map((h) => <th key={h} className="whitespace-nowrap px-2 py-1 text-start font-semibold">{h}</th>)}</tr></thead>
            <tbody>{records.slice(0, 8).map((rec, i) => <tr key={i} className="border-t">{headers.map((h) => <td key={h} className="whitespace-nowrap px-2 py-1 text-muted-foreground" dir="ltr">{rec[h]}</td>)}</tr>)}</tbody>
          </table>
        </div>
      </CardContent></Card>

      {/* Right: validation + actions */}
      <Card className="flex min-h-0 flex-col"><CardContent className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3">
        <p className="text-sm font-bold">{t('dayPlanner.validation')}</p>
        {!requiredOk && warning && <p className="flex items-center gap-1.5 rounded bg-amber-50 px-2 py-1.5 text-[11px] text-amber-800"><AlertTriangle className="h-3.5 w-3.5" /> {warning}</p>}
        <div className="space-y-1 text-xs">
          {stats.map((s) => (
            <div key={s.label} className="flex items-center justify-between rounded border px-2 py-1"><span>{s.label}</span><span className={`tabular-nums font-semibold ${toneClass(s.tone)}`} dir="ltr">{s.value}</span></div>
          ))}
        </div>
        {aside}
        <div className="mt-auto flex items-center gap-2 pt-2">
          <Button size="sm" variant="outline" className="flex-1" onClick={onBack}>{t('dayPlanner.back')}</Button>
          <Button size="sm" className="flex-1" disabled={!canContinue} onClick={onContinue}><Check className="h-4 w-4" /> {continueLabel}</Button>
        </div>
      </CardContent></Card>
    </div>
  );
}

/** Small helper for a downloadable-rejected button row (reused by callers that have rejects). */
export function RejectedRowsBar({ count, onView, onDownload, viewing, viewLabel, hideLabel, downloadLabel }: {
  count: number; onView: () => void; onDownload: () => void; viewing: boolean; viewLabel: string; hideLabel: string; downloadLabel: string;
}) {
  if (count === 0) return null;
  return (
    <div className="flex flex-wrap gap-2">
      <button onClick={onView} className="rounded border px-2 py-1 text-[11px] hover:bg-muted">{viewing ? hideLabel : viewLabel}</button>
      <button onClick={onDownload} className="flex items-center gap-1 rounded border px-2 py-1 text-[11px] hover:bg-muted"><FileDown className="h-3 w-3" /> {downloadLabel}</button>
    </div>
  );
}
