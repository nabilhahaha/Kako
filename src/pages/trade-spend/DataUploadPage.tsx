import { useState, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useDropzone } from 'react-dropzone';
import * as XLSX from 'xlsx';
import {
  UploadCloud,
  FileSpreadsheet,
  CheckCircle2,
  ChevronRight,
  Save,
  Trash2,
  AlertCircle,
} from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { useTradeSpendStore } from '@/stores/tradeSpendStore';
import type { ColumnMappingConfig, DataUploadSummary } from '@/lib/trade-spend/types';
import { REQUIRED_MAPPING_FIELDS, OPTIONAL_MAPPING_FIELDS } from '@/lib/trade-spend/types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ALL_MAPPING_FIELDS = [...REQUIRED_MAPPING_FIELDS, ...OPTIONAL_MAPPING_FIELDS];

const ACCEPT_TYPES: Record<string, string[]> = {
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
  'application/vnd.ms-excel': ['.xls'],
  'text/csv': ['.csv'],
};

/** Patterns used for fuzzy auto-detection of source columns. */
const AUTO_DETECT_PATTERNS: Record<keyof ColumnMappingConfig, RegExp[]> = {
  customer_account: [
    /cust\s*account/i,
    /customer\s*code/i,
    /account/i,
    /cust\s*code/i,
    /customer\s*account/i,
  ],
  customer_name: [/cust\s*name/i, /customer\s*name/i],
  customer_class: [/class/i, /credit\s*class/i],
  customer_channel: [/channel/i],
  item_id: [/item\s*id/i, /product\s*code/i, /sku/i, /item\s*code/i],
  item_description: [/item\s*desc/i, /product\s*name/i, /item\s*description/i],
  invoice_date: [/invoice\s*date/i, /transaction\s*date/i, /^date$/i],
  invoice_amount: [
    /invoice\s*amount\s*ex\s*vat/i,
    /invoice\s*amount/i,
    /net\s*amount/i,
    /^amount$/i,
    /^value$/i,
  ],
  invoice_qty_cases: [/inv\s*qty\s*cases/i, /quantity/i, /^cases$/i, /^qty$/i],
  is_return: [/is\s*return/i, /^return$/i],
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function autoDetectMapping(headers: string[]): Partial<ColumnMappingConfig> {
  const mapping: Partial<ColumnMappingConfig> = {};
  const used = new Set<string>();

  // For each system field, try each pattern against each header
  for (const field of ALL_MAPPING_FIELDS) {
    const patterns = AUTO_DETECT_PATTERNS[field];
    let matched = false;
    for (const pat of patterns) {
      for (const header of headers) {
        if (!used.has(header) && pat.test(header.trim())) {
          (mapping as Record<string, string>)[field] = header;
          used.add(header);
          matched = true;
          break;
        }
      }
      if (matched) break;
    }
  }

  return mapping;
}

// ---------------------------------------------------------------------------
// Step indicator
// ---------------------------------------------------------------------------

interface StepIndicatorProps {
  current: number;
  labels: string[];
}

function StepIndicator({ current, labels }: StepIndicatorProps) {
  return (
    <div className="flex items-center justify-center gap-1 sm:gap-2">
      {labels.map((label, idx) => {
        const step = idx + 1;
        const isActive = step === current;
        const isComplete = step < current;
        return (
          <div key={step} className="flex items-center gap-1 sm:gap-2">
            <div className="flex items-center gap-1.5">
              <div
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold transition-colors ${
                  isComplete
                    ? 'bg-green-600 text-white'
                    : isActive
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-muted-foreground'
                }`}
              >
                {isComplete ? <CheckCircle2 className="h-4 w-4" /> : step}
              </div>
              <span
                className={`hidden text-sm sm:inline ${
                  isActive ? 'font-semibold text-foreground' : 'text-muted-foreground'
                }`}
              >
                {label}
              </span>
            </div>
            {idx < labels.length - 1 && (
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page component
// ---------------------------------------------------------------------------

export function DataUploadPage() {
  const { t } = useTranslation();
  const { savedMappings, saveMappingConfig, deleteMappingConfig, importRawData } =
    useTradeSpendStore();

  // Step management
  const [step, setStep] = useState(1);

  // File / parse state
  const [file, setFile] = useState<File | null>(null);
  const [sheetName, setSheetName] = useState('');
  const [headers, setHeaders] = useState<string[]>([]);
  const [allRows, setAllRows] = useState<Record<string, unknown>[]>([]);
  const [previewRows, setPreviewRows] = useState<Record<string, unknown>[]>([]);
  const [totalRows, setTotalRows] = useState(0);
  const [parseError, setParseError] = useState('');

  // Mapping state
  const [mapping, setMapping] = useState<Partial<ColumnMappingConfig>>({});
  const [saveName, setSaveName] = useState('');

  // Import result
  const [importSummary, setImportSummary] = useState<DataUploadSummary | null>(null);

  // --------------------------------------------------
  // Step 1 — File upload
  // --------------------------------------------------

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const f = acceptedFiles[0];
    if (!f) return;
    setFile(f);
    setParseError('');

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheet = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheet];
        const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, {
          defval: '',
        });

        if (json.length === 0) {
          setParseError('The file contains no data rows.');
          return;
        }

        const hdrs = Object.keys(json[0]);
        setSheetName(firstSheet);
        setHeaders(hdrs);
        setAllRows(json);
        setPreviewRows(json.slice(0, 10));
        setTotalRows(json.length);

        // Auto-detect mapping
        const detected = autoDetectMapping(hdrs);
        setMapping(detected);

        // Move to mapping step
        setStep(2);
      } catch {
        setParseError('Failed to parse the file. Please check the format.');
      }
    };
    reader.readAsArrayBuffer(f);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: ACCEPT_TYPES,
    multiple: false,
    onDrop,
  });

  // --------------------------------------------------
  // Step 2 — Column mapping
  // --------------------------------------------------

  const updateMapping = useCallback(
    (field: keyof ColumnMappingConfig, value: string) => {
      setMapping((prev) => {
        const next = { ...prev };
        if (value === '') {
          delete next[field];
        } else {
          next[field] = value;
        }
        return next;
      });
    },
    [],
  );

  const loadSavedMapping = useCallback(
    (name: string) => {
      const found = savedMappings.find((m) => m.name === name);
      if (found) {
        // Only keep fields that still exist in current headers
        const filtered: Partial<ColumnMappingConfig> = {};
        for (const [key, val] of Object.entries(found.mapping)) {
          if (headers.includes(val as string)) {
            (filtered as Record<string, string>)[key] = val as string;
          }
        }
        setMapping(filtered);
      }
    },
    [savedMappings, headers],
  );

  const handleSaveMapping = useCallback(() => {
    const name = saveName.trim();
    if (!name) return;
    saveMappingConfig(name, mapping);
    setSaveName('');
  }, [saveName, mapping, saveMappingConfig]);

  const requiredMet = useMemo(
    () => REQUIRED_MAPPING_FIELDS.every((f) => mapping[f]),
    [mapping],
  );

  // --------------------------------------------------
  // Step 3 — Data preview (mapped)
  // --------------------------------------------------

  const mappedFields = useMemo(
    () => ALL_MAPPING_FIELDS.filter((f) => mapping[f]),
    [mapping],
  );

  // --------------------------------------------------
  // Step 4 — Import
  // --------------------------------------------------

  const handleImport = useCallback(() => {
    const result = importRawData(allRows, mapping);
    setImportSummary(result.summary);
    setStep(4);
  }, [allRows, mapping, importRawData]);

  // --------------------------------------------------
  // Reset
  // --------------------------------------------------

  const handleReset = useCallback(() => {
    setStep(1);
    setFile(null);
    setSheetName('');
    setHeaders([]);
    setAllRows([]);
    setPreviewRows([]);
    setTotalRows(0);
    setParseError('');
    setMapping({});
    setSaveName('');
    setImportSummary(null);
  }, []);

  // --------------------------------------------------
  // Render
  // --------------------------------------------------

  const stepLabels = [
    t('upload.selectFile', 'Select File'),
    t('upload.mapColumns', 'Map Columns'),
    t('upload.previewData', 'Preview'),
    t('upload.confirmUpload', 'Import'),
  ];

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 sm:p-6">
      {/* Page title */}
      <h1 className="text-2xl font-bold text-foreground">{t('upload.title', 'Raw Data Upload')}</h1>

      {/* Step indicator */}
      <StepIndicator current={step} labels={stepLabels} />

      {/* ============================================================
          STEP 1 — File Upload
          ============================================================ */}
      {step === 1 && (
        <Card>
          <CardHeader>
            <CardTitle>{t('upload.selectFile', 'Select File')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div
              {...getRootProps()}
              className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-14 text-center transition-colors ${
                isDragActive
                  ? 'border-primary bg-primary/5'
                  : 'border-border bg-card hover:border-primary/40'
              }`}
            >
              <input {...getInputProps()} />
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
                <UploadCloud className="h-6 w-6" />
              </div>
              <p className="mt-4 text-sm font-medium text-foreground">
                {isDragActive
                  ? t('upload.dragDrop', 'Drop the file here')
                  : t('upload.dragDrop', 'Drag & drop your Excel file here, or click to browse')}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">.xlsx, .xls, .csv</p>
            </div>

            {parseError && (
              <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {parseError}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ============================================================
          STEP 2 — Column Mapping
          ============================================================ */}
      {step === 2 && (
        <>
          {/* File info banner */}
          <Card>
            <CardContent className="flex flex-wrap items-center gap-4 py-4">
              <FileSpreadsheet className="h-5 w-5 text-primary" />
              <div className="text-sm">
                <span className="font-medium">{file?.name}</span>
                <span className="mx-2 text-muted-foreground">|</span>
                <span className="text-muted-foreground">{formatFileSize(file?.size ?? 0)}</span>
                <span className="mx-2 text-muted-foreground">|</span>
                <span className="text-muted-foreground">Sheet: {sheetName}</span>
                <span className="mx-2 text-muted-foreground">|</span>
                <span className="text-muted-foreground">{totalRows} rows</span>
              </div>
            </CardContent>
          </Card>

          {/* Mapping card */}
          <Card>
            <CardHeader>
              <CardTitle>{t('upload.columnMapping', 'Column Mapping')}</CardTitle>
              <p className="text-sm text-muted-foreground">
                {t(
                  'upload.mapColumnsDesc',
                  'Match each system field with the corresponding column from your file.',
                )}
              </p>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Load saved mapping */}
              {savedMappings.length > 0 && (
                <div className="space-y-2">
                  <Label>{t('upload.loadMapping', 'Load Saved Mapping')}</Label>
                  <div className="flex flex-wrap items-center gap-2">
                    {savedMappings.map((sm) => (
                      <div key={sm.name} className="flex items-center gap-1">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => loadSavedMapping(sm.name)}
                        >
                          {sm.name}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                          onClick={() => deleteMappingConfig(sm.name)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Mapping fields */}
              <div className="space-y-3">
                {ALL_MAPPING_FIELDS.map((field) => {
                  const isRequired = REQUIRED_MAPPING_FIELDS.includes(field);
                  const currentValue = mapping[field] ?? '';
                  return (
                    <div
                      key={field}
                      className="flex flex-col gap-2 rounded-lg border border-border bg-muted/30 p-3 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-foreground">
                          {t(`columnFields.${field}`, field)}
                        </span>
                        <Badge variant={isRequired ? 'default' : 'secondary'} className="text-xs">
                          {isRequired
                            ? t('upload.requiredField', 'Required')
                            : t('upload.optionalField', 'Optional')}
                        </Badge>
                        {currentValue && (
                          <Badge variant="outline" className="text-xs text-green-600">
                            {t('upload.autoDetected', 'Auto-detected')}
                          </Badge>
                        )}
                      </div>
                      <select
                        value={currentValue}
                        onChange={(e) =>
                          updateMapping(field, e.target.value)
                        }
                        className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 sm:w-64"
                      >
                        <option value="">{t('upload.skip', '-- Skip --')}</option>
                        {headers.map((h) => (
                          <option key={h} value={h}>
                            {h}
                          </option>
                        ))}
                      </select>
                    </div>
                  );
                })}
              </div>

              {/* Validation warning */}
              {!requiredMet && (
                <div className="flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-300">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  {t('upload.missingRequired', 'Please map all required fields')}
                </div>
              )}

              {/* Save mapping */}
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                <div className="flex-1 space-y-1">
                  <Label htmlFor="mapping-name">
                    {t('upload.saveMappingAs', 'Save mapping as...')}
                  </Label>
                  <Input
                    id="mapping-name"
                    placeholder={t('upload.mappingName', 'Mapping Name')}
                    value={saveName}
                    onChange={(e) => setSaveName(e.target.value)}
                  />
                </div>
                <Button
                  variant="outline"
                  onClick={handleSaveMapping}
                  disabled={!saveName.trim()}
                  className="shrink-0"
                >
                  <Save className="mr-2 h-4 w-4" />
                  {t('common.save', 'Save')}
                </Button>
              </div>

              {/* Navigation */}
              <div className="flex justify-between pt-2">
                <Button variant="ghost" onClick={() => setStep(1)}>
                  {t('common.back', 'Back')}
                </Button>
                <Button onClick={() => setStep(3)} disabled={!requiredMet}>
                  {t('common.next', 'Next')}
                  <ChevronRight className="ml-1 h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {/* ============================================================
          STEP 3 — Data Preview
          ============================================================ */}
      {step === 3 && (
        <Card>
          <CardHeader>
            <CardTitle>{t('upload.previewData', 'Data Preview')}</CardTitle>
            <p className="text-sm text-muted-foreground">
              Showing first {previewRows.length} of {totalRows} rows
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/50">
                    {mappedFields.map((field) => (
                      <th key={field} className="whitespace-nowrap px-4 py-3 font-semibold">
                        <div className="text-foreground">
                          {t(`columnFields.${field}`, field)}
                        </div>
                        <div className="text-xs font-normal text-muted-foreground">
                          ({mapping[field]})
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {previewRows.map((row, rIdx) => (
                    <tr
                      key={rIdx}
                      className="border-b border-border last:border-0 hover:bg-muted/30"
                    >
                      {mappedFields.map((field) => {
                        const colName = mapping[field]!;
                        const val = row[colName];
                        return (
                          <td key={field} className="whitespace-nowrap px-4 py-2 text-foreground">
                            {val == null || val === '' ? (
                              <span className="text-muted-foreground">--</span>
                            ) : (
                              String(val)
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Navigation */}
            <div className="flex justify-between pt-2">
              <Button variant="ghost" onClick={() => setStep(2)}>
                {t('common.back', 'Back')}
              </Button>
              <Button onClick={handleImport}>
                {t('upload.confirmUpload', 'Confirm & Import')}
                <ChevronRight className="ml-1 h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ============================================================
          STEP 4 — Import Confirmation
          ============================================================ */}
      {step === 4 && importSummary && (
        <Card>
          <CardContent className="space-y-6 py-8">
            {/* Success icon */}
            <div className="flex flex-col items-center gap-3">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-100 text-green-600 dark:bg-green-950/40">
                <CheckCircle2 className="h-8 w-8" />
              </div>
              <h2 className="text-xl font-semibold text-foreground">Import Successful</h2>
            </div>

            {/* Summary grid */}
            <div className="mx-auto grid max-w-lg grid-cols-2 gap-4">
              <SummaryCell
                label={t('upload.totalRows', 'Total Rows')}
                value={importSummary.total_rows.toLocaleString()}
              />
              <SummaryCell
                label={t('upload.validRows', 'Valid Rows')}
                value={importSummary.valid_rows.toLocaleString()}
                accent="green"
              />
              <SummaryCell
                label={t('upload.droppedRows', 'Dropped Rows')}
                value={importSummary.dropped_rows.toLocaleString()}
                accent={importSummary.dropped_rows > 0 ? 'amber' : undefined}
              />
              <SummaryCell
                label={t('upload.customers', 'Customers')}
                value={importSummary.customers_count.toLocaleString()}
              />
              <SummaryCell
                label={t('upload.items', 'Items')}
                value={importSummary.items_count.toLocaleString()}
              />
              <SummaryCell
                label={t('upload.dateRange', 'Date Range')}
                value={
                  importSummary.date_range.min && importSummary.date_range.max
                    ? `${importSummary.date_range.min} - ${importSummary.date_range.max}`
                    : '--'
                }
              />
            </div>

            {/* Actions */}
            <div className="flex justify-center pt-2">
              <Button onClick={handleReset}>
                {t('common.upload', 'Upload')} Another File
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Small helper component for the summary grid
// ---------------------------------------------------------------------------

function SummaryCell({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: 'green' | 'amber';
}) {
  const accentColor =
    accent === 'green'
      ? 'text-green-600 dark:text-green-400'
      : accent === 'amber'
        ? 'text-amber-600 dark:text-amber-400'
        : 'text-foreground';
  return (
    <div className="rounded-lg border border-border bg-muted/30 p-4">
      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={`mt-1 text-lg font-semibold ${accentColor}`}>{value}</p>
    </div>
  );
}
