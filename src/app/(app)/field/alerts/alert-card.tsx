'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Loader2, UserPlus, Play, Check, X, RotateCcw, ChevronRight, Clock, History } from 'lucide-react';
import { useI18n } from '@/lib/i18n/provider';
import { assignAlert, setAlertStatus, getAlertNotes } from './alerts-actions';

export interface Alert {
  id: string; category: string; rule_key: string; severity: 'critical' | 'warning' | 'info'; title: string;
  status: string; due_date: string | null; overdue: boolean; owner_id: string | null; owner: string | null; owner_level: string | null;
  resolution_note: string | null; notes_count: number; seen_count: number; first_seen_at: string; created_at: string;
  route_id: string | null; rep_id: string | null; rep: string | null; customer_id: string | null; customer: string | null; sku: string | null;
  metric: number | null; href: string | null;
}
type Note = { at: string; by_name: string | null; status: string; note: string };

const SEV: Record<string, string> = { critical: 'border-red-500/40 bg-red-500/10 text-red-700', warning: 'border-amber-500/40 bg-amber-500/10 text-amber-700', info: 'border-sky-500/40 bg-sky-500/10 text-sky-700' };
const TERMINAL = ['resolved', 'dismissed'];

/** A single alert in the inbox — severity, lifecycle status, owner, due/overdue +
 *  aging, drill-through and quick actions; resolve captures a note (history). */
export function AlertCard({ alert, currentUserId }: { alert: Alert; currentUserId: string }) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [resolving, setResolving] = useState(false);
  const [note, setNote] = useState('');
  const [notes, setNotes] = useState<Note[] | null>(null);
  const [showNotes, setShowNotes] = useState(false);

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, okMsg: string) => start(async () => {
    const res = await fn();
    if (!res.ok) { toast.error(t('field.alerts.actionFailed')); return; }
    toast.success(okMsg); setResolving(false); setNote(''); router.refresh();
  });
  const ageDays = Math.max(0, Math.floor((Date.now() - new Date(alert.first_seen_at).getTime()) / 86_400_000));
  const fmtDate = (d: string) => new Date(d).toLocaleDateString(locale === 'ar' ? 'ar-EG' : 'en-GB', { day: '2-digit', month: 'short' });

  async function toggleNotes() {
    const next = !showNotes; setShowNotes(next);
    if (next && notes === null) {
      const res = await getAlertNotes(alert.id);
      setNotes(res.ok ? res.data?.notes ?? [] : []);
    }
  }

  return (
    <Card className={alert.overdue ? 'border-amber-500/50' : undefined}>
      <CardContent className="space-y-2 p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge variant="outline" className={SEV[alert.severity]}>{t(`field.alerts.${alert.severity}`)}</Badge>
              <Badge variant="secondary">{t(`field.alerts.category.${alert.category}`)}</Badge>
              <Badge variant="outline">{t(`field.alerts.status.${alert.status}`)}</Badge>
              {alert.overdue && <Badge variant="outline" className="border-amber-500/50 text-amber-700">{t('field.alerts.overdue')}</Badge>}
            </div>
            <div className="text-sm font-medium leading-snug">{alert.title}</div>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
              {alert.rep && <span>{alert.rep}</span>}
              {alert.customer && <span>· {alert.customer}</span>}
              {alert.sku && <span>· {alert.sku}</span>}
            </div>
          </div>
          {alert.href && (
            <Link href={alert.href} className="shrink-0 text-primary" aria-label={t('field.alerts.drill')}><ChevronRight className="h-5 w-5 rtl:rotate-180" /></Link>
          )}
        </div>

        {/* due + aging + owner */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" />{alert.due_date ? `${t('field.alerts.due')} ${fmtDate(alert.due_date)}` : t('field.alerts.noDue')}</span>
          <span>{t('field.alerts.age')}: {ageDays}d</span>
          {alert.seen_count > 1 && <span>{t('field.alerts.seen').replace('{n}', String(alert.seen_count))}</span>}
          <span>· {t('field.alerts.owner')}: {alert.owner ?? '—'}</span>
        </div>

        {/* quick actions */}
        <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
          {alert.owner_id !== currentUserId && !TERMINAL.includes(alert.status) && (
            <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => assignAlert(alert.id, currentUserId), t('field.alerts.assigned'))}>
              <UserPlus className="me-1 h-3.5 w-3.5" />{t('field.alerts.assignMe')}
            </Button>
          )}
          {!TERMINAL.includes(alert.status) && alert.status !== 'in_progress' && (
            <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => setAlertStatus(alert.id, 'in_progress'), t('field.alerts.updated'))}>
              <Play className="me-1 h-3.5 w-3.5" />{t('field.alerts.start')}
            </Button>
          )}
          {!TERMINAL.includes(alert.status) && (
            <>
              <Button size="sm" disabled={pending} onClick={() => setResolving((v) => !v)}><Check className="me-1 h-3.5 w-3.5" />{t('field.alerts.resolve')}</Button>
              <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => setAlertStatus(alert.id, 'dismissed'), t('field.alerts.updated'))}>
                <X className="me-1 h-3.5 w-3.5" />{t('field.alerts.dismiss')}
              </Button>
            </>
          )}
          {TERMINAL.includes(alert.status) && (
            <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => setAlertStatus(alert.id, 'open'), t('field.alerts.updated'))}>
              <RotateCcw className="me-1 h-3.5 w-3.5" />{t('field.alerts.reopen')}
            </Button>
          )}
          {(alert.notes_count > 0 || alert.resolution_note) && (
            <Button size="sm" variant="ghost" onClick={toggleNotes}><History className="me-1 h-3.5 w-3.5" />{t('field.alerts.notesHistory')}{alert.notes_count > 0 ? ` (${alert.notes_count})` : ''}</Button>
          )}
        </div>

        {/* resolve note input */}
        {resolving && (
          <div className="flex items-center gap-2 pt-1">
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('field.alerts.notePlaceholder')} className="h-9" />
            <Button size="sm" disabled={pending} onClick={() => run(() => setAlertStatus(alert.id, 'resolved', note), t('field.alerts.updated'))}>
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : t('field.alerts.confirm')}
            </Button>
          </div>
        )}

        {/* notes history */}
        {showNotes && (
          <div className="space-y-1 rounded-md bg-muted/50 p-2 text-xs">
            {notes === null ? <Loader2 className="h-4 w-4 animate-spin" /> :
              notes.length === 0 ? <span className="text-muted-foreground">{t('field.alerts.noNotes')}</span> :
              notes.map((n, i) => (
                <div key={i} className="border-s-2 border-border ps-2">
                  <div className="text-muted-foreground">{n.by_name ?? '—'} · {t(`field.alerts.status.${n.status}`)} · {fmtDate(n.at)}</div>
                  <div>{n.note}</div>
                </div>
              ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
