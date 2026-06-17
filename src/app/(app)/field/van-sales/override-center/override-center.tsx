'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Check, X, Lock, RotateCcw, Loader2, ShieldAlert } from 'lucide-react';
import { useI18n } from '@/lib/i18n/provider';
import { INTL_LOCALE } from '@/lib/i18n/config';
import { formatCurrency } from '@/lib/utils';
import { overrideReturn, forceCloseDay, reopenClosedDay, type OverrideQueue } from '@/lib/van-sales/override-server';

type Tab = 'returns' | 'dayCloses';
type Pending = { kind: 'return-approve' | 'return-reject' | 'force-close' | 'reopen'; id: string; label: string };

/** Override & Reopen Center: act on returns / day closes with a MANDATORY reason +
 *  optional comment. Every action is audited server-side. */
export function OverrideCenter({ data }: { data: OverrideQueue }) {
  const { t, locale } = useI18n();
  const intl = INTL_LOCALE[locale];
  const ol = (k: string) => t(`override.${k}`);
  const [tab, setTab] = useState<Tab>(data.canOverrideReturn ? 'returns' : 'dayCloses');
  const [returns, setReturns] = useState(data.returns);
  const [dayCloses, setDayCloses] = useState(data.dayCloses);
  const [pending, setPending] = useState<Pending | null>(null);
  const [reason, setReason] = useState('');
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);

  function ask(kind: Pending['kind'], id: string, label: string) {
    setPending({ kind, id, label }); setReason(''); setComment('');
  }

  async function confirm() {
    if (!pending) return;
    if (!reason.trim()) { toast.error(ol('reasonRequired')); return; }
    setBusy(true);
    try {
      let ok = false; let err: string | undefined;
      if (pending.kind === 'return-approve' || pending.kind === 'return-reject') {
        const res = await overrideReturn({ returnId: pending.id, decision: pending.kind === 'return-approve' ? 'approve' : 'reject', reason: reason.trim(), comment: comment.trim() || undefined });
        ok = res.ok; err = res.error; if (ok) setReturns((l) => l.filter((x) => x.id !== pending.id));
      } else if (pending.kind === 'force-close') {
        const res = await forceCloseDay({ requestId: pending.id, reason: reason.trim(), comment: comment.trim() || undefined });
        ok = res.ok; err = res.error; if (ok) setDayCloses((l) => l.filter((x) => x.id !== pending.id));
      } else {
        const res = await reopenClosedDay({ requestId: pending.id, reason: reason.trim(), comment: comment.trim() || undefined });
        ok = res.ok; err = res.error; if (ok) setDayCloses((l) => l.filter((x) => x.id !== pending.id));
      }
      if (!ok) { toast.error(err ?? ol('error')); return; }
      toast.success(ol('done'));
      setPending(null);
    } finally { setBusy(false); }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/5 p-3 text-xs">
        <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
        <span>{ol('governanceNote')}</span>
      </div>

      <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1 text-sm font-medium">
        <button type="button" onClick={() => setTab('returns')} className={`rounded-md py-1.5 ${tab === 'returns' ? 'bg-background shadow-sm' : 'text-muted-foreground'}`}>{ol('tabReturns')} ({returns.length})</button>
        <button type="button" onClick={() => setTab('dayCloses')} className={`rounded-md py-1.5 ${tab === 'dayCloses' ? 'bg-background shadow-sm' : 'text-muted-foreground'}`}>{ol('tabDayCloses')} ({dayCloses.length})</button>
      </div>

      {tab === 'returns' ? (
        returns.length === 0 ? <Empty label={ol('emptyReturns')} /> : returns.map((r) => (
          <Card key={r.id}><CardContent className="space-y-2 pt-5">
            <Header doc={r.document} party={r.customer} value={formatCurrency(r.value, 'EGP', intl)} status={ol(`st_${r.status}`)} intl={intl} />
            <Meta label={ol('requestedBy')} value={r.requestedBy} />
            <Meta label={ol('requestedAt')} value={r.requestedAt ? new Date(r.requestedAt).toLocaleString(intl) : '—'} />
            {r.reason && <Meta label={ol('reason')} value={r.reason} />}
            {data.canOverrideReturn && (
              <div className="flex gap-2 pt-1">
                <Button variant="outline" className="flex-1 border-destructive/40 text-destructive hover:bg-destructive/10" onClick={() => ask('return-reject', r.id, r.document)}><X className="h-4 w-4" /> {ol('forceReject')}</Button>
                <Button className="flex-1" onClick={() => ask('return-approve', r.id, r.document)}><Check className="h-4 w-4" /> {ol('forceApprove')}</Button>
              </div>
            )}
          </CardContent></Card>
        ))
      ) : (
        dayCloses.length === 0 ? <Empty label={ol('emptyDayCloses')} /> : dayCloses.map((d) => (
          <Card key={d.id}><CardContent className="space-y-2 pt-5">
            <Header doc={d.document} party={d.salesman} value={d.value != null ? formatCurrency(d.value, 'EGP', intl) : '—'} status={ol(`day_${d.status}`) || d.status} intl={intl} />
            <Meta label={ol('requestedAt')} value={d.requestedAt ? new Date(d.requestedAt).toLocaleString(intl) : '—'} />
            <div className="flex gap-2 pt-1">
              {d.closed ? (
                data.canReopen && <Button variant="outline" className="flex-1" onClick={() => ask('reopen', d.id, d.document)}><RotateCcw className="h-4 w-4" /> {ol('reopen')}</Button>
              ) : (
                data.canForceClose && <Button variant="outline" className="flex-1" onClick={() => ask('force-close', d.id, d.document)}><Lock className="h-4 w-4" /> {ol('forceClose')}</Button>
              )}
            </div>
          </CardContent></Card>
        ))
      )}

      {/* Mandatory reason dialog */}
      {pending && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4" onClick={() => !busy && setPending(null)}>
          <div className="w-full max-w-md space-y-3 rounded-t-2xl border bg-card p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:rounded-2xl sm:pb-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-bold">{ol(`confirm_${pending.kind}`)}</h3>
            <p className="text-xs text-muted-foreground" dir="ltr">{pending.label}</p>
            <div className="space-y-1.5">
              <Label className="text-xs">{ol('reason')} *</Label>
              <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder={ol('reasonPlaceholder')} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">{ol('comment')} <span className="text-muted-foreground">({ol('optional')})</span></Label>
              <Input value={comment} onChange={(e) => setComment(e.target.value)} placeholder={ol('commentPlaceholder')} />
            </div>
            <div className="flex gap-2 pt-1">
              <Button variant="outline" className="flex-1" disabled={busy} onClick={() => setPending(null)}>{ol('cancel')}</Button>
              <Button className="flex-1" disabled={busy || !reason.trim()} onClick={confirm}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : ol('confirm')}</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Header({ doc, party, value, status }: { doc: string; party: string; value: string; status: string; intl: string }) {
  return (
    <div className="flex items-start justify-between gap-2">
      <div className="min-w-0">
        <div className="truncate text-sm font-semibold">{party}</div>
        <div className="text-xs text-muted-foreground" dir="ltr">{doc}</div>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <span className="font-bold tabular-nums" dir="ltr">{value}</span>
        <Badge variant="secondary">{status}</Badge>
      </div>
    </div>
  );
}
function Meta({ label, value }: { label: string; value: string }) {
  return <div className="flex items-center justify-between gap-2 text-xs"><span className="text-muted-foreground">{label}</span><span className="truncate text-end font-medium">{value}</span></div>;
}
function Empty({ label }: { label: string }) {
  return <Card><CardContent className="pt-6 text-center text-sm text-muted-foreground">{label}</CardContent></Card>;
}
