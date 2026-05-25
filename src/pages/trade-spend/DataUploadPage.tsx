import { useState, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  UploadCloud,
  CheckCircle2,
  ChevronRight,
  Save,
  Trash2,
  AlertCircle,
  Loader2,
  FileUp,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useTradeSpendStore } from '@/stores/tradeSpendStore';
import type { ColumnMappingConfig, DataUploadSummary } from '@/lib/trade-spend/types';
import { REQUIRED_MAPPING_FIELDS, OPTIONAL_MAPPING_FIELDS } from '@/lib/trade-spend/types';

const ALL_MAPPING_FIELDS = [...REQUIRED_MAPPING_FIELDS, ...OPTIONAL_MAPPING_FIELDS];

const AUTO_DETECT: Record<string, keyof ColumnMappingConfig> = {
  'cust account': 'customer_account',
  'customer code': 'customer_account',
  'account': 'customer_account',
  'cust name': 'customer_name',
  'customer name': 'customer_name',
  'class': 'customer_class',
  'channel': 'customer_channel',
  'item id': 'item_id',
  'product code': 'item_id',
  'sku': 'item_id',
  'item description': 'item_description',
  'product name': 'item_description',
  'description': 'item_description',
  'invoice date': 'invoice_date',
  'date': 'invoice_date',
  'invoice amount ex vat': 'invoice_amount',
  'invoice amount': 'invoice_amount',
  'amount': 'invoice_amount',
  'value': 'invoice_amount',
  'net amount': 'invoice_amount',
  'inv qty cases': 'invoice_qty_cases',
  'quantity': 'invoice_qty_cases',
  'cases': 'invoice_qty_cases',
  'qty': 'invoice_qty_cases',
  'isreturn': 'is_return',
  'is return': 'is_return',
};

function parseCSV(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return { headers: [], rows: [] };

  const sep = lines[0].includes('\t') ? '\t' : ',';
  const headers = lines[0].split(sep).map((h) => h.trim().replace(/^"|"$/g, ''));

  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(sep).map((v) => v.trim().replace(/^"|"$/g, ''));
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => {
      row[h] = values[idx] || '';
    });
    rows.push(row);
  }
  return { headers, rows };
}

function autoDetect(headers: string[]): Partial<ColumnMappingConfig> {
  const result: Partial<ColumnMappingConfig> = {};
  const used = new Set<string>();
  for (const h of headers) {
    const key = h.toLowerCase().trim();
    const field = AUTO_DETECT[key];
    if (field && !result[field]) {
      result[field] = h;
      used.add(h);
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
  const [loadingMsg, setLoadingMsg] = useState('');
  const [fileName, setFileName] = useState('');
  const [headers, setHeaders] = useState<string[]>([]);
  const [allRows, setAllRows] = useState<Record<string, unknown>[]>([]);
  const [previewRows, setPreviewRows] = useState<Record<string, unknown>[]>([]);
  const [totalRows, setTotalRows] = useState(0);
  const [parseError, setParseError] = useState('');
  const [mapping, setMapping] = useState<Partial<ColumnMappingConfig>>({});
  const [saveName, setSaveName] = useState('');
  const [importSummary, setImportSummary] = useState<DataUploadSummary | null>(null);

  const handleFile = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    setParseError('');
    setLoading(true);

    const isCSV = file.name.toLowerCase().endsWith('.csv') || file.name.toLowerCase().endsWith('.tsv');

    if (isCSV) {
      setLoadingMsg(t('upload.processing'));
      const reader = new FileReader();
      reader.onload = (evt) => {
        try {
          const text = evt.target?.result as string;
          const { headers: hdrs, rows } = parseCSV(text);
          if (rows.length === 0) {
            setParseError('File contains no data.');
            setLoading(false);
            return;
          }
          setHeaders(hdrs);
          setAllRows(rows);
          setPreviewRows(rows.slice(0, 5));
          setTotalRows(rows.length);
          setMapping(autoDetect(hdrs));
          setLoading(false);
          setStep(2);
        } catch (err) {
          console.error(err);
          setParseError('Failed to parse CSV.');
          setLoading(false);
        }
      };
      reader.onerror = () => { setParseError('Failed to read file.'); setLoading(false); };
      reader.readAsText(file);
    } else {
      setLoadingMsg(t('upload.processing') + ' (Excel)');
      const reader = new FileReader();
      reader.onload = async (evt) => {
        try {
          const XLSX = await import('xlsx');
          const data = new Uint8Array(evt.target?.result as ArrayBuffer);
          const wb = XLSX.read(data, { type: 'array' });
          const ws = wb.Sheets[wb.SheetNames[0]];
          const json: Record<string, unknown>[] = XLSX.utils.sheet_to_json(ws, { defval: '' });
          if (json.length === 0) {
            setParseError('File contains no data.');
            setLoading(false);
            return;
          }
          const hdrs = Object.keys(json[0]);
          setHeaders(hdrs);
          setAllRows(json);
          setPreviewRows(json.slice(0, 5));
          setTotalRows(json.length);
          setMapping(autoDetect(hdrs));
          setLoading(false);
          setStep(2);
        } catch (err) {
          console.error(err);
          setParseError('Failed to parse Excel. Try saving as CSV first.');
          setLoading(false);
        }
      };
      reader.onerror = () => { setParseError('Failed to read file.'); setLoading(false); };
      reader.readAsArrayBuffer(file);
    }
  }, [t]);

  const requiredMet = useMemo(
    () => REQUIRED_MAPPING_FIELDS.every((f) => mapping[f]),
    [mapping],
  );

  const handleImport = useCallback(() => {
    setLoading(true);
    setLoadingMsg('Importing...');
    setTimeout(() => {
      try {
        const result = importRawData(allRows, mapping);
        setImportSummary(result.summary);
        setLoading(false);
        setStep(4);
      } catch (err) {
        console.error(err);
        setParseError('Import failed.');
        setLoading(false);
      }
    }, 50);
  }, [allRows, mapping, importRawData]);

  const handleReset = useCallback(() => {
    setStep(1); setFileName(''); setHeaders([]); setAllRows([]);
    setPreviewRows([]); setTotalRows(0); setParseError('');
    setMapping({}); setImportSummary(null);
  }, []);

  // ========== LOADING ==========
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-32 gap-4">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="text-sm font-medium text-muted-foreground">{loadingMsg}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h1 className="heading-1 font-display">{t('upload.title')}</h1>

      {/* Steps */}
      <div className="flex items-center gap-1 text-xs">
        {['Upload', 'Map', 'Preview', 'Done'].map((label, i) => (
          <div key={i} className="flex items-center gap-1">
            <span className={`h-6 w-6 rounded-full flex items-center justify-center text-[10px] font-bold ${
              step > i + 1 ? 'bg-success text-white' : step === i + 1 ? 'bg-primary text-white' : 'bg-muted text-muted-foreground'
            }`}>{step > i + 1 ? '✓' : i + 1}</span>
            <span className={step === i + 1 ? 'font-medium' : 'text-muted-foreground'}>{label}</span>
            {i < 3 && <ChevronRight className="h-3 w-3 text-muted-foreground" />}
          </div>
        ))}
      </div>

      {parseError && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive bg-destructive/10 p-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 flex-shrink-0" /> {parseError}
        </div>
      )}

      {/* STEP 1 */}
      {step === 1 && (
        <Card>
          <CardContent className="py-8">
            <div className="flex flex-col items-center gap-4 text-center">
              <UploadCloud className="h-16 w-16 text-muted-foreground/50" />
              <div>
                <p className="text-sm font-medium">{t('upload.dragDrop')}</p>
                <p className="text-xs text-muted-foreground mt-1">CSV, Excel (.xlsx, .xls)</p>
              </div>
              <label>
                <Button size="lg" className="cursor-pointer" asChild>
                  <span><FileUp className="me-2 h-5 w-5" /> {t('upload.selectFile')}</span>
                </Button>
                <input type="file" accept=".csv,.tsv,.xlsx,.xls" className="sr-only" onChange={handleFile} />
              </label>
            </div>
          </CardContent>
        </Card>
      )}

      {/* STEP 2 */}
      {step === 2 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{t('upload.columnMapping')}</CardTitle>
            <p className="text-xs text-muted-foreground">{fileName} — {totalRows.toLocaleString()} rows</p>
          </CardHeader>
          <CardContent className="space-y-4">
            {savedMappings.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {savedMappings.map((m) => (
                  <div key={m.name} className="flex items-center gap-0.5">
                    <Button size="sm" variant="outline" className="h-6 text-[10px] px-2" onClick={() => {
                      const filtered: Partial<ColumnMappingConfig> = {};
                      for (const [k, v] of Object.entries(m.mapping)) {
                        if (headers.includes(v as string)) (filtered as Record<string, string>)[k] = v as string;
                      }
                      setMapping(filtered);
                    }}>{m.name}</Button>
                    <button className="text-destructive p-0.5" onClick={() => deleteMappingConfig(m.name)}>
                      <Trash2 className="h-2.5 w-2.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <p className="text-[10px] text-muted-foreground">{t('upload.mapColumnsDesc')}</p>

            <div className="space-y-2">
              {ALL_MAPPING_FIELDS.map((field) => {
                const isReq = REQUIRED_MAPPING_FIELDS.includes(field);
                return (
                  <div key={field} className="flex items-center gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1">
                        <span className="text-xs font-medium truncate">{t(`columnFields.${field}`)}</span>
                        {isReq && <span className="text-[8px] text-destructive">*</span>}
                        {mapping[field] && <CheckCircle2 className="h-3 w-3 text-success flex-shrink-0" />}
                      </div>
                    </div>
                    <select
                      value={mapping[field] || ''}
                      onChange={(e) => setMapping((p) => {
                        const n = { ...p };
                        if (e.target.value) n[field] = e.target.value; else delete n[field];
                        return n;
                      })}
                      className="h-8 w-[55%] rounded border border-input bg-background px-2 text-xs"
                    >
                      <option value="">—</option>
                      {headers.map((h) => <option key={h} value={h}>{h}</option>)}
                    </select>
                  </div>
                );
              })}
            </div>

            <div className="flex items-center gap-2">
              <Input placeholder={t('upload.mappingName')} value={saveName} onChange={(e) => setSaveName(e.target.value)} className="h-7 text-xs flex-1" />
              <Button size="sm" variant="outline" className="h-7 text-[10px]" disabled={!saveName.trim()} onClick={() => { saveMappingConfig(saveName.trim(), mapping); setSaveName(''); }}>
                <Save className="me-1 h-3 w-3" />{t('common.save')}
              </Button>
            </div>

            {!requiredMet && (
              <p className="text-[10px] text-amber-600 flex items-center gap-1">
                <AlertCircle className="h-3 w-3" /> {t('upload.missingRequired')}
              </p>
            )}

            <div className="flex gap-2 pt-1">
              <Button size="sm" variant="outline" onClick={handleReset}>{t('common.back')}</Button>
              <Button size="sm" disabled={!requiredMet} onClick={() => setStep(3)}>
                {t('common.next')} <ChevronRight className="ms-1 h-3 w-3" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* STEP 3 */}
      {step === 3 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{t('upload.previewData')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="overflow-x-auto rounded border text-[10px]">
              <table className="w-full">
                <thead><tr className="bg-muted">
                  {ALL_MAPPING_FIELDS.filter((f) => mapping[f]).map((f) => (
                    <th key={f} className="px-2 py-1.5 text-start font-medium whitespace-nowrap">{t(`columnFields.${f}`)}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {previewRows.map((row, i) => (
                    <tr key={i} className="border-t">
                      {ALL_MAPPING_FIELDS.filter((f) => mapping[f]).map((f) => (
                        <td key={f} className="px-2 py-1 whitespace-nowrap">{String(row[mapping[f]!] ?? '')}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => setStep(2)}>{t('common.back')}</Button>
              <Button size="sm" onClick={handleImport}>{t('upload.confirmUpload')}</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* STEP 4 */}
      {step === 4 && importSummary && (
        <Card>
          <CardContent className="py-6 space-y-4">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="h-8 w-8 text-success" />
              <div>
                <p className="font-semibold font-display">{t('upload.summary')}</p>
                <p className="text-xs text-muted-foreground">{fileName}</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {[
                [t('upload.totalRows'), importSummary.total_rows],
                [t('upload.validRows'), importSummary.valid_rows],
                [t('upload.droppedRows'), importSummary.dropped_rows],
                [t('upload.customers'), importSummary.customers_count],
                [t('upload.items'), importSummary.items_count],
              ].map(([label, val]) => (
                <div key={String(label)} className="rounded-lg bg-muted p-2.5">
                  <p className="text-[9px] text-muted-foreground uppercase">{label}</p>
                  <p className="text-lg font-bold font-display">{(val as number).toLocaleString()}</p>
                </div>
              ))}
              <div className="rounded-lg bg-muted p-2.5">
                <p className="text-[9px] text-muted-foreground uppercase">{t('upload.dateRange')}</p>
                <p className="text-xs font-medium">{importSummary.date_range.min} → {importSummary.date_range.max}</p>
              </div>
            </div>
            <Button size="sm" onClick={handleReset}>{t('upload.selectFile')}</Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
