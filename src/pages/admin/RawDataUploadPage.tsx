import { useState } from 'react';
import { Loader2, Upload, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { DropzoneArea } from '@/components/admin/DropzoneArea';
import { ColumnMapper } from '@/components/admin/ColumnMapper';
import {
  parseSpreadsheet,
  STANDARD_FIELDS,
  type ParsedSheet,
  type StandardFieldKey,
} from '@/lib/excelParser';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { logAudit } from '@/lib/audit';

type Mapping = Record<StandardFieldKey, string>;

const EMPTY_MAPPING: Mapping = STANDARD_FIELDS.reduce(
  (acc, f) => ({ ...acc, [f.key]: '' }),
  {} as Mapping,
);

export function RawDataUploadPage() {
  const actorId = useAuthStore((s) => s.profile?.id);
  const [file, setFile] = useState<File | null>(null);
  const [parsed, setParsed] = useState<ParsedSheet | null>(null);
  const [mapping, setMapping] = useState<Mapping>(EMPTY_MAPPING);
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);

  async function handleFile(f: File) {
    setFile(f);
    setParsing(true);
    try {
      const result = await parseSpreadsheet(f);
      setParsed(result);
      const auto: Mapping = { ...EMPTY_MAPPING };
      for (const fld of STANDARD_FIELDS) {
        const match = result.headers.find(
          (h) => h.toLowerCase().replace(/[\s_]/g, '') === fld.key.replace(/_/g, ''),
        );
        if (match) auto[fld.key] = match;
      }
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

  const requiredFields: StandardFieldKey[] = ['invoice_date', 'customer_code', 'amount'];
  const missingRequired = requiredFields.filter((f) => !mapping[f]);
  const canImport = parsed != null && missingRequired.length === 0;

  async function handleImport() {
    if (!parsed || !file || !actorId) return;
    setImporting(true);
    try {
      const mappingRows = STANDARD_FIELDS.filter((f) => mapping[f.key]).map((f) => ({
        data_type: file.name,
        system_field: f.key,
        excel_column_name: mapping[f.key],
        is_active: true,
      }));
      const { error: mErr } = await supabase
        .from('raw_data_mappings')
        .insert(mappingRows);
      if (mErr) {
        console.warn('mapping save failed', mErr);
      }

      await logAudit({
        actorId,
        action: 'raw_data_upload',
        entity: 'file',
        entityId: file.name,
        metadata: {
          rows: parsed.totalRows,
          sheet: parsed.sheetName,
          mapping,
        },
      });

      toast.success('تم حفظ الـ mapping', {
        description: `${parsed.totalRows} صف من ${file.name}. الاستيراد الفعلي يجب أن يتم عبر pipeline في الخلفية.`,
      });
      setFile(null);
      setParsed(null);
      setMapping(EMPTY_MAPPING);
    } catch (err) {
      toast.error('فشل الحفظ', {
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="رفع البيانات الخام"
        description="استيراد ملفات SalesBuzz وحفظ خرائط الأعمدة"
        back="/admin"
      />

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
          <Card className="p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-h3 text-foreground">معاينة (أول 10 صفوف)</h3>
                <p className="text-caption">
                  {parsed.sheetName} · {parsed.totalRows} صف · {parsed.headers.length} عمود
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

          <Card className="space-y-4 p-5">
            <h3 className="text-h3 text-foreground">خريطة الأعمدة</h3>
            <ColumnMapper
              excelHeaders={parsed.headers}
              mapping={mapping}
              onChange={setMapping}
            />
            {missingRequired.length > 0 && (
              <div className="flex items-start gap-2 rounded-lg bg-warning/10 p-3 text-warning">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <p className="text-sm">
                  الحقول التالية مطلوبة قبل الاستيراد:{' '}
                  {missingRequired
                    .map((f) => STANDARD_FIELDS.find((s) => s.key === f)?.label)
                    .join('، ')}
                </p>
              </div>
            )}
            <Button onClick={handleImport} disabled={!canImport || importing}>
              {importing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Upload className="h-4 w-4" />
              )}
              حفظ الخريطة وبدء الاستيراد
            </Button>
            <p className="text-caption">
              ملاحظة: الـ mapping يُحفظ في raw_data_mappings. عملية الاستيراد الفعلية
              للبيانات يجب أن تتم عبر pipeline خلفي (Edge Function أو worker) باستخدام
              صلاحيات service_role.
            </p>
          </Card>
        </>
      )}
    </div>
  );
}
