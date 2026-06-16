'use client';

import { useMemo, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Check, X, Loader2, Clock, ChevronDown, ChevronUp, User, ShieldCheck } from 'lucide-react';
import { useI18n } from '@/lib/i18n/provider';
import { INTL_LOCALE } from '@/lib/i18n/config';
import { formatCurrency } from '@/lib/utils';
import { decideVanReturn, markReturnViewed, type PendingReturnRow } from '@/lib/van-sales/returns-server';
import { pendingBucket, pendingAgeHours } from '@/lib/van-sales/return-sla';

const LEVEL_KEY: Record<string, string> = { supervisor: 'lvlSupervisor', branch_manager: 'lvlBranchManager', company_admin: 'lvlCompanyAdmin' };

/** Approver queue: review held returns and approve / reject (mandatory reason) with
 *  an optional comment. Opening a card stamps first-viewed (SLA). Decided rows drop
 *  out of the list. SLA age badges flag pending > 24h / > 48h. */
export function ApprovalsQueue({ items, slaEnabled }: { items: PendingReturnRow[]; slaEnabled: boolean }) {
  const { t, locale } = useI18n();
  const intl = INTL_LOCALE[locale];
  const now = new Date();
  const [rows, setRows] = useState(items);
  const [open, setOpen] = useState<string | null>(null);
  const [viewed, setViewed] = useState<Record<string, string | null>>(() =>
    Object.fromEntries(items.map((i) => [i.id, i.firstViewedAt])));
  const [reason, setReason] = useState('');
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState<'' | 'approve' | 'reject'>('');
  const al = (k: string, params?: Record<string, string | number>) => t(`vanSales.approvals.${k}`, params);

  const summary = useMemo(() => {
    let o24 = 0; let o48 = 0;
    for (const r of rows) {
      const b = pendingBucket(r.requestedAt, now);
      if (b === 'over_48h') { o48 += 1; o24 += 1; } else if (b === 'over_24h') { o24 += 1; }
    }
    return { total: rows.length, o24, o48 };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows]);

  function toggle(r: PendingReturnRow) {
    if (open === r.id) { setOpen(null); return; }
    setOpen(r.id); setReason(''); setComment('');
    // Stamp first-viewed once (no-op server-side when SLA tracking is off).
    if (!viewed[r.id]) {
      void markReturnViewed(r.id).then((res) => {
        if (res.ok && res.data?.firstViewedAt) setViewed((m) => ({ ...m, [r.id]: res.data!.firstViewedAt }));
      });
    }
  }

  async function decide(r: PendingReturnRow, decision: 'approve' | 'reject') {
    if (decision === 'reject' && !reason.trim()) { toast.error(al('reasonRequired')); return; }
    setBusy(decision);
    try {
      const res = await decideVanReturn({ return_id: r.id, decision, reason: reason.trim() || undefined, comment: comment.trim() || undefined });
      if (!res.ok) { toast.error(res.error ?? al('error')); return; }
      setRows((list) => list.filter((x) => x.id !== r.id));
      setOpen(null);
      toast.success(decision === 'approve' ? al('approvedToast', { number: r.returnNumber }) : al('rejectedToast', { number: r.returnNumber }));
    } finally { setBusy(''); }
  }

  if (rows.length === 0) {
    return <Card><CardContent className="pt-6 text-center text-sm text-muted-foreground">{al('empty')}</CardContent></Card>;
  }

  return (
    <div className="space-y-3">
      {/* Workload summary */}
      <div className="flex flex-wrap gap-2 text-xs">
        <Badge variant="secondary">{al('pendingCount', { n: summary.total })}</Badge>
        {summary.o24 > 0 && <Badge variant="warning">{al('over24Count', { n: summary.o24 })}</Badge>}
        {summary.o48 > 0 && <Badge variant="destructive">{al('over48Count', { n: summary.o48 })}</Badge>}
      </div>

      {rows.map((r) => {
        const bucket = pendingBucket(r.requestedAt, now);
        const ageH = Math.floor(pendingAgeHours(r.requestedAt, now) ?? 0);
        const isOpen = open === r.id;
        return (
          <Card key={r.id}>
            <CardContent className="space-y-3 pt-5">
              <button type="button" onClick={() => toggle(r)} className="flex w-full items-start justify-between gap-2 text-start">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-semibold">{r.customerName}</span>
                    <Badge variant={r.returnType === 'damage' ? 'destructive' : 'secondary'} className="shrink-0">
                      {al(r.returnType === 'damage' ? 'typeDamage' : 'typeSaleable')}
                    </Badge>
                  </div>
                  <div className="mt-0.5 text-xs text-muted-foreground" dir="ltr">{r.returnNumber} · {r.customerCode}</div>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <span className="font-bold tabular-nums" dir="ltr">{formatCurrency(r.value, 'EGP', intl)}</span>
                  <Badge variant={bucket === 'over_48h' ? 'destructive' : bucket === 'over_24h' ? 'warning' : 'outline'} className="gap-1">
                    <Clock className="h-3 w-3" /> {al('ageHours', { h: ageH })}
                  </Badge>
                </div>
              </button>

              {/* Compact meta row */}
              <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                <Meta label={al('requestedBy')} value={r.requesterName || '—'} icon={<User className="h-3 w-3" />} />
                <Meta label={al('requestedAt')} value={r.requestedAt ? new Date(r.requestedAt).toLocaleString(intl) : '—'} />
                <Meta label={al('policyMatched')} value={r.policyLabel.startsWith('default:') ? al('policyDefault') : r.policyLabel} />
                <Meta label={al('lines')} value={String(r.lineCount)} />
                <Meta label={al('primary')} value={al(LEVEL_KEY[r.approver] ?? 'lvlSupervisor')} icon={<ShieldCheck className="h-3 w-3" />} />
                {r.backupApprover && <Meta label={al('backup')} value={al(LEVEL_KEY[r.backupApprover] ?? 'lvlSupervisor')} />}
                {slaEnabled && <Meta label={al('firstViewed')} value={viewed[r.id] ? new Date(viewed[r.id]!).toLocaleString(intl) : al('notViewed')} />}
              </div>

              <button type="button" onClick={() => toggle(r)} className="flex items-center gap-1 text-xs font-medium text-primary">
                {isOpen ? <><ChevronUp className="h-3.5 w-3.5" /> {al('hide')}</> : <><ChevronDown className="h-3.5 w-3.5" /> {al('review')}</>}
              </button>

              {isOpen && (
                <div className="space-y-3 rounded-md border bg-secondary/20 p-3">
                  {r.notes && <p className="text-xs"><span className="text-muted-foreground">{al('notes')}: </span>{r.notes}</p>}
                  <div className="space-y-1.5">
                    <Label className="text-xs">{al('comment')} <span className="text-muted-foreground">({al('optional')})</span></Label>
                    <Input value={comment} onChange={(e) => setComment(e.target.value)} placeholder={al('commentPlaceholder')} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">{al('reason')} <span className="text-muted-foreground">({al('rejectOnly')})</span></Label>
                    <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder={al('reasonPlaceholder')} />
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" className="flex-1 border-destructive/40 text-destructive hover:bg-destructive/10" disabled={busy !== ''} onClick={() => decide(r, 'reject')}>
                      {busy === 'reject' ? <Loader2 className="h-4 w-4 animate-spin" /> : <><X className="h-4 w-4" /> {al('reject')}</>}
                    </Button>
                    <Button className="flex-[2]" disabled={busy !== ''} onClick={() => decide(r, 'approve')}>
                      {busy === 'approve' ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Check className="h-4 w-4" /> {al('approve')}</>}
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

function Meta({ label, value, icon }: { label: string; value: string; icon?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="flex items-center gap-1 text-muted-foreground">{icon}{label}</span>
      <span className="truncate text-end font-medium">{value}</span>
    </div>
  );
}
