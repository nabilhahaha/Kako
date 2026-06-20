'use client';

import { useEffect, useState } from 'react';
import { X, MapPin, MapPinOff, Route as RouteIcon, User, CalendarCheck, AlertTriangle, Lightbulb, Swords, Image as ImageIcon, ListChecks, MessageSquare, Building2 } from 'lucide-react';
import { useI18n } from '@/lib/i18n/provider';
import type { DpCustomer } from '@/lib/tis/day-planner-import';
import { customerInsight } from './rp-mission-actions';

type Insight = { visits: number; lastVisitAt: number | null; issues: number; opportunities: number; competitors: number; photos: number; followUps: number; notes: number };

/**
 * Customer Insight — a premium side drawer surfaced when a customer is clicked. Planner-only:
 * basic info, GPS status, route/territory, visit history + field signals (issues / opportunities
 * / competitors / photos / follow-ups) aggregated from mission history (RLS-scoped). Sales /
 * last-invoice show ONLY when present in the imported dataset (no ERP sales screens). Mobile:
 * bottom sheet; desktop: right drawer.
 */
export function CustomerInsightPanel({ customer, onClose }: { customer: DpCustomer; onClose: () => void }) {
  const { t } = useI18n();
  const [ins, setIns] = useState<Insight | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let on = true; setLoading(true);
    void customerInsight(customer.code ?? '').then((r) => { if (on) { setIns(r.ok ? (r.data ?? null) : null); setLoading(false); } });
    return () => { on = false; };
  }, [customer.code]);

  const hasGeo = Number.isFinite(customer.lat) && Number.isFinite(customer.lng) && !(customer.lat === 0 && customer.lng === 0);
  const sales = typeof customer.sales === 'number' ? customer.sales : undefined;
  const lastInvoice = (customer as { lastInvoiceDate?: string | null }).lastInvoiceDate ?? null;

  const signals: { v: number; label: string; icon: typeof AlertTriangle; tone: string }[] = ins ? [
    { v: ins.issues, label: t('rpShell.mn_obsIssue'), icon: AlertTriangle, tone: 'text-orange-600' },
    { v: ins.opportunities, label: t('rpShell.mn_obsOpportunity'), icon: Lightbulb, tone: 'text-yellow-600' },
    { v: ins.competitors, label: t('rpShell.mn_obsCompetitor'), icon: Swords, tone: 'text-rose-600' },
    { v: ins.photos, label: t('rpShell.mn_obsPhoto'), icon: ImageIcon, tone: 'text-sky-600' },
    { v: ins.followUps, label: t('rpShell.mn_obsFollowUp'), icon: ListChecks, tone: 'text-teal-600' },
    { v: ins.notes, label: t('rpShell.mn_obsNote'), icon: MessageSquare, tone: 'text-violet-600' },
  ] : [];

  const info: { icon: typeof MapPin; label: string; value: string; tone?: string }[] = [
    { icon: hasGeo ? MapPin : MapPinOff, label: t('rpShell.ci_gps'), value: hasGeo ? t('rpShell.ci_gpsOk') : t('rpShell.ci_gpsMissing'), tone: hasGeo ? 'text-emerald-600' : 'text-red-600' },
    { icon: RouteIcon, label: t('rpShell.ci_route'), value: customer.salesman || (customer as { route?: string | null }).route || '—' },
    { icon: Building2, label: t('rpShell.ci_territory'), value: customer.area || customer.region || customer.city || '—' },
    { icon: User, label: t('rpShell.ci_channel'), value: customer.channel || customer.class || '—' },
  ];

  return (
    <div className="fixed inset-0 z-40 flex justify-end" role="dialog" aria-modal="true">
      <button aria-label="close" onClick={onClose} className="absolute inset-0 bg-black/30" />
      <div className="relative flex h-full w-full max-w-md flex-col bg-background shadow-2xl sm:rounded-s-2xl">
        {/* Header */}
        <div className="flex items-start justify-between gap-2 border-b p-4">
          <div className="min-w-0">
            <p className="truncate text-lg font-bold">{customer.name}</p>
            {customer.code && <p className="text-xs text-muted-foreground">{customer.code}</p>}
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 hover:bg-muted"><X className="h-5 w-5" /></button>
        </div>

        <div className="min-h-0 flex-1 space-y-3 overflow-auto p-4">
          {/* Basic info */}
          <div className="grid grid-cols-2 gap-2">
            {info.map((x) => (
              <div key={x.label} className="rounded-xl border bg-card p-3">
                <p className="flex items-center gap-1 text-[11px] text-muted-foreground"><x.icon className={`h-3.5 w-3.5 ${x.tone ?? ''}`} /> {x.label}</p>
                <p className={`mt-0.5 truncate text-sm font-medium ${x.tone ?? ''}`}>{x.value}</p>
              </div>
            ))}
          </div>

          {/* Visit history */}
          <div className="rounded-xl border bg-card p-3">
            <p className="mb-2 flex items-center gap-1.5 text-sm font-bold"><CalendarCheck className="h-4 w-4 text-primary" /> {t('rpShell.ci_visits')}</p>
            {loading ? (
              <div className="flex gap-3"><div className="h-12 w-20 animate-pulse rounded bg-muted" /><div className="h-12 w-24 animate-pulse rounded bg-muted" /></div>
            ) : (
              <div className="flex flex-wrap gap-4">
                <div><p className="text-2xl font-bold tabular-nums">{ins?.visits ?? 0}</p><p className="text-[11px] text-muted-foreground">{t('rpShell.ci_visitCount')}</p></div>
                <div><p className="text-sm font-medium">{ins?.lastVisitAt ? new Date(ins.lastVisitAt).toLocaleDateString() : '—'}</p><p className="text-[11px] text-muted-foreground">{t('rpShell.ci_lastVisit')}</p></div>
              </div>
            )}
          </div>

          {/* Field signals */}
          <div className="rounded-xl border bg-card p-3">
            <p className="mb-2 text-sm font-bold">{t('rpShell.db_fieldFeed')}</p>
            {loading ? (
              <div className="grid grid-cols-3 gap-2">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-12 animate-pulse rounded bg-muted/50" />)}</div>
            ) : (
              <div className="grid grid-cols-3 gap-2">
                {signals.map((s) => (
                  <div key={s.label} className="rounded-lg bg-muted/30 p-2 text-center">
                    <s.icon className={`mx-auto h-4 w-4 ${s.tone}`} />
                    <p className="mt-1 text-base font-bold tabular-nums">{s.v}</p>
                    <p className="text-[10px] text-muted-foreground">{s.label}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Sales — only when present in the imported dataset (no ERP sales screen). */}
          {(sales !== undefined || lastInvoice) && (
            <div className="rounded-xl border bg-card p-3">
              <p className="mb-2 text-sm font-bold">{t('rpShell.ci_fromData')}</p>
              <div className="flex flex-wrap gap-4 text-sm">
                {sales !== undefined && <div><p className="font-bold tabular-nums">{sales.toLocaleString()}</p><p className="text-[11px] text-muted-foreground">{t('rpShell.ci_salesValue')}</p></div>}
                {lastInvoice && <div><p className="font-medium">{lastInvoice}</p><p className="text-[11px] text-muted-foreground">{t('rpShell.ci_lastInvoice')}</p></div>}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
