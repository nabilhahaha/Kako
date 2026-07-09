/** Exception Management — review, approve and reject validation exceptions. */
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Paperclip, ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { NativeSelect } from '@/components/ui/native-select';
import { Skeleton } from '@/components/ui/skeleton';
import { EXCEPTION_STATUS_LABELS, type ExceptionStatus } from '../domain/enums';
import { useExceptions } from '../hooks/queries';
import { ExceptionStatusBadge } from '../components/badges';
import { DecisionDialog } from '../components/DecisionDialog';
import { EmptyState, PageHeader, StatTile } from '../components/primitives';
import { formatDateTime } from '../utils/format';

export function ExceptionsPage() {
  const { data: exceptions, isLoading } = useExceptions();
  const navigate = useNavigate();
  const [filter, setFilter] = useState<ExceptionStatus | 'ALL'>('ALL');
  const [decision, setDecision] = useState<{ id: string; decision: 'approved' | 'rejected' } | null>(null);

  const counts = useMemo(() => {
    const c = { pending: 0, approved: 0, rejected: 0 };
    for (const e of exceptions ?? []) c[e.status] += 1;
    return c;
  }, [exceptions]);

  const filtered = (exceptions ?? []).filter((e) => filter === 'ALL' || e.status === filter);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Exceptions"
        description="Mandatory overrides for validation failures. Permanently linked and never deleted."
      />

      <div className="grid grid-cols-3 gap-3">
        <StatTile label="Pending" value={counts.pending} className={counts.pending > 0 ? 'border-warning/40' : ''} />
        <StatTile label="Approved" value={counts.approved} />
        <StatTile label="Rejected" value={counts.rejected} />
      </div>

      <Card className="p-3">
        <div className="sm:w-56">
          <NativeSelect value={filter} onChange={(e) => setFilter(e.target.value as ExceptionStatus | 'ALL')}>
            <option value="ALL">All statuses</option>
            {(['pending', 'approved', 'rejected'] as ExceptionStatus[]).map((s) => (
              <option key={s} value={s}>
                {EXCEPTION_STATUS_LABELS[s]}
              </option>
            ))}
          </NativeSelect>
        </div>
      </Card>

      {isLoading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<ShieldAlert className="h-8 w-8" />}
          title="No exceptions"
          description="Exceptions are created from failing validation results on a PI."
        />
      ) : (
        <div className="space-y-3">
          {filtered.map((ex) => (
            <Card key={ex.id}>
              <CardContent className="space-y-3 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <ExceptionStatusBadge status={ex.status} />
                    <button
                      type="button"
                      className="text-sm font-semibold text-maroon hover:underline"
                      onClick={() => ex.piId && navigate(`/supply-chain/pi/${ex.piId}`)}
                    >
                      {ex.piNumber}
                    </button>
                    <span className="text-xs font-medium text-muted-foreground">{ex.ruleCode}</span>
                    {ex.sku && <span className="text-xs text-muted-foreground">SKU {ex.sku}</span>}
                    {ex.deliveryNoteNumber && (
                      <span className="text-xs text-muted-foreground">DN {ex.deliveryNoteNumber}</span>
                    )}
                  </div>
                  {ex.status === 'pending' && (
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => setDecision({ id: ex.id, decision: 'approved' })}>
                        Approve
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setDecision({ id: ex.id, decision: 'rejected' })}>
                        Reject
                      </Button>
                    </div>
                  )}
                </div>
                <p className="text-sm">{ex.reason}</p>
                {ex.notes && <p className="text-sm text-muted-foreground">{ex.notes}</p>}
                <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground">
                  <span>Raised by {ex.createdBy} · {formatDateTime(ex.createdAt)}</span>
                  {ex.approvedBy && (
                    <span>Decided by {ex.approvedBy} · {formatDateTime(ex.approvalDate)}</span>
                  )}
                  {ex.emailAttachment && (
                    <a
                      href={ex.emailAttachment.dataUrl}
                      download={ex.emailAttachment.name}
                      className="inline-flex items-center gap-1 text-info hover:underline"
                    >
                      <Paperclip className="h-3 w-3" /> {ex.emailAttachment.name}
                    </a>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <DecisionDialog
        open={Boolean(decision)}
        onOpenChange={(open) => !open && setDecision(null)}
        exceptionId={decision?.id ?? null}
        decision={decision?.decision ?? 'approved'}
      />
    </div>
  );
}
