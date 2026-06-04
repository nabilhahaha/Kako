'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Search } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { EmptyState } from '@/components/shared/empty-state';
import { useI18n } from '@/lib/i18n/provider';
import { formatCurrency, formatNumber } from '@/lib/utils';
import {
  salesSummary,
  coverageSummary,
  type SalesSummaryRow,
  type CoverageSummaryRow,
} from '@/app/(app)/fmcg/actions';

export interface BranchOption {
  id: string;
  label: string;
}

function monthStart() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}
const TODAY = new Date().toISOString().slice(0, 10);

export function SalesSummaryScreen({
  branches,
  branchLabels,
}: {
  branches: BranchOption[];
  branchLabels: Record<string, string>;
}) {
  const { t } = useI18n();
  const [, startTransition] = useTransition();

  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(TODAY);
  const [branchId, setBranchId] = useState('');
  const [sales, setSales] = useState<SalesSummaryRow[] | null>(null);
  const [coverage, setCoverage] = useState<CoverageSummaryRow | null>(null);

  function run() {
    startTransition(async () => {
      const [s, c] = await Promise.all([
        salesSummary(from, to, branchId || null),
        coverageSummary(from, to),
      ]);
      if (!s.ok) {
        toast.error(s.error ?? t('fmcgw1.error'));
        return;
      }
      setSales(s.data ?? []);
      setCoverage(c.ok && c.data && c.data.length > 0 ? c.data[0] : null);
    });
  }

  const totals = (sales ?? []).reduce(
    (acc, r) => ({
      net: acc.net + Number(r.net_sales),
      paid: acc.paid + Number(r.paid),
      outstanding: acc.outstanding + Number(r.outstanding),
      invoices: acc.invoices + Number(r.invoice_count),
    }),
    { net: 0, paid: 0, outstanding: 0, invoices: 0 },
  );

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 p-4">
          <div className="space-y-1">
            <Label>{t('fmcgw1.from')}</Label>
            <Input type="date" dir="ltr" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>{t('fmcgw1.to')}</Label>
            <Input type="date" dir="ltr" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>{t('fmcgw1.sumBranch')}</Label>
            <Select value={branchId} onChange={(e) => setBranchId(e.target.value)} className="min-w-44">
              <option value="">—</option>
              {branches.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}
            </Select>
          </div>
          <Button onClick={run}>
            <Search className="h-4 w-4" /> {t('fmcgw1.apply')}
          </Button>
        </CardContent>
      </Card>

      {sales == null ? null : (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Kpi label={t('fmcgw1.sumNetSales')} value={formatCurrency(totals.net)} />
            <Kpi label={t('fmcgw1.sumPaid')} value={formatCurrency(totals.paid)} />
            <Kpi label={t('fmcgw1.sumOutstanding')} value={formatCurrency(totals.outstanding)} tone="warn" />
            <Kpi label={t('fmcgw1.sumInvoices')} value={formatNumber(totals.invoices)} />
          </div>

          {coverage && (
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <Kpi label={t('fmcgw1.sumAvgCoverage')} value={coverage.avg_coverage == null ? '—' : `${coverage.avg_coverage}%`} />
              <Kpi label={t('fmcgw1.sumSessions')} value={formatNumber(coverage.sessions)} />
              <Kpi label={t('fmcgw1.sumGpsViolations')} value={formatNumber(coverage.gps_violations)} />
              <Kpi label={t('fmcgw1.sumOutOfRoute')} value={formatNumber(coverage.out_of_route)} />
            </div>
          )}

          {sales.length === 0 ? (
            <EmptyState title={t('fmcgw1.sumEmpty')} />
          ) : (
            <Card>
              <CardContent className="p-0">
                <div className="border-b p-3 font-semibold">{t('fmcgw1.sumSalesByBranch')}</div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="border-b bg-secondary/50 text-muted-foreground">
                      <tr>
                        <th className="p-3 text-start font-medium">{t('fmcgw1.sumBranch')}</th>
                        <th className="p-3 text-center font-medium">{t('fmcgw1.sumNetSales')}</th>
                        <th className="p-3 text-center font-medium">{t('fmcgw1.sumPaid')}</th>
                        <th className="p-3 text-center font-medium">{t('fmcgw1.sumOutstanding')}</th>
                        <th className="p-3 text-center font-medium">{t('fmcgw1.sumInvoices')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sales.map((r) => (
                        <tr key={r.branch_id} className="border-b">
                          <td className="p-3 font-medium">{branchLabels[r.branch_id] ?? '—'}</td>
                          <td className="p-3 text-center tabular-nums" dir="ltr">{formatCurrency(r.net_sales)}</td>
                          <td className="p-3 text-center tabular-nums" dir="ltr">{formatCurrency(r.paid)}</td>
                          <td className="p-3 text-center tabular-nums" dir="ltr">{formatCurrency(r.outstanding)}</td>
                          <td className="p-3 text-center tabular-nums" dir="ltr">{formatNumber(r.invoice_count)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

function Kpi({ label, value, tone }: { label: string; value: string; tone?: 'warn' }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className={`text-lg font-bold tabular-nums ${tone === 'warn' ? 'text-warning' : ''}`} dir="ltr">{value}</p>
      </CardContent>
    </Card>
  );
}
