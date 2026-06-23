'use client';

import { useCallback, useEffect, useState } from 'react';
import { BarChart3, ListChecks, AlertTriangle, Loader2, RefreshCw } from 'lucide-react';
import { useI18n } from '@/lib/i18n/provider';
import {
  getVerificationSummary, getVerificationDetail, getVerificationExceptions,
  type SummaryReport, type DetailRow, type ExceptionRow,
} from './rp-verification-report-actions';

type T = (k: string, p?: Record<string, string | number>) => string;
type View = 'summary' | 'detail' | 'exceptions';

const fmtDate = (ms: number) => new Date(ms).toLocaleString();
const oldNew = (o: string | null, n: string | null, noChange: string) =>
  o === n || (!o && !n) ? (n ?? o ?? '—') : `${o ?? '—'} → ${n ?? '—'}`;

/**
 * FV-4b — admin/supervisor reports panel. Three read-only views over existing tables
 * (RLS-scoped server-side): Summary (per-rep progress), Detail (every verification),
 * Exceptions (logged out-of-radius / not-assigned attempts). No schema, no writes.
 */
export function VerificationReportsPanel() {
  const { t } = useI18n() as { t: T };
  const [view, setView] = useState<View>('summary');

  const btn = (key: View, label: string, Icon: typeof BarChart3) => (
    <button type="button" onClick={() => setView(key)}
      className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition ${view === key ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`}>
      <Icon className="h-3.5 w-3.5" />{label}
    </button>
  );

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">{t('rpVerifyReports.hint')}</p>
      <div className="flex flex-wrap gap-1 rounded-lg border bg-muted/30 p-1">
        {btn('summary', t('rpVerifyReports.tab_summary'), BarChart3)}
        {btn('detail', t('rpVerifyReports.tab_detail'), ListChecks)}
        {btn('exceptions', t('rpVerifyReports.tab_exceptions'), AlertTriangle)}
      </div>
      {view === 'summary' && <SummaryView t={t} />}
      {view === 'detail' && <DetailView t={t} />}
      {view === 'exceptions' && <ExceptionsView t={t} />}
    </div>
  );
}

function useReport<D>(loader: () => Promise<{ ok: true; data: D } | { ok: false; error: string }>) {
  const [data, setData] = useState<D | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const run = useCallback(async () => {
    setLoading(true); setError(null);
    const res = await loader();
    if (res.ok) setData(res.data); else setError(res.error);
    setLoading(false);
  }, [loader]);
  useEffect(() => { void run(); }, [run]);
  return { data, loading, error, reload: run };
}

function Toolbar({ t, onRefresh, loading }: { t: T; onRefresh: () => void; loading: boolean }) {
  return (
    <div className="flex justify-end">
      <button onClick={onRefresh} disabled={loading} className="inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-semibold disabled:opacity-50">
        {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}{t('rpVerifyReports.refresh')}
      </button>
    </div>
  );
}
function Wrap({ t, loading, error, empty, children }: { t: T; loading: boolean; error: string | null; empty: boolean; children: React.ReactNode }) {
  if (loading) return <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />{t('rpVerifyReports.loading')}</div>;
  if (error) return <p className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">{t(`rpVerifyReports.e_${error}` as 'rpVerifyReports.e_err_forbidden') || error}</p>;
  if (empty) return <p className="rounded-lg border bg-muted/30 px-3 py-8 text-center text-sm text-muted-foreground">{t('rpVerifyReports.empty')}</p>;
  return <>{children}</>;
}

// ── Summary ───────────────────────────────────────────────────────────────────
function SummaryView({ t }: { t: T }) {
  const { data, loading, error, reload } = useReport<SummaryReport>(getVerificationSummary);
  return (
    <div className="space-y-2">
      <Toolbar t={t} onRefresh={reload} loading={loading} />
      <Wrap t={t} loading={loading} error={error} empty={!!data && data.reps.length === 0}>
        {data && (
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-xs">
              <thead className="bg-muted/50 text-muted-foreground">
                <tr>
                  <th className="p-2 text-start">{t('rpVerifyReports.rep')}</th>
                  <th className="p-2 text-end">{t('rpVerifyReports.assigned')}</th>
                  <th className="p-2 text-end">{t('rpVerifyReports.completed')}</th>
                  <th className="p-2 text-end">{t('rpVerifyReports.remaining')}</th>
                  <th className="p-2 text-end">{t('rpVerifyReports.pct')}</th>
                  <th className="p-2 text-start">{t('rpVerifyReports.lastActivity')}</th>
                </tr>
              </thead>
              <tbody>
                {data.reps.map((r) => (
                  <tr key={r.repEmail} className="border-t">
                    <td className="p-2 font-medium">{r.repName}<span className="block text-[10px] text-muted-foreground">{r.repEmail}</span></td>
                    <td className="p-2 text-end tabular-nums">{r.assigned}</td>
                    <td className="p-2 text-end tabular-nums">{r.completed}</td>
                    <td className="p-2 text-end tabular-nums">{r.remaining}</td>
                    <td className="p-2 text-end tabular-nums font-semibold">{r.pct}%</td>
                    <td className="p-2">{r.lastActivity ? fmtDate(r.lastActivity) : '—'}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 bg-muted/30 font-bold">
                  <td className="p-2">{t('rpVerifyReports.totals')}</td>
                  <td className="p-2 text-end tabular-nums">{data.totals.assigned}</td>
                  <td className="p-2 text-end tabular-nums">{data.totals.completed}</td>
                  <td className="p-2 text-end tabular-nums">{data.totals.remaining}</td>
                  <td className="p-2 text-end tabular-nums">{data.totals.pct}%</td>
                  <td className="p-2" />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </Wrap>
    </div>
  );
}

// ── Detail ────────────────────────────────────────────────────────────────────
function DetailView({ t }: { t: T }) {
  const { data, loading, error, reload } = useReport<{ rows: DetailRow[] }>(getVerificationDetail);
  return (
    <div className="space-y-2">
      <Toolbar t={t} onRefresh={reload} loading={loading} />
      <Wrap t={t} loading={loading} error={error} empty={!!data && data.rows.length === 0}>
        {data && (
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-xs">
              <thead className="bg-muted/50 text-muted-foreground">
                <tr>
                  <th className="p-2 text-start">{t('rpVerifyReports.customer')}</th>
                  <th className="p-2 text-start">{t('rpVerifyReports.rep')}</th>
                  <th className="p-2 text-start">{t('rpVerifyReports.verifiedAt')}</th>
                  <th className="p-2 text-start">{t('rpVerifyReports.city')}</th>
                  <th className="p-2 text-start">{t('rpVerifyReports.channel')}</th>
                  <th className="p-2 text-start">{t('rpVerifyReports.phone')}</th>
                  <th className="p-2 text-end">{t('rpVerifyReports.distance')}</th>
                  <th className="p-2 text-end">{t('rpVerifyReports.radius')}</th>
                  <th className="p-2 text-end">{t('rpVerifyReports.photos')}</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r) => (
                  <tr key={r.id} className="border-t align-top">
                    <td className="p-2 font-medium">{r.customerName}<span className="block text-[10px] text-muted-foreground">{r.customerCode ?? ''}</span></td>
                    <td className="p-2">{r.repName}</td>
                    <td className="p-2">{fmtDate(r.verifiedAt)}</td>
                    <td className="p-2">{oldNew(r.oldCity, r.newCity, t('rpVerifyReports.noChange'))}</td>
                    <td className="p-2">{oldNew(r.oldChannel, r.newChannel, t('rpVerifyReports.noChange'))}</td>
                    <td className="p-2">{oldNew(r.oldPhone, r.newPhone, t('rpVerifyReports.noChange'))}</td>
                    <td className="p-2 text-end tabular-nums">{r.distanceM ?? '—'}</td>
                    <td className="p-2 text-end tabular-nums">{r.allowedRadiusM ?? '—'}</td>
                    <td className="p-2 text-end tabular-nums">{r.photoCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Wrap>
    </div>
  );
}

// ── Exceptions ────────────────────────────────────────────────────────────────
function ExceptionsView({ t }: { t: T }) {
  const { data, loading, error, reload } = useReport<{ rows: ExceptionRow[] }>(getVerificationExceptions);
  const label = (result: string) => t(`rpVerifyReports.r_${result}` as 'rpVerifyReports.r_outside_radius') || result;
  return (
    <div className="space-y-2">
      <Toolbar t={t} onRefresh={reload} loading={loading} />
      <Wrap t={t} loading={loading} error={error} empty={!!data && data.rows.length === 0}>
        {data && (
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-xs">
              <thead className="bg-muted/50 text-muted-foreground">
                <tr>
                  <th className="p-2 text-start">{t('rpVerifyReports.when')}</th>
                  <th className="p-2 text-start">{t('rpVerifyReports.rep')}</th>
                  <th className="p-2 text-start">{t('rpVerifyReports.customer')}</th>
                  <th className="p-2 text-start">{t('rpVerifyReports.result')}</th>
                  <th className="p-2 text-end">{t('rpVerifyReports.distance')}</th>
                  <th className="p-2 text-end">{t('rpVerifyReports.radius')}</th>
                  <th className="p-2 text-start">{t('rpVerifyReports.reason')}</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r) => (
                  <tr key={r.id} className="border-t">
                    <td className="p-2">{fmtDate(r.createdAt)}</td>
                    <td className="p-2">{r.repName}</td>
                    <td className="p-2">{r.customerName ?? r.customerCode ?? '—'}</td>
                    <td className="p-2"><span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 font-medium text-amber-800"><AlertTriangle className="h-3 w-3" />{label(r.result)}</span></td>
                    <td className="p-2 text-end tabular-nums">{r.distanceM ?? '—'}</td>
                    <td className="p-2 text-end tabular-nums">{r.allowedRadiusM ?? '—'}</td>
                    <td className="p-2 text-muted-foreground">{r.reason ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Wrap>
    </div>
  );
}
