'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { CheckCircle2, XCircle, Inbox, Clock, ClipboardCheck } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { StatCard } from '@/components/shared/stat-card';
import { EmptyState } from '@/components/shared/empty-state';
import { useI18n } from '@/lib/i18n/provider';
import { formatDate, cn } from '@/lib/utils';
import { decideApproval, type ApprovalType } from './queue-actions';

export type { ApprovalType };
export interface ApprovalItem {
  type: ApprovalType;
  id: string;
  primary: string;
  secondary: string;
  status: 'pending' | 'approved' | 'rejected';
  requestedAt: string | null;
  decidedAt: string | null;
  canReject: boolean;
}

const TYPES: ApprovalType[] = ['day_close', 'visit', 'customer_transfer', 'van_transfer', 'trade_spend'];
type StatusFilter = 'pending' | 'approved' | 'rejected' | 'all';
const STATUSES: StatusFilter[] = ['pending', 'approved', 'rejected', 'all'];

export function ApprovalQueue({ items, caps }: { items: ApprovalItem[]; caps: Record<ApprovalType, boolean> }) {
  const { t } = useI18n();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [typeFilter, setTypeFilter] = useState<'all' | ApprovalType>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('pending');
  const [comments, setComments] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  const visibleTypes = TYPES.filter((tp) => caps[tp]);
  const counts = useMemo(() => ({
    pending: items.filter((i) => i.status === 'pending').length,
    approved: items.filter((i) => i.status === 'approved').length,
    rejected: items.filter((i) => i.status === 'rejected').length,
  }), [items]);

  const filtered = items.filter(
    (i) => (typeFilter === 'all' || i.type === typeFilter) && (statusFilter === 'all' || i.status === statusFilter),
  );

  function decide(item: ApprovalItem, approve: boolean) {
    if (!approve && !item.canReject) { toast.info(t('approvalQueue.rejectUnsupported')); return; }
    setBusyId(item.id);
    start(async () => {
      const res = await decideApproval(item.type, item.id, approve, comments[item.id]?.trim() || undefined);
      setBusyId(null);
      if (res.ok) {
        toast.success(approve ? t('approvalQueue.approvedToast') : t('approvalQueue.rejectedToast'));
        setComments((c) => ({ ...c, [item.id]: '' }));
        router.refresh();
      } else {
        toast.error(res.error === 'reject_unsupported' ? t('approvalQueue.rejectUnsupported') : (res.error ?? t('approvalQueue.failed')));
      }
    });
  }

  const statusTone = (s: ApprovalItem['status']) => (s === 'approved' ? 'success' : s === 'rejected' ? 'destructive' : 'warning');

  return (
    <div className="space-y-5">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-bold"><ClipboardCheck className="h-5 w-5 text-primary" />{t('approvalQueue.title')}</h1>
        <p className="text-sm text-muted-foreground">{t('approvalQueue.desc')}</p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <StatCard label={t('approvalQueue.statPending')} value={String(counts.pending)} icon={Clock} tone="warning" />
        <StatCard label={t('approvalQueue.statApproved')} value={String(counts.approved)} icon={CheckCircle2} tone="success" />
        <StatCard label={t('approvalQueue.statRejected')} value={String(counts.rejected)} icon={XCircle} tone="destructive" />
      </div>

      {/* Filters — mobile-first chip rows */}
      <div className="space-y-2">
        <div className="flex flex-wrap gap-2">
          <Chip active={typeFilter === 'all'} onClick={() => setTypeFilter('all')}>{t('approvalQueue.typeAll')}</Chip>
          {visibleTypes.map((tp) => (
            <Chip key={tp} active={typeFilter === tp} onClick={() => setTypeFilter(tp)}>{t(`approvalQueue.type_${tp}`)}</Chip>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          {STATUSES.map((s) => (
            <Chip key={s} active={statusFilter === s} onClick={() => setStatusFilter(s)} subtle>{t(`approvalQueue.filter_${s}`)}</Chip>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={<Inbox className="h-8 w-8" />} title={t('approvalQueue.empty')} />
      ) : (
        <div className="space-y-3">
          {filtered.map((item) => (
            <Card key={`${item.type}-${item.id}`}>
              <CardContent className="space-y-3 p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="shrink-0">{t(`approvalQueue.type_${item.type}`)}</Badge>
                      <span className="truncate font-semibold">{item.primary}</span>
                    </div>
                    {item.secondary && <p className="mt-1 truncate text-sm text-muted-foreground">{item.secondary}</p>}
                    <p className="mt-1 text-xs text-muted-foreground">
                      {t('approvalQueue.requestedOn')} {item.requestedAt ? formatDate(item.requestedAt) : '—'}
                      {item.decidedAt ? ` · ${t('approvalQueue.decidedOn')} ${formatDate(item.decidedAt)}` : ''}
                    </p>
                  </div>
                  <Badge variant={statusTone(item.status)}>{t(`approvalQueue.status_${item.status}`)}</Badge>
                </div>

                {item.status === 'pending' && (
                  <div className="space-y-2">
                    <Input
                      value={comments[item.id] ?? ''}
                      onChange={(e) => setComments((c) => ({ ...c, [item.id]: e.target.value }))}
                      placeholder={t('approvalQueue.commentPlaceholder')}
                    />
                    <div className="flex gap-2">
                      <Button
                        className="flex-1"
                        disabled={pending && busyId === item.id}
                        onClick={() => decide(item, true)}
                      >
                        <CheckCircle2 className="me-1 h-4 w-4" />{t('approvalQueue.approve')}
                      </Button>
                      {item.canReject && (
                        <Button
                          variant="destructive"
                          className="flex-1"
                          disabled={pending && busyId === item.id}
                          onClick={() => decide(item, false)}
                        >
                          <XCircle className="me-1 h-4 w-4" />{t('approvalQueue.reject')}
                        </Button>
                      )}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function Chip({ active, subtle, onClick, children }: { active: boolean; subtle?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
        active
          ? subtle ? 'border-primary bg-primary/10 text-primary' : 'border-primary bg-primary text-primary-foreground'
          : 'border-border bg-background text-muted-foreground hover:bg-muted',
      )}
    >
      {children}
    </button>
  );
}
