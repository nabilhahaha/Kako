/** Approve / reject an exception, capturing the approver and an optional note. */
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { getCurrentOperator } from '../services/session';
import { useDecideException } from '../hooks/mutations';
import { Field } from './primitives';

export function DecisionDialog({
  open,
  onOpenChange,
  exceptionId,
  decision,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  exceptionId: string | null;
  decision: 'approved' | 'rejected';
}) {
  const decide = useDecideException();
  const [approvedBy, setApprovedBy] = useState('');
  const [note, setNote] = useState('');

  useEffect(() => {
    if (open) {
      setApprovedBy(getCurrentOperator());
      setNote('');
    }
  }, [open]);

  if (!exceptionId) return null;

  const submit = async () => {
    if (!approvedBy.trim()) return toast.error('Approver name is required.');
    try {
      await decide.mutateAsync({ id: exceptionId, status: decision, approvedBy, note });
      toast.success(`Exception ${decision}.`);
      onOpenChange(false);
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{decision === 'approved' ? 'Approve' : 'Reject'} exception</DialogTitle>
          <DialogDescription>
            {decision === 'approved'
              ? 'Approving records the approver and covers the linked validation failure.'
              : 'Rejecting keeps the validation failure active.'}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <Field label="Approved by" required>
            <Input value={approvedBy} onChange={(e) => setApprovedBy(e.target.value)} />
          </Field>
          <Field label="Note">
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} />
          </Field>
        </div>
        <div className="flex justify-end gap-2 border-t pt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={decide.isPending}>
            Cancel
          </Button>
          <Button
            variant={decision === 'approved' ? 'default' : 'destructive'}
            onClick={submit}
            disabled={decide.isPending}
          >
            {decide.isPending ? 'Saving…' : decision === 'approved' ? 'Approve' : 'Reject'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
