import { useState, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  UploadCloud,
  FileSpreadsheet,
  CheckCircle2,
  ChevronRight,
  Save,
  Trash2,
  AlertCircle,
  Loader2,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { useTradeSpendStore } from '@/stores/tradeSpendStore';
import type { ColumnMappingConfig, DataUploadSummary } from '@/lib/trade-spend/types';
import { REQUIRED_MAPPING_FIELDS, OPTIONAL_MAPPING_FIELDS } from '@/lib/trade-spend/types';

const ALL_MAPPING_FIELDS = [...REQUIRED_MAPPING_FIELDS, ...OPTIONAL_MAPPING_FIELDS];

const AUTO_DETECT_PATTERNS: Record<keyof ColumnMappingConfig, RegExp[]> = {
  customer_account: [/cust\s*account/i, /customer\s*code/i, /account/i, /cust.*code/i],
  customer_name: [/cust\s*name/i, /customer\s*name/i, /name/i],
  customer_class: [/class/i, /credit\s*class/i],
  customer_channel: [/channel/i],
  item_id: [/item\s*id/i, /product\s*code/i, /sku/i, /item.*code/i],
  item_description: [/item\s*desc/i, /product\s*name/i, /description/i],
  invoice_date: [/invoice\s*date/i, /date/i, /transaction\s*date/i],
  invoice_amount: [/invoice\s*amount/i, /amount.*ex.*vat/i, /amount/i, /net\s*amount/i, /value/i],
  invoice_qty_cases: [/inv\s*qty/i, /qty.*case/i, /quantity/i, /cases/i, /qty/i],
  is_return: [/is\s*return/i, /return/i],
};

function autoDetectMapping(headers: string[]): Partial<ColumnMappingConfig> {
  const result: Partial<ColumnMappingConfig> = {};
  const used = new Set<string>();
  for (const [field, patterns] of Object.entries(AUTO_DETECT_PATTERNS)) {
    for (const pattern of patterns) {
      const match = headers.find((h) => pattern.test(h) && !used.has(h));
      if (match) {
        (result as Record<string, string>)[field] = match;
        used.add(match);
        break;
      }
    }
  }
  return result;
}

export function DataUploadPage() {
  const { t } = useTranslation();
  const savedMappings = useTradeSpendStore((s) => s.savedMappings);
  const saveMappingConfig = useTradeSpendStore((s) => s.saveMappingConfig);
  const deleteMappingConfig = useTradeSpendStore((s) => s.deleteMappingConfig);
  const importRawData = useTradeSpendStore((s) => s.importRawData);

  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [fileName, setFileName] = useState('');
  const [headers, setHeaders] = useState<string[]>([]);
  const [allRows, setAllRows] = useState<Record<string, unknown>[]>([]);
  const [previewRows, setPreviewRows] = useState<Record<string, unknown>[]>([]);
  const [totalRows, setTotalRows] = useState(0);
  const [parseError, setParseError] = useState('');
  const [mapping, setMapping] = useState<Partial<ColumnMappingConfig>>({});
  const [saveName, setSaveName] = useState('');
  const [importSummary, setImportSummary] = useState<DataUploadSummary | null>(null);

  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    setParseError('');
    setLoading(true);

    try {
      const XLSX = await import('xlsx');
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(new Uint8Array(data), { type: 'array' });
      const firstSheet = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheet];
      const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, { defval: '' });

      if (json.length === 0) {
        setParseError(t('upload.dragDrop'));
        setLoading(false);
        return;
      }

      const hdrs = Object.keys(json[0]);
      setHeaders(hdrs);
      setAllRows(json);
      setPreviewRows(json.slice(0, 5));
      setTotalRows(json.length);

      const detected = autoDetectMapping(hdrs);
      setMapping(detected);
      setStep(2);
    } catch (err) {
      console.error('Parse error:', err);
      setParseError('Failed to parse file. Please check the format.');
    } finally {
      setLoading(false);
    }
  }, [t]);

  const updateMapping = useCallback((field: keyof ColumnMappingConfig, value: string) => {
    setMapping((prev) => {
      const next = { ...prev };
      if (value === '') delete next[field];
      else next[field] = value;
      return next;
    });
  }, []);

  const loadSavedMapping = useCallback((name: string) => {
    const found = savedMappings.find((m) => m.name === name);
    if (found) {
      const filtered: Partial<ColumnMappingConfig> = {};
      for (const [key, val] of Object.entries(found.mapping)) {
        if (headers.includes(val as string)) {
          (filtered as Record<string, string>)[key] = val as string;
        }
      }
      setMapping(filtered);
    }
  }, [savedMappings, headers]);

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

  const handleImport = useCallback(() => {
    setLoading(true);
    setTimeout(() => {
      try {
        const result = importRawData(allRows, mapping);
        setImportSummary(result.summary);
        setStep(4);
      } catch (err) {
        console.error('Import error:', err);
        setParseError('Import failed.');
      } finally {
        setLoading(false);
      }
    }, 100);
  }, [allRows, mapping, importRawData]);

  const handleReset = useCallback(() => {
    setStep(1);
    setFileName('');
    setHeaders([]);
    setAllRows([]);
    setPreviewRows([]);
    setTotalRows(0);
    setParseError('');
    setMapping({});
    setImportSummary(null);
  }, []);

  // ===================== STEPS INDICATOR =====================
  const StepIndicator = () => (
    <div className="flex items-center gap-2 mb-6">
      {[1, 2, 3, 4].map((s) => (
        <div key={s} className="flex items-center gap-2">
          <div className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${
            step >= s ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
          }`}>
            {step > s ? <CheckCircle2 className="h-4 w-4" /> : s}
          </div>
          {s < 4 && <ChevronRight className="h-3 w-3 text-muted-foreground" />}
        </div>
      ))}
    </div>
  );

  // ===================== LOADING OVERLAY =====================
  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="heading-1 font-display">{t('upload.title')}</h1>
        <StepIndicator />
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-20 gap-4">
            <Loader2 className="h-10 w-10 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">{t('upload.processing')}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="heading-1 font-display">{t('upload.title')}</h1>
      <StepIndicator />

      {parseError && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive bg-destructive/10 p-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          {parseError}
        </div>
      )}

      {/* ===================== STEP 1: FILE UPLOAD ===================== */}
      {step === 1 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UploadCloud className="h-5 w-5" />
              {t('upload.selectFile')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-border p-8 text-center">
              <UploadCloud className="h-12 w-12 text-muted-foreground mb-3" />
              <p className="text-sm text-muted-foreground mb-4">{t('upload.dragDrop')}</p>
              <label className="cursor-pointer">
                <Button asChild>
                  <span>
                    <FileSpreadsheet className="me-2 h-4 w-4" />
                    {t('upload.selectFile')}
                  </span>
                </Button>
                <input
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  className="sr-only"
                  onChange={handleFileSelect}
                />
              </label>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ===================== STEP 2: COLUMN MAPPING ===================== */}
      {step === 2 && (
        <Card>
          <CardHeader>
            <CardTitle>{t('upload.columnMapping')}</CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              {fileName} — {totalRows} {t('upload.totalRows')}
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Saved mappings */}
            {savedMappings.length > 0 && (
              <div className="space-y-2">
                <Label className="text-xs">{t('upload.loadMapping')}</Label>
                <div className="flex flex-wrap gap-2">
                  {savedMappings.map((m) => (
                    <div key={m.name} className="flex items-center gap-1">
                      <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => loadSavedMapping(m.name)}>
                        {m.name}
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive" onClick={() => deleteMappingConfig(m.name)}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Mapping fields */}
            <p className="text-xs text-muted-foreground">{t('upload.mapColumnsDesc')}</p>
            <div className="grid gap-3 sm:grid-cols-2">
              {ALL_MAPPING_FIELDS.map((field) => {
                const isRequired = REQUIRED_MAPPING_FIELDS.includes(field);
                const isMapped = !!mapping[field];
                return (
                  <div key={field} className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Label className="text-xs">{t(`columnFields.${field}`)}</Label>
                      <Badge variant={isRequired ? 'default' : 'secondary'} className="text-[9px] px-1.5 py-0">
                        {isRequired ? t('common.required') : t('common.optional')}
                      </Badge>
                      {isMapped && <CheckCircle2 className="h-3 w-3 text-success" />}
                    </div>
                    <select
                      value={mapping[field] || ''}
                      onChange={(e) => updateMapping(field, e.target.value)}
                      className="flex h-9 w-full rounded-lg border border-input bg-background px-2 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    >
                      <option value="">{t('upload.skip')}</option>
                      {headers.map((h) => (
                        <option key={h} value={h}>{h}</option>
                      ))}
                    </select>
                  </div>
                );
              })}
            </div>

            {/* Save mapping */}
            <div className="flex items-center gap-2 pt-2">
              <Input
                placeholder={t('upload.mappingName')}
                value={saveName}
                onChange={(e) => setSaveName(e.target.value)}
                className="h-8 text-xs flex-1"
              />
              <Button size="sm" variant="outline" className="h-8 text-xs" onClick={handleSaveMapping} disabled={!saveName.trim()}>
                <Save className="me-1 h-3 w-3" />
                {t('common.save')}
              </Button>
            </div>

            {/* Validation */}
            {!requiredMet && (
              <p className="text-xs text-amber-600 flex items-center gap-1">
                <AlertCircle className="h-3 w-3" />
                {t('upload.missingRequired')}
              </p>
            )}

            {/* Actions */}
            <div className="flex items-center gap-2 pt-2">
              <Button variant="outline" size="sm" onClick={handleReset}>{t('common.back')}</Button>
              <Button size="sm" disabled={!requiredMet} onClick={() => setStep(3)}>
                {t('upload.previewData')} <ChevronRight className="ms-1 h-3 w-3" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ===================== STEP 3: PREVIEW ===================== */}
      {step === 3 && (
        <Card>
          <CardHeader>
            <CardTitle>{t('upload.previewData')}</CardTitle>
            <p className="text-sm text-muted-foreground mt-1">{totalRows} {t('upload.totalRows')}</p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-muted">
                    {ALL_MAPPING_FIELDS.filter((f) => mapping[f]).map((f) => (
                      <th key={f} className="px-3 py-2 text-start font-medium whitespace-nowrap">
                        {t(`columnFields.${f}`)}
                        <span className="block text-[9px] font-normal text-muted-foreground">{mapping[f]}</span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {previewRows.map((row, i) => (
                    <tr key={i} className="border-t">
                      {ALL_MAPPING_FIELDS.filter((f) => mapping[f]).map((f) => (
                        <td key={f} className="px-3 py-1.5 whitespace-nowrap">
                          {String(row[mapping[f]!] ?? '')}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setStep(2)}>{t('common.back')}</Button>
              <Button size="sm" onClick={handleImport}>
                {t('upload.confirmUpload')} <ChevronRight className="ms-1 h-3 w-3" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ===================== STEP 4: SUMMARY ===================== */}
      {step === 4 && importSummary && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-success">
              <CheckCircle2 className="h-5 w-5" />
              {t('upload.summary')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              {[
                { label: t('upload.totalRows'), value: importSummary.total_rows },
                { label: t('upload.validRows'), value: importSummary.valid_rows },
                { label: t('upload.droppedRows'), value: importSummary.dropped_rows },
                { label: t('upload.customers'), value: importSummary.customers_count },
                { label: t('upload.items'), value: importSummary.items_count },
              ].map((item) => (
                <div key={item.label} className="rounded-lg bg-muted p-3">
                  <p className="text-[10px] text-muted-foreground uppercase">{item.label}</p>
                  <p className="text-lg font-bold font-display mt-0.5">{item.value.toLocaleString()}</p>
                </div>
              ))}
              <div className="rounded-lg bg-muted p-3">
                <p className="text-[10px] text-muted-foreground uppercase">{t('upload.dateRange')}</p>
                <p className="text-xs font-medium mt-0.5">
                  {importSummary.date_range.min} → {importSummary.date_range.max}
                </p>
              </div>
            </div>

            <Button size="sm" onClick={handleReset}>
              {t('upload.selectFile')}
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
