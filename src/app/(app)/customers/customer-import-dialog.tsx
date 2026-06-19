'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useI18n } from '@/lib/i18n/provider';
import { Field } from './customer-form';
import { importCustomers } from './actions';
import type { Branch, Profile } from '@/lib/erp/types';

type Rep = Pick<Profile, 'id' | 'full_name' | 'email'>;

interface ParsedRow {
  code: string;
  name: string;
  name_ar?: string;
  phone?: string;
  city?: string;
  credit_limit?: number;
}

// Minimal CSV parser: first row is headers. Recognized headers (ar or en):
// code/كود, name/الاسم, name_ar/الاسم بالعربي, phone/الهاتف, city/المدينة,
// credit_limit/حد الائتمان.
function parseCsv(text: string): ParsedRow[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map((h) => h.trim().toLowerCase());
  const idx = (keys: string[]) => headers.findIndex((h) => keys.includes(h));
  const iCode = idx(['code', 'كود', 'الكود']);
  const iName = idx(['name', 'الاسم', 'name_en']);
  const iNameAr = idx(['name_ar', 'الاسم بالعربي', 'الاسم العربي']);
  const iPhone = idx(['phone', 'الهاتف', 'تليفون', 'الموبايل']);
  const iCity = idx(['city', 'المدينة', 'المنطقة']);
  const iCredit = idx(['credit_limit', 'حد الائتمان', 'الائتمان']);
  const at = (cols: string[], i: number) => (i >= 0 ? (cols[i] ?? '').trim() : '');
  return lines.slice(1).map((line) => {
    const cols = line.split(',');
    return {
      code: at(cols, iCode),
      name: at(cols, iName) || at(cols, iNameAr),
      name_ar: at(cols, iNameAr) || undefined,
      phone: at(cols, iPhone) || undefined,
      city: at(cols, iCity) || undefined,
      credit_limit: Number(at(cols, iCredit)) || 0,
    };
  });
}

/** Customer CSV import dialog — reused by the Customer Workbench (moved verbatim
 *  from CustomersManager). Same `importCustomers` action; no logic change. */
export function ImportDialog({
  branches,
  reps,
  onClose,
  onDone,
}: {
  branches: Branch[];
  reps: Rep[];
  onClose: () => void;
  onDone: () => void;
}) {
  const { t } = useI18n();
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [branchId, setBranchId] = useState('');
  const [repId, setRepId] = useState('');
  const [pending, startTransition] = useTransition();

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const parsed = parseCsv(String(reader.result || '')).filter((r) => r.code && r.name);
      if (parsed.length === 0) toast.error(t('customers.toastImportNoRows'));
      setRows(parsed);
    };
    reader.readAsText(file, 'utf-8');
  }

  function doImport() {
    startTransition(async () => {
      const res = await importCustomers(rows, branchId || null, repId || null);
      if (!res.ok) {
        toast.error(res.error ?? t('customers.toastImportError'));
        return;
      }
      toast.success(t('customers.toastImportSuccess', { count: res.data?.count ?? 0 }));
      onDone();
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <Card className="max-h-[90vh] w-full max-w-lg overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <CardContent className="space-y-4 pt-6">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">{t('customers.importTitle')}</h3>
            <button onClick={onClose} className="rounded-md p-1 hover:bg-secondary"><X className="h-4 w-4" /></button>
          </div>
          <p className="text-xs text-muted-foreground">
            {t('customers.importHint')}
            <span dir="ltr" className="mx-1 font-mono">code, name, name_ar, phone, city, credit_limit</span>
          </p>
          <input type="file" accept=".csv,text/csv" onChange={handleFile} className="block w-full text-sm" />

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t('customers.importFieldBranch')}>
              <select value={branchId} onChange={(e) => setBranchId(e.target.value)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                <option value="">{t('customers.importOptGeneral')}</option>
                {branches.map((b) => <option key={b.id} value={b.id}>{b.name_ar || b.name}</option>)}
              </select>
            </Field>
            <Field label={t('customers.importFieldSalesman')}>
              <select value={repId} onChange={(e) => setRepId(e.target.value)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                <option value="">{t('customers.importOptNoSalesman')}</option>
                {reps.map((r) => <option key={r.id} value={r.id}>{r.full_name || r.email}</option>)}
              </select>
            </Field>
          </div>

          {rows.length > 0 && (
            <div className="rounded-md border">
              <p className="border-b p-2 text-sm font-medium">{t('customers.importPreview', { count: rows.length })}</p>
              <div className="max-h-48 overflow-y-auto">
                <table className="w-full text-xs">
                  <tbody>
                    {rows.slice(0, 20).map((r, i) => (
                      <tr key={i} className="border-b last:border-0">
                        <td className="p-1.5 font-mono" dir="ltr">{r.code}</td>
                        <td className="p-1.5">{r.name_ar || r.name}</td>
                        <td className="p-1.5 text-muted-foreground" dir="ltr">{r.phone || ''}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="flex gap-2">
            <Button onClick={doImport} disabled={pending || rows.length === 0}>
              {pending && <Loader2 className="h-4 w-4 animate-spin" />}{' '}
              {rows.length > 0 ? t('customers.btnImportWithCount', { count: rows.length }) : t('customers.btnImportAction')}
            </Button>
            <Button variant="outline" onClick={onClose}>{t('customers.btnCancel')}</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
