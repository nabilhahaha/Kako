import { useState } from 'react';
import { Check, X, Loader2 } from 'lucide-react';
import type { ReactNode } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

interface ApprovalCardProps {
  title: string;
  meta: ReactNode;
  details?: ReactNode;
  onApprove: () => Promise<void>;
  onReject: () => Promise<void>;
}

export function ApprovalCard({
  title,
  meta,
  details,
  onApprove,
  onReject,
}: ApprovalCardProps) {
  const [busy, setBusy] = useState<'approve' | 'reject' | null>(null);

  async function run(action: 'approve' | 'reject', fn: () => Promise<void>) {
    setBusy(action);
    try {
      await fn();
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card className="p-4">
      <div className="space-y-2">
        <p className="font-medium text-foreground">{title}</p>
        <div className="text-caption">{meta}</div>
        {details && <div className="pt-2 text-sm text-muted-foreground">{details}</div>}
      </div>

      <div className="mt-4 flex gap-2">
        <Button
          size="sm"
          className="flex-1"
          onClick={() => run('approve', onApprove)}
          disabled={busy !== null}
        >
          {busy === 'approve' ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Check className="h-4 w-4" />
          )}
          موافقة
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="flex-1 text-destructive hover:bg-destructive/10 hover:text-destructive"
          onClick={() => run('reject', onReject)}
          disabled={busy !== null}
        >
          {busy === 'reject' ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <X className="h-4 w-4" />
          )}
          رفض
        </Button>
      </div>
    </Card>
  );
}
