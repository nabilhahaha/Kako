'use client';

import { useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  Database,
  Upload,
  ListChecks,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  PlayCircle,
  FileDown,
  RotateCcw,
  ArrowRight,
  ArrowLeft,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useI18n } from '@/lib/i18n/provider';
import { INTL_LOCALE } from '@/lib/i18n/config';
import { formatDate, cn } from '@/lib/utils';
import { parseFile } from '@/lib/erp/import-parse';
import { validateImport, runImport, type RowIssue } from './actions';
import type { ImportMode } from '@/lib/erp/entities';

/** ── Generic, registry-driven Import Engine wizard ─────────────────────────
 *  Drives a CSV/JSON import for ANY importable entity. Nothing is entity-
 *  specific here — the selected EntityDescriptor + its fields drive the mapping,
 *  validation and preview. Server actions enforce permissions + multi-tenancy. */

export interface ImportEntityField {
  key: string;
  labelAr: string;
  labelEn: string;
  type?: 'text' | 'number' | 'date' | 'email' | 'boolean' | 'ref';
  required?: boolean;
}
export interface ImportEntity {
  key: string;
  labelAr: string;
  labelEn: string;
  fields: ImportEntityField[];
}
export interface ImportJobRow {
  id: string;
  target_entity: string;
  file_name: string;
  status: string;
  total_rows: number | null;
  success_rows: number | null;
  failed_rows: number | null;
  created_at: string;
  completed_at: string | null;
}

type Step = 'entity' | 'upload' | 'mapping' | 'validate' | 'import' | 'done';
const STEP_ORDER: Step[] = ['entity', 'upload', 'mapping', 'validate', 'import', 'done'];
const IGNORE = '__ignore__';
const PREVIEW_LIMIT = 50;

type Row = Record<string, string>;

/** Trigger a client-side CSV download. */
function downloadCsv(filename: string, rows: string[][]) {
  const esc = (v: string) => {
    const s = String(v ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = rows.map((r) => r.map(esc).join(',')).join('\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function ImportWizard({
  importableEntities,
  history,
}: {
  importableEntities: ImportEntity[];
  history: ImportJobRow[];
}) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<Step>('entity');
  const [entityKey, setEntityKey] = useState<string>('');
  const [fileName, setFileName] = useState<string>('');
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});

  const [mode, setMode] = useState<ImportMode>('insert');
  const [validating, setValidating] = useState(false);
  const [validation, setValidation] = useState<{
    issues: RowIssue[];
    validRows: number;
    errorRows: number;
    warningRows: number;
  } | null>(null);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{
    success: number;
    failed: number;
    skipped: number;
    total: number;
    issues: RowIssue[];
  } | null>(null);

  const MODES: ImportMode[] = ['insert', 'update', 'upsert', 'skip'];

  const label = (e: { labelAr: string; labelEn: string }) => (locale === 'ar' ? e.labelAr : e.labelEn);
  const entity = useMemo(
    () => importableEntities.find((e) => e.key === entityKey) ?? null,
    [importableEntities, entityKey],
  );
  const entityByKey = useMemo(
    () => new Map(importableEntities.map((e) => [e.key, e])),
    [importableEntities],
  );

  /** Build the mapped rows (fieldKey → value) from the source rows + mapping. */
  const mappedRows = useMemo<Row[]>(() => {
    if (!entity) return [];
    return rows.map((r) =>
      Object.fromEntries(
        entity.fields.map((f) => {
          const src = mapping[f.key];
          return [f.key, src && src !== IGNORE ? r[src] ?? '' : ''];
        }),
      ),
    );
  }, [entity, rows, mapping]);

  const stepIndex = STEP_ORDER.indexOf(step);

  function goEntity(key: string) {
    setEntityKey(key);
    // reset downstream state when entity changes
    setHeaders([]);
    setRows([]);
    setFileName('');
    setMapping({});
    setValidation(null);
    setResult(null);
  }

  async function onFile(file: File | null) {
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = parseFile(file.name, text);
      setFileName(file.name);
      setHeaders(parsed.headers);
      setRows(parsed.rows);
      setValidation(null);
      setResult(null);
      // auto-guess mapping
      autoMap(parsed.headers);
      toast.success(t('import.toast.parsed', { count: parsed.rows.length }));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('import.toast.parseError'));
    }
  }

  /** Case-insensitive guess of header → field by key/labelEn/labelAr. */
  function autoMap(hdrs: string[]) {
    if (!entity) return;
    const norm = (s: string) => s.trim().toLowerCase();
    const byNorm = new Map(hdrs.map((h) => [norm(h), h]));
    const next: Record<string, string> = {};
    for (const f of entity.fields) {
      const candidates = [f.key, f.labelEn, f.labelAr].map(norm);
      const hit = candidates.map((c) => byNorm.get(c)).find(Boolean);
      next[f.key] = hit ?? IGNORE;
    }
    setMapping(next);
  }

  function downloadTemplate() {
    if (!entity) return;
    downloadCsv(`${entity.key}-template.csv`, [entity.fields.map((f) => f.key)]);
  }

  async function doValidate() {
    if (!entity) return;
    setValidating(true);
    try {
      const res = await validateImport(entity.key, mappedRows);
      if (!res.ok || !res.data) {
        toast.error(res.error ?? t('import.toast.validateError'));
        return;
      }
      setValidation({
        issues: res.data.issues,
        validRows: res.data.validRows,
        errorRows: res.data.errorRows,
        warningRows: res.data.warningRows,
      });
      toast.success(t('import.toast.validated'));
    } catch {
      toast.error(t('import.toast.validateError'));
    } finally {
      setValidating(false);
    }
  }

  async function doImport() {
    if (!entity) return;
    setImporting(true);
    try {
      const res = await runImport(entity.key, fileName, mapping, mappedRows, mode);
      if (!res.ok || !res.data) {
        toast.error(res.error ?? t('import.toast.importError'));
        return;
      }
      setResult({
        success: res.data.success,
        failed: res.data.failed,
        skipped: res.data.skipped,
        total: res.data.total,
        issues: res.data.issues,
      });
      setStep('done');
      toast.success(t('import.toast.imported'));
      router.refresh();
    } catch {
      toast.error(t('import.toast.importError'));
    } finally {
      setImporting(false);
    }
  }

  function exportErrors() {
    if (!entity || !result || result.issues.length === 0) return;
    const header = [
      t('import.run.errorRowCol'),
      t('import.run.errorSeverityCol'),
      t('import.run.errorMsgCol'),
    ];
    const issueRows = result.issues.map((i) => [
      String(i.row),
      t(`import.severity.${i.severity}`),
      i.message,
    ]);
    downloadCsv(`${entity.key}-import-report.csv`, [header, ...issueRows]);
  }

  function reset() {
    setStep('entity');
    setEntityKey('');
    setHeaders([]);
    setRows([]);
    setFileName('');
    setMapping({});
    setValidation(null);
    setResult(null);
  }

  // ── step gates ──
  function next() {
    if (step === 'entity') {
      if (!entityKey) return toast.error(t('import.toast.selectEntity'));
      return setStep('upload');
    }
    if (step === 'upload') {
      if (rows.length === 0) return toast.error(t('import.toast.uploadFirst'));
      return setStep('mapping');
    }
    if (step === 'mapping') return setStep('validate');
    if (step === 'validate') {
      if (!validation) return toast.error(t('import.toast.validateFirst'));
      return setStep('import');
    }
  }
  function back() {
    const i = stepIndex;
    if (i > 0 && step !== 'done') setStep(STEP_ORDER[i - 1]);
  }

  const statusVariant = (s: string): 'success' | 'destructive' | 'warning' =>
    s === 'completed' ? 'success' : s === 'failed' ? 'destructive' : 'warning';
  const statusLabel = (s: string) =>
    s === 'completed' || s === 'failed' || s === 'pending' ? t(`import.status.${s}`) : s;

  return (
    <div className="space-y-6">
      {/* Stepper */}
      <div className="flex flex-wrap items-center gap-2">
        {STEP_ORDER.map((s, i) => (
          <div key={s} className="flex items-center gap-2">
            <div
              className={cn(
                'flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium',
                i === stepIndex
                  ? 'border-primary bg-primary text-primary-foreground'
                  : i < stepIndex
                    ? 'border-success/40 bg-success/10 text-success'
                    : 'border-input text-muted-foreground',
              )}
            >
              <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-background/20 text-[11px]">
                {i + 1}
              </span>
              {t(`import.steps.${s}`)}
            </div>
            {i < STEP_ORDER.length - 1 && (
              <span className="text-muted-foreground rtl:rotate-180">›</span>
            )}
          </div>
        ))}
      </div>

      <Card>
        <CardContent className="p-6 space-y-6">
          {/* Step: Select Entity */}
          {step === 'entity' && (
            <div className="space-y-4">
              <h2 className="flex items-center gap-2 text-base font-semibold">
                <Database className="h-4 w-4" /> {t('import.entity.title')}
              </h2>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {importableEntities.map((e) => (
                  <button
                    key={e.key}
                    type="button"
                    onClick={() => goEntity(e.key)}
                    className={cn(
                      'rounded-lg border p-4 text-start transition-colors hover:border-primary/60 hover:bg-secondary/40',
                      entityKey === e.key ? 'border-primary bg-primary/5' : 'border-input',
                    )}
                  >
                    <div className="font-medium">{label(e)}</div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {t('import.entity.fieldsCount', { count: e.fields.length })}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Step: Upload */}
          {step === 'upload' && (
            <div className="space-y-4">
              <h2 className="flex items-center gap-2 text-base font-semibold">
                <Upload className="h-4 w-4" /> {t('import.upload.title')}
              </h2>
              <p className="text-sm text-muted-foreground">{t('import.upload.hint')}</p>
              <div className="space-y-2">
                <Label htmlFor="import-file">{t('import.upload.fileLabel')}</Label>
                <Input
                  id="import-file"
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,.json,.txt"
                  onChange={(ev) => onFile(ev.target.files?.[0] ?? null)}
                />
              </div>
              {fileName ? (
                <p className="text-sm">
                  <span className="font-medium">{fileName}</span>
                  {' — '}
                  {t('import.upload.rowsLoaded', { count: rows.length })}
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">{t('import.upload.noFile')}</p>
              )}
            </div>
          )}

          {/* Step: Mapping */}
          {step === 'mapping' && entity && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="flex items-center gap-2 text-base font-semibold">
                  <ListChecks className="h-4 w-4" /> {t('import.mapping.title')}
                </h2>
                <Button variant="outline" size="sm" onClick={downloadTemplate}>
                  <FileDown className="h-4 w-4" /> {t('import.mapping.downloadTemplate')}
                </Button>
              </div>
              <div className="overflow-x-auto rounded-lg border">
                <table className="w-full text-sm">
                  <thead className="bg-secondary/50 text-muted-foreground">
                    <tr>
                      <th className="px-4 py-2 text-start font-medium">{t('import.mapping.field')}</th>
                      <th className="px-4 py-2 text-start font-medium">{t('import.mapping.column')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {entity.fields.map((f) => (
                      <tr key={f.key} className="border-t">
                        <td className="px-4 py-2">
                          <span className="font-medium">{label(f)}</span>
                          {f.required && (
                            <Badge variant="warning" className="ms-2">
                              {t('import.mapping.required')}
                            </Badge>
                          )}
                          <div className="text-xs text-muted-foreground">{f.key}</div>
                        </td>
                        <td className="px-4 py-2">
                          <select
                            className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                            value={mapping[f.key] ?? IGNORE}
                            onChange={(ev) =>
                              setMapping((m) => ({ ...m, [f.key]: ev.target.value }))
                            }
                          >
                            <option value={IGNORE}>{t('import.mapping.ignore')}</option>
                            {headers.map((h) => (
                              <option key={h} value={h}>
                                {h}
                              </option>
                            ))}
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Step: Validate & Preview */}
          {step === 'validate' && entity && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="flex items-center gap-2 text-base font-semibold">
                  <ListChecks className="h-4 w-4" /> {t('import.validate.title')}
                </h2>
                <Button onClick={doValidate} disabled={validating} variant="outline" size="sm">
                  <PlayCircle className="h-4 w-4" /> {t('import.validate.run')}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">{t('import.validate.dryRunNote')}</p>

              {validation && (
                <>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <div className="rounded-lg border p-3 text-center">
                      <div className="text-xs text-muted-foreground">{t('import.validate.summary.total')}</div>
                      <div className="text-xl font-semibold">{rows.length}</div>
                    </div>
                    <div className="rounded-lg border p-3 text-center">
                      <div className="text-xs text-muted-foreground">{t('import.validate.summary.valid')}</div>
                      <div className="text-xl font-semibold text-success">{validation.validRows}</div>
                    </div>
                    <div className="rounded-lg border p-3 text-center">
                      <div className="text-xs text-muted-foreground">{t('import.validate.summary.warnings')}</div>
                      <div className="text-xl font-semibold text-warning">{validation.warningRows}</div>
                    </div>
                    <div className="rounded-lg border p-3 text-center">
                      <div className="text-xs text-muted-foreground">{t('import.validate.summary.errors')}</div>
                      <div className="text-xl font-semibold text-destructive">{validation.errorRows}</div>
                    </div>
                  </div>

                  <div className="text-sm font-medium">
                    {t('import.validate.previewTitle', { count: Math.min(PREVIEW_LIMIT, mappedRows.length) })}
                  </div>
                  <div className="overflow-x-auto rounded-lg border">
                    <table className="w-full text-sm">
                      <thead className="bg-secondary/50 text-muted-foreground">
                        <tr>
                          <th className="px-3 py-2 text-start font-medium">{t('import.validate.rowCol')}</th>
                          <th className="px-3 py-2 text-start font-medium">{t('import.validate.statusCol')}</th>
                          {entity.fields.map((f) => (
                            <th key={f.key} className="px-3 py-2 text-start font-medium whitespace-nowrap">
                              {label(f)}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {mappedRows.slice(0, PREVIEW_LIMIT).map((r, i) => {
                          const rowIssues = validation.issues.filter((e) => e.row === i + 1);
                          const hasError = rowIssues.some((e) => e.severity === 'error');
                          const hasWarn = !hasError && rowIssues.some((e) => e.severity === 'warning');
                          return (
                            <tr key={i} className="border-t">
                              <td className="px-3 py-2 text-muted-foreground">{i + 1}</td>
                              <td className="px-3 py-2">
                                {hasError ? (
                                  <span className="inline-flex items-center gap-1">
                                    <Badge variant="destructive">
                                      <XCircle className="me-1 h-3 w-3" />
                                      {t('import.validate.statusError')}
                                    </Badge>
                                    <span className="text-xs text-destructive">
                                      {rowIssues.map((e) => e.message).join('; ')}
                                    </span>
                                  </span>
                                ) : hasWarn ? (
                                  <span className="inline-flex items-center gap-1">
                                    <Badge variant="warning">
                                      <AlertTriangle className="me-1 h-3 w-3" />
                                      {t('import.validate.statusWarning')}
                                    </Badge>
                                    <span className="text-xs text-warning">
                                      {rowIssues.map((e) => e.message).join('; ')}
                                    </span>
                                  </span>
                                ) : (
                                  <Badge variant="success">
                                    <CheckCircle2 className="me-1 h-3 w-3" />
                                    {t('import.validate.statusValid')}
                                  </Badge>
                                )}
                              </td>
                              {entity.fields.map((f) => (
                                <td key={f.key} className="px-3 py-2 whitespace-nowrap">
                                  {r[f.key]}
                                </td>
                              ))}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Step: Import */}
          {step === 'import' && entity && (
            <div className="space-y-4">
              <h2 className="flex items-center gap-2 text-base font-semibold">
                <Upload className="h-4 w-4" /> {t('import.run.title')}
              </h2>
              {validation && (
                <div className="grid grid-cols-3 gap-3">
                  <div className="rounded-lg border p-3 text-center">
                    <div className="text-xs text-muted-foreground">{t('import.validate.summary.total')}</div>
                    <div className="text-xl font-semibold">{rows.length}</div>
                  </div>
                  <div className="rounded-lg border p-3 text-center">
                    <div className="text-xs text-muted-foreground">{t('import.validate.summary.valid')}</div>
                    <div className="text-xl font-semibold text-success">{validation.validRows}</div>
                  </div>
                  <div className="rounded-lg border p-3 text-center">
                    <div className="text-xs text-muted-foreground">{t('import.validate.summary.errors')}</div>
                    <div className="text-xl font-semibold text-destructive">{validation.errorRows}</div>
                  </div>
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="import-mode">{t('import.mode.label')}</Label>
                <select
                  id="import-mode"
                  className="h-10 w-full max-w-xs rounded-md border border-input bg-background px-2 text-sm"
                  value={mode}
                  onChange={(ev) => setMode(ev.target.value as ImportMode)}
                >
                  {MODES.map((m) => (
                    <option key={m} value={m}>
                      {t(`import.mode.${m}`)}
                    </option>
                  ))}
                </select>
              </div>
              <p className="text-xs text-muted-foreground">{t('import.validate.warningsNote')}</p>
              <Button
                onClick={doImport}
                disabled={importing || !validation || validation.validRows === 0}
              >
                <PlayCircle className="h-4 w-4" />
                {importing ? t('import.run.importing') : t('import.run.start')}
              </Button>
            </div>
          )}

          {/* Step: Done */}
          {step === 'done' && result && (
            <div className="space-y-4">
              <h2 className="flex items-center gap-2 text-base font-semibold">
                <CheckCircle2 className="h-5 w-5 text-success" /> {t('import.done.title')}
              </h2>
              <div className="grid grid-cols-2 gap-3 sm:max-w-2xl sm:grid-cols-4">
                <div className="rounded-lg border p-3 text-center">
                  <div className="text-xs text-muted-foreground">{t('import.validate.summary.valid')}</div>
                  <div className="text-xl font-semibold text-success">{result.success}</div>
                </div>
                <div className="rounded-lg border p-3 text-center">
                  <div className="text-xs text-muted-foreground">{t('import.validate.summary.errors')}</div>
                  <div className="text-xl font-semibold text-destructive">{result.failed}</div>
                </div>
                <div className="rounded-lg border p-3 text-center">
                  <div className="text-xs text-muted-foreground">{t('import.done.skipped')}</div>
                  <div className="text-xl font-semibold text-muted-foreground">{result.skipped}</div>
                </div>
                <div className="rounded-lg border p-3 text-center">
                  <div className="text-xs text-muted-foreground">{t('import.validate.summary.total')}</div>
                  <div className="text-xl font-semibold">{result.total}</div>
                </div>
              </div>
              <p className="text-sm text-muted-foreground">{t('import.done.message')}</p>
              <div className="flex flex-wrap gap-2">
                {result.issues.length > 0 && (
                  <Button variant="outline" onClick={exportErrors}>
                    <FileDown className="h-4 w-4" /> {t('import.run.exportErrors')}
                  </Button>
                )}
                <Button variant="secondary" onClick={reset}>
                  <RotateCcw className="h-4 w-4" /> {t('import.done.again')}
                </Button>
              </div>
            </div>
          )}

          {/* Nav buttons (hidden on done) */}
          {step !== 'done' && (
            <div className="flex items-center justify-between border-t pt-4">
              <Button variant="ghost" onClick={back} disabled={stepIndex === 0}>
                <ArrowLeft className="h-4 w-4 rtl:rotate-180" /> {t('import.actions.back')}
              </Button>
              {step !== 'import' && (
                <Button onClick={next}>
                  {t('import.actions.next')} <ArrowRight className="h-4 w-4 rtl:rotate-180" />
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Import History */}
      <Card>
        <CardContent className="p-6 space-y-4">
          <h2 className="text-base font-semibold">{t('import.history.title')}</h2>
          {history.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('import.history.empty')}</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead className="bg-secondary/50 text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2 text-start font-medium">{t('import.history.file')}</th>
                    <th className="px-4 py-2 text-start font-medium">{t('import.history.entity')}</th>
                    <th className="px-4 py-2 text-start font-medium">{t('import.history.status')}</th>
                    <th className="px-4 py-2 text-end font-medium">{t('import.history.total')}</th>
                    <th className="px-4 py-2 text-end font-medium">{t('import.history.success')}</th>
                    <th className="px-4 py-2 text-end font-medium">{t('import.history.failed')}</th>
                    <th className="px-4 py-2 text-start font-medium">{t('import.history.date')}</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((h) => {
                    const ent = entityByKey.get(h.target_entity);
                    return (
                      <tr key={h.id} className="border-t">
                        <td className="px-4 py-2">{h.file_name}</td>
                        <td className="px-4 py-2">{ent ? label(ent) : h.target_entity}</td>
                        <td className="px-4 py-2">
                          <Badge variant={statusVariant(h.status)}>{statusLabel(h.status)}</Badge>
                        </td>
                        <td className="px-4 py-2 text-end">{h.total_rows ?? 0}</td>
                        <td className="px-4 py-2 text-end text-success">{h.success_rows ?? 0}</td>
                        <td className="px-4 py-2 text-end text-destructive">{h.failed_rows ?? 0}</td>
                        <td className="px-4 py-2 whitespace-nowrap">
                          {formatDate(h.created_at, INTL_LOCALE[locale])}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
