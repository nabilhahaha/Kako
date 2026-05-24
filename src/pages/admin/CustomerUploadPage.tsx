import { useState } from 'react';
import {
  Loader2,
  Upload,
  AlertTriangle,
  CheckCircle2,
  Users,
  RefreshCw,
} from 'lucide-react';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { DropzoneArea } from '@/components/admin/DropzoneArea';
import { parseSpreadsheet, type ParsedSheet } from '@/lib/excelParser';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { logAudit } from '@/lib/audit';

/* ── System fields for customer mapping ── */

interface CustomerField {
  key: string;
  label: string;
  required?: boolean;
}

const CUSTOMER_FIELDS: CustomerField[] = [
  { key: 'customer_code', label: 'كود العميل', required: true },
  { key: 'customer_name', label: 'اسم العميل (EN)' },
  { key: 'customer_name_ar', label: 'اسم العميل (AR)' },
  { key: 'channel_type', label: 'نوع القناة' },
  { key: 'customer_grade', label: 'تصنيف العميل' },
  { key: 'latitude', label: 'خط العرض' },
  { key: 'longitude', label: 'خط الطول' },
  { key: 'region', label: 'المنطقة' },
  { key: 'total_debt', label: 'إجمالي المديونية' },
  { key: 'overdue_amount', label: 'المبلغ المتأخر' },
];

type CustomerMapping = Record<string, string>;

const SKIP = '__skip__';

/* ── Helper: parse all rows from file ── */

async function parseFullRows(
  file: File,
): Promise<Record<string, string | number | null>[]> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array' });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) throw new Error('الملف لا يحتوي على أوراق عمل');
  const sheet = wb.Sheets[sheetName];
  const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: null,
    raw: true,
  });
  const headers = json.length > 0 ? Object.keys(json[0]) : [];
  return json.map((r) => {
    const out: Record<string, string | number | null> = {};
    for (const h of headers) {
      const v = r[h];
      if (v == null) out[h] = null;
      else if (typeof v === 'number') out[h] = v;
      else out[h] = String(v);
    }
    return out;
  });
}

/* ── Auto-suggest mapping ── */

function autoSuggestMapping(headers: string[]): CustomerMapping {
  const mapping: CustomerMapping = {};
  const normalize = (s: string) => s.toLowerCase().replace(/[\s_\-]/g, '');

  for (const field of CUSTOMER_FIELDS) {
    const fieldNorm = normalize(field.key);
    const match = headers.find((h) => normalize(h) === fieldNorm);
    if (match) {
      mapping[field.key] = match;
    }
  }
  return mapping;
}

/* ── Component ── */

export function CustomerUploadPage() {
  const actorId = useAuthStore((s) => s.profile?.id);
  const [file, setFile] = useState<File | null>(null);
  const [parsed, setParsed] = useState<ParsedSheet | null>(null);
  const [mapping, setMapping] = useState<CustomerMapping>({});
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);

  // Duplicate detection state
  const [duplicateInfo, setDuplicateInfo] = useState<{
    newCount: number;
    existingCount: number;
    existingCodes: Set<string>;
  } | null>(null);
  const [checkingDuplicates, setCheckingDuplicates] = useState(false);

  /* ── File handling ── */

  async function handleFile(f: File) {
    setFile(f);
    setParsing(true);
    setDuplicateInfo(null);
    try {
      const result = await parseSpreadsheet(f);
      setParsed(result);
      const auto = autoSuggestMapping(result.headers);
      setMapping(auto);
    } catch (err) {
      toast.error('فشل قراءة الملف', {
        description: err instanceof Error ? err.message : undefined,
      });
      setParsed(null);
    } finally {
      setParsing(false);
    }
  }

  /* ── Mapping change ── */

  function setFieldMapping(fieldKey: string, excelHeader: string) {
    setMapping((prev) => ({
      ...prev,
      [fieldKey]: excelHeader === SKIP ? '' : excelHeader,
    }));
    setDuplicateInfo(null);
  }

  /* ── Validation ── */

  const requiredFields = CUSTOMER_FIELDS.filter((f) => f.required);
  const missingRequired = requiredFields.filter((f) => !mapping[f.key]);
  const canCheck = parsed != null && missingRequired.length === 0;

  /* ── Duplicate check ── */

  async function checkDuplicates() {
    if (!file || !parsed || !mapping.customer_code) return;
    setCheckingDuplicates(true);
    try {
      const allRows = await parseFullRows(file);
      const codeColumn = mapping.customer_code;
      const codes = allRows
        .map((r) => (r[codeColumn] != null ? String(r[codeColumn]) : ''))
        .filter(Boolean);

      // Fetch existing customer codes from DB
      const { data: existingCustomers, error } = await supabase
        .from('customers')
        .select('customer_code')
        .in('customer_code', codes);
      if (error) throw error;

      const existingCodes = new Set(
        (existingCustomers ?? []).map((c) => c.customer_code),
      );
      const newCount = codes.filter((c) => !existingCodes.has(c)).length;
      const existingCount = codes.filter((c) => existingCodes.has(c)).length;

      setDuplicateInfo({ newCount, existingCount, existingCodes });
    } catch (err) {
      toast.error('فشل التحقق من التكرارات', {
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setCheckingDuplicates(false);
    }
  }

  /* ── Import ── */

  const canImport = duplicateInfo != null;

  async function handleImport() {
    if (!file || !parsed || !actorId || !duplicateInfo) return;
    setImporting(true);
    try {
      const allRows = await parseFullRows(file);
      const codeColumn = mapping.customer_code;

      let insertedCount = 0;
      let updatedCount = 0;

      // Process rows in batches
      const BATCH_SIZE = 100;
      for (let i = 0; i < allRows.length; i += BATCH_SIZE) {
        const batch = allRows.slice(i, i + BATCH_SIZE);

        const newRecords: Record<string, unknown>[] = [];
        const updateRecords: { code: string; data: Record<string, unknown> }[] = [];

        for (const row of batch) {
          const code = row[codeColumn] != null ? String(row[codeColumn]) : '';
          if (!code) continue;

          const record: Record<string, unknown> = {};
          for (const field of CUSTOMER_FIELDS) {
            const excelCol = mapping[field.key];
            if (!excelCol) continue;
            const value = row[excelCol];
            // Convert numeric fields
            if (['latitude', 'longitude', 'total_debt', 'overdue_amount'].includes(field.key)) {
              record[field.key] = value != null ? Number(value) : null;
            } else {
              record[field.key] = value != null ? String(value) : null;
            }
          }

          if (duplicateInfo.existingCodes.has(code)) {
            updateRecords.push({ code, data: record });
          } else {
            record.customer_code = code;
            newRecords.push(record);
          }
        }

        // Insert new customers
        if (newRecords.length > 0) {
          const { error: insErr } = await supabase
            .from('customers')
            .insert(newRecords);
          if (insErr) {
            console.warn('batch insert failed', insErr);
            toast.error(`فشل إدراج دفعة (صف ${i + 1})`, {
              description: insErr.message,
            });
          } else {
            insertedCount += newRecords.length;
          }
        }

        // Update existing customers
        for (const { code, data } of updateRecords) {
          const { error: updErr } = await supabase
            .from('customers')
            .update(data)
            .eq('customer_code', code);
          if (updErr) {
            console.warn('update failed for', code, updErr);
          } else {
            updatedCount++;
          }
        }
      }

      // Audit log
      await logAudit({
        actorId,
        action: 'customer_upload',
        entity: 'customers',
        entityId: file.name,
        metadata: {
          totalRows: allRows.length,
          inserted: insertedCount,
          updated: updatedCount,
          fileName: file.name,
        },
      });

      toast.success('تم استيراد بيانات العملاء', {
        description: `تم إدراج ${insertedCount} عميل جديد وتحديث ${updatedCount} عميل موجود`,
      });

      // Reset state
      setFile(null);
      setParsed(null);
      setMapping({});
      setDuplicateInfo(null);
    } catch (err) {
      toast.error('فشل الاستيراد', {
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setImporting(false);
    }
  }

  /* ── Render ── */

  return (
    <div className="space-y-5">
      <PageHeader
        title="رفع بيانات العملاء"
        description="استيراد بيانات العملاء من ملف Excel مع تخصيص الأعمدة"
        back="/admin"
      />

      {/* Dropzone */}
      <Card className="space-y-4 p-5">
        <DropzoneArea onFile={handleFile} current={file} />
        {parsing && (
          <p className="inline-flex items-center gap-2 text-caption">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            جاري قراءة الملف...
          </p>
        )}
      </Card>

      {parsed && (
        <>
          {/* Preview */}
          <Card className="p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-h3 text-foreground">معاينة (أول 10 صفوف)</h3>
                <p className="text-caption">
                  {parsed.sheetName} · {parsed.totalRows} صف · {parsed.headers.length}{' '}
                  عمود
                </p>
              </div>
            </div>
            <div className="mt-4 overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-xs">
                <thead className="bg-muted/40">
                  <tr>
                    {parsed.headers.map((h) => (
                      <th
                        key={h}
                        className="whitespace-nowrap px-3 py-2 text-start font-medium text-muted-foreground"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {parsed.rows.map((row, idx) => (
                    <tr key={idx}>
                      {parsed.headers.map((h) => (
                        <td
                          key={h}
                          className="whitespace-nowrap px-3 py-2 text-muted-foreground"
                        >
                          {row[h] != null ? String(row[h]) : '—'}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          {/* Column mapping */}
          <Card className="space-y-4 p-5">
            <h3 className="text-h3 text-foreground">خريطة الأعمدة</h3>
            <p className="text-caption">
              طابق كل حقل في النظام مع العمود المناسب من ملفك (اختر "تجاهل" إن لم
              يكن متاحًا).
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              {CUSTOMER_FIELDS.map((field) => (
                <div key={field.key} className="space-y-1.5">
                  <Label htmlFor={`map-${field.key}`}>
                    {field.label}
                    {field.required && (
                      <span className="text-destructive me-1"> *</span>
                    )}
                  </Label>
                  <select
                    id={`map-${field.key}`}
                    value={mapping[field.key] || SKIP}
                    onChange={(e) => setFieldMapping(field.key, e.target.value)}
                    className="flex h-10 w-full rounded-lg border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <option value={SKIP}>— تجاهل —</option>
                    {parsed.headers.map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>

            {/* Missing required warning */}
            {missingRequired.length > 0 && (
              <div className="flex items-start gap-2 rounded-lg bg-warning/10 p-3 text-warning">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <p className="text-sm">
                  الحقول التالية مطلوبة قبل الاستيراد:{' '}
                  {missingRequired.map((f) => f.label).join('، ')}
                </p>
              </div>
            )}

            {/* Check duplicates button */}
            <Button
              variant="outline"
              onClick={checkDuplicates}
              disabled={!canCheck || checkingDuplicates}
            >
              {checkingDuplicates ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              التحقق من التكرارات
            </Button>

            {/* Duplicate info */}
            {duplicateInfo && (
              <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-muted/30 p-4">
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm text-foreground">نتيجة التحقق:</span>
                </div>
                <Badge variant="success">
                  <CheckCircle2 className="me-1 h-3 w-3" />
                  {duplicateInfo.newCount} عميل جديد
                </Badge>
                <Badge variant="warning">
                  <RefreshCw className="me-1 h-3 w-3" />
                  {duplicateInfo.existingCount} عميل موجود (سيتم تحديثه)
                </Badge>
              </div>
            )}

            {/* Import button */}
            <Button onClick={handleImport} disabled={!canImport || importing}>
              {importing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Upload className="h-4 w-4" />
              )}
              بدء الاستيراد
            </Button>
          </Card>
        </>
      )}
    </div>
  );
}
