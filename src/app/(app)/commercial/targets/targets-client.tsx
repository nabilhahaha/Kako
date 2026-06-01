'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Loader2, Upload, Download, Plus, FileDown } from 'lucide-react';
import { useI18n } from '@/lib/i18n/provider';
import { saveTarget, setTargetStatus, validateTargets, importTargets, type TargetRow, type TargetIssue } from '../actions';

export interface Target { id: string; period_month: string; dim_type: string; dim_id: string | null; label: string | null; metric: string; target_amount: number; status: string }
const DIMS = ['company', 'region', 'area', 'branch', 'route', 'rep', 'channel', 'classification', 'customer', 'category', 'subcategory', 'brand', 'sku'];
const selectCls = 'h-9 rounded-md border border-input bg-background px-2 text-sm';

/** Manual entry + CSV import (validate→commit) / export + lifecycle for targets. */
export function TargetsClient({ month, initial }: { month: string; initial: Target[] }) {
  const { t } = useI18n();
  const router = useRouter();
  const [pending, start] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState({ dim_type: 'rep', dim_id: '', metric: 'value', amount: '' });
  const [issues, setIssues] = useState<{ rows: TargetRow[]; issues: TargetIssue[] } | null>(null);

  function add() {
    start(async () => {
      const res = await saveTarget({ period: month, dim_type: form.dim_type, dim_id: form.dim_id || null, metric: form.metric, amount: Number(form.amount) || 0 });
      if (!res.ok) { toast.error(res.error ?? t('commercial.saveFailed')); return; }
      toast.success(t('commercial.saved')); setForm({ ...form, dim_id: '', amount: '' }); router.refresh();
    });
  }
  function lifecycle(id: string, status: string) {
    start(async () => { const r = await setTargetStatus(id, status); if (!r.ok) toast.error(r.error ?? t('commercial.saveFailed')); else router.refresh(); });
  }
  function download(name: string, body: string) {
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([body], { type: 'text/csv' })); a.download = name; a.click();
  }
  const HEAD = 'period,dim_type,dim_ref,dim_id,metric,amount';
  function exportCsv() {
    const lines = initial.map((r) => [r.period_month.slice(0, 10), r.dim_type, r.label ?? '', r.dim_id ?? '', r.metric, r.target_amount].join(','));
    download(`targets-${month.slice(0, 7)}.csv`, [HEAD, ...lines].join('\n'));
  }
  function downloadTemplate() {
    const ex = [
      `${month.slice(0, 10)},rep,rep@example.com,,value,100000`,
      `${month.slice(0, 10)},customer,CUST-001,,value,5000`,
      `${month.slice(0, 10)},category,BEVERAGES,,value,50000`,
      `${month.slice(0, 10)},brand,Cola Co,,value,30000`,
      `${month.slice(0, 10)},sku,SKU-001,,quantity,500`,
    ];
    // dim_ref = a friendly id (code/email/name); leave dim_id blank when using dim_ref
    download('targets-template.csv', [`# ${t('commercial.refHint')}`, HEAD, ...ex].join('\n'));
  }
  function parseCsv(text: string): TargetRow[] {
    const lines = text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
    if (lines.length === 0) return [];
    const header = lines[0].toLowerCase().split(',').map((s) => s.trim());
    const hasHeader = header.includes('dim_type');
    const cols = hasHeader ? header : ['period', 'dim_type', 'dim_ref', 'dim_id', 'metric', 'amount'];
    const at = (parts: string[], name: string) => { const i = cols.indexOf(name); return i >= 0 ? (parts[i] ?? '').trim() : ''; };
    return lines.slice(hasHeader ? 1 : 0).map((l) => {
      const p = l.split(',');
      return {
        period: at(p, 'period') || month, dim_type: at(p, 'dim_type'), dim_ref: at(p, 'dim_ref') || null,
        dim_id: at(p, 'dim_id') || null, metric: at(p, 'metric'), amount: Number(at(p, 'amount')) || 0,
      };
    });
  }
  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return;
    file.text().then((text) => {
      const rows = parseCsv(text);
      start(async () => {
        const res = await validateTargets(rows);
        if (!res.ok) { toast.error(res.error ?? t('commercial.saveFailed')); return; }
        setIssues({ rows, issues: res.data!.issues });
      });
    });
    e.target.value = '';
  }
  function downloadErrors() {
    const rows = (issues?.issues ?? []).map((i) => [i.row, i.level, i.code, `"${i.message.replace(/"/g, '""')}"`].join(','));
    download('target-errors.csv', ['row,level,code,message', ...rows].join('\n'));
  }
  function commitImport() {
    if (!issues) return;
    start(async () => {
      const res = await importTargets(issues.rows);
      if (!res.ok || !res.data?.ok) { toast.error(t('commercial.importErrors')); return; }
      toast.success(t('commercial.importOk').replace('{n}', String(res.data.imported))); setIssues(null); router.refresh();
    });
  }
  const errors = issues?.issues.filter((i) => i.level === 'error') ?? [];
  const warns = issues?.issues.filter((i) => i.level === 'warning') ?? [];

  return (
    <div className="space-y-3">
      {/* import / export */}
      <div className="flex flex-wrap items-center gap-2">
        <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={onFile} />
        <Button size="sm" variant="outline" onClick={downloadTemplate}><FileDown className="me-1.5 h-4 w-4" />{t('commercial.template')}</Button>
        <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()} disabled={pending}><Upload className="me-1.5 h-4 w-4" />{t('commercial.importCsv')}</Button>
        <Button size="sm" variant="outline" onClick={exportCsv}><Download className="me-1.5 h-4 w-4" />{t('commercial.exportCsv')}</Button>
      </div>

      {/* import preview */}
      {issues && (
        <Card className={errors.length ? 'border-red-500/50' : 'border-green-500/50'}><CardContent className="space-y-2 p-3 text-sm">
          {errors.length > 0 && <><div className="font-medium text-red-600">{t('commercial.importErrors')}</div>
            {errors.map((i, k) => <div key={k} className="text-xs text-red-600">#{i.row}: {i.message}</div>)}</>}
          {warns.length > 0 && <><div className="font-medium text-amber-600">{t('commercial.importWarn')}</div>
            {warns.map((i, k) => <div key={k} className="text-xs text-amber-600">#{i.row}: {i.message}</div>)}</>}
          <div className="flex items-center gap-2 pt-1">
            {errors.length === 0 && <Button size="sm" onClick={commitImport} disabled={pending}>{pending ? <Loader2 className="h-4 w-4 animate-spin" /> : `${t('commercial.commit')} (${issues.rows.length})`}</Button>}
            {issues.issues.length > 0 && <Button size="sm" variant="outline" onClick={downloadErrors}><FileDown className="me-1 h-3.5 w-3.5" />{t('commercial.downloadErrors')}</Button>}
            <Button size="sm" variant="ghost" onClick={() => setIssues(null)}>{t('commercial.cancel')}</Button>
          </div>
        </CardContent></Card>
      )}

      {/* manual entry */}
      <Card><CardContent className="flex flex-wrap items-end gap-2 p-3">
        <select className={selectCls} value={form.dim_type} onChange={(e) => setForm({ ...form, dim_type: e.target.value })}>
          {DIMS.map((d) => <option key={d} value={d}>{t(`commercial.dims.${d}`)}</option>)}
        </select>
        <Input className="h-9 w-40" placeholder={t('commercial.dimId')} value={form.dim_id} onChange={(e) => setForm({ ...form, dim_id: e.target.value })} />
        <select className={selectCls} value={form.metric} onChange={(e) => setForm({ ...form, metric: e.target.value })}>
          <option value="value">{t('commercial.metricValue')}</option><option value="quantity">{t('commercial.metricQty')}</option>
        </select>
        <Input className="h-9 w-28" type="number" inputMode="numeric" placeholder={t('commercial.amount')} value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
        <Button size="sm" onClick={add} disabled={pending}><Plus className="me-1 h-4 w-4" />{t('commercial.addTarget')}</Button>
      </CardContent></Card>

      {/* list */}
      {initial.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">{t('commercial.noTargets')}</CardContent></Card>
      ) : (
        <Card><CardContent className="divide-y p-0">
          {initial.map((r) => (
            <div key={r.id} className="flex items-center gap-2 p-2.5 text-sm">
              <Badge variant="secondary">{t(`commercial.dims.${r.dim_type}`)}</Badge>
              <span className="min-w-0 flex-1 truncate">{r.label ?? r.dim_id ?? '—'}</span>
              <span className="text-xs text-muted-foreground">{t(r.metric === 'quantity' ? 'commercial.metricQty' : 'commercial.metricValue')}</span>
              <span className="w-24 text-end tabular-nums">{Number(r.target_amount).toLocaleString()}</span>
              <Badge variant="outline">{t(`commercial.st.${r.status}`)}</Badge>
              <div className="flex gap-1">
                {r.status === 'draft' && <Button size="sm" variant="ghost" onClick={() => lifecycle(r.id, 'approved')}>{t('commercial.approve')}</Button>}
                {r.status === 'approved' && <Button size="sm" variant="ghost" onClick={() => lifecycle(r.id, 'active')}>{t('commercial.activate')}</Button>}
                {r.status !== 'archived' && <Button size="sm" variant="ghost" onClick={() => lifecycle(r.id, 'archived')}>{t('commercial.archive')}</Button>}
              </div>
            </div>
          ))}
        </CardContent></Card>
      )}
    </div>
  );
}
