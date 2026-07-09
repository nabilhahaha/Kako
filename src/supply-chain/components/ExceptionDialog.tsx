/**
 * Create-exception dialog. Exceptions are mandatory to override a validation
 * failure and require a reason and an email attachment. Approver / approval
 * date are captured here optionally and finalised on approval.
 */
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Paperclip } from 'lucide-react';
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
import { formatBytes } from '../utils/format';
import { useCreateException } from '../hooks/mutations';
import { Field } from './primitives';

export interface ExceptionPrefill {
  ruleCode: string;
  piId: string | null;
  piNumber: string;
  deliveryNoteNumber?: string | null;
  sku?: string | null;
}

export function ExceptionDialog({
  open,
  onOpenChange,
  prefill,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  prefill: ExceptionPrefill | null;
}) {
  const create = useCreateException();
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');
  const [approvedBy, setApprovedBy] = useState('');
  const [file, setFile] = useState<File | null>(null);

  useEffect(() => {
    if (open) {
      setReason('');
      setNotes('');
      setApprovedBy('');
      setFile(null);
    }
  }, [open]);

  if (!prefill) return null;

  const submit = async () => {
    if (!reason.trim()) return toast.error('A reason is required.');
    if (!file) return toast.error('An email attachment is required.');
    try {
      await create.mutateAsync({
        ruleCode: prefill.ruleCode,
        piId: prefill.piId,
        piNumber: prefill.piNumber,
        deliveryNoteNumber: prefill.deliveryNoteNumber ?? null,
        sku: prefill.sku ?? null,
        reason,
        notes,
        attachment: file,
        approvedBy: approvedBy.trim() || null,
      });
      toast.success('Exception created and submitted for approval.');
      onOpenChange(false);
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create Exception</DialogTitle>
          <DialogDescription>
            PI {prefill.piNumber}
            {prefill.sku ? ` · SKU ${prefill.sku}` : ''}
            {prefill.deliveryNoteNumber ? ` · DN ${prefill.deliveryNoteNumber}` : ''} ·{' '}
            {prefill.ruleCode}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <Field label="Reason" required>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Why is this failure being accepted?"
              rows={3}
            />
          </Field>

          <Field label="Email attachment" required hint="Attach the approval email or supporting document.">
            <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-dashed px-3 py-3 text-sm transition-colors hover:bg-accent">
              <Paperclip className="h-4 w-4 text-muted-foreground" />
              <span className="flex-1 truncate">
                {file ? `${file.name} · ${formatBytes(file.size)}` : 'Choose file…'}
              </span>
              <input
                type="file"
                className="hidden"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </label>
          </Field>

          <Field label="Approved by" hint="Optional at creation; required to approve.">
            <Input
              value={approvedBy}
              onChange={(e) => setApprovedBy(e.target.value)}
              placeholder="Approver name"
            />
          </Field>

          <Field label="Notes">
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Additional context"
              rows={2}
            />
          </Field>
        </div>

        <div className="flex justify-end gap-2 border-t pt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={create.isPending}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={create.isPending}>
            {create.isPending ? 'Saving…' : 'Create Exception'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
