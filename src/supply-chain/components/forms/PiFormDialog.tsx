/** Create / edit a PI with its SKU lines — ERP-style header + line grid. */
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Plus, Trash2 } from 'lucide-react';
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Field } from '../primitives';
import { useCreatePi, useUpdatePi } from '../../hooks/mutations';
import type { PiDetail } from '../../services/piService';
import { todayIso } from '../../utils/dates';

interface LineDraft {
  key: number;
  sku: string;
  description: string;
  quantity: string;
  unitPrice: string;
}

let counter = 0;
const emptyLine = (): LineDraft => ({
  key: counter++,
  sku: '',
  description: '',
  quantity: '',
  unitPrice: '',
});

export function PiFormDialog({
  open,
  onOpenChange,
  editing,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing?: PiDetail | null;
}) {
  const createPi = useCreatePi();
  const updatePi = useUpdatePi();
  const isEdit = Boolean(editing);

  const [piNumber, setPiNumber] = useState('');
  const [customer, setCustomer] = useState('');
  const [creationDate, setCreationDate] = useState(todayIso());
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<LineDraft[]>([emptyLine()]);

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setPiNumber(editing.pi.piNumber);
      setCustomer(editing.pi.customer);
      setCreationDate(editing.pi.creationDate.slice(0, 10));
      setNotes(editing.pi.notes ?? '');
      setLines(
        editing.lines.map((l) => ({
          key: counter++,
          sku: l.sku,
          description: l.description,
          quantity: String(l.quantity),
          unitPrice: l.unitPrice == null ? '' : String(l.unitPrice),
        })),
      );
    } else {
      setPiNumber('');
      setCustomer('');
      setCreationDate(todayIso());
      setNotes('');
      setLines([emptyLine()]);
    }
  }, [open, editing]);

  const setLine = (key: number, patch: Partial<LineDraft>) =>
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const removeLine = (key: number) => setLines((prev) => prev.filter((l) => l.key !== key));

  const pending = createPi.isPending || updatePi.isPending;

  const submit = async () => {
    const input = {
      piNumber,
      customer,
      creationDate,
      notes,
      lines: lines
        .filter((l) => l.sku.trim())
        .map((l) => ({
          sku: l.sku,
          description: l.description,
          quantity: Number(l.quantity) || 0,
          unitPrice: l.unitPrice ? Number(l.unitPrice) : null,
        })),
    };
    try {
      if (editing) {
        await updatePi.mutateAsync({ id: editing.pi.id, input });
        toast.success(`PI ${piNumber} updated.`);
      } else {
        await createPi.mutateAsync(input);
        toast.success(`PI ${piNumber} created.`);
      }
      onOpenChange(false);
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? `Edit PI ${editing?.pi.piNumber}` : 'New Proforma Invoice'}</DialogTitle>
          <DialogDescription>
            Enter the PI header and its ordered SKUs. Validation runs automatically on save.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[68vh] space-y-5 overflow-y-auto pe-1">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="PI number" required>
              <Input value={piNumber} onChange={(e) => setPiNumber(e.target.value)} placeholder="PI-2026-001" />
            </Field>
            <Field label="Customer / Distributor" required>
              <Input value={customer} onChange={(e) => setCustomer(e.target.value)} placeholder="Distributor name" />
            </Field>
            <Field label="Creation date" required>
              <Input type="date" value={creationDate} onChange={(e) => setCreationDate(e.target.value)} />
            </Field>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <p className="text-sm font-medium">Ordered SKUs</p>
              <Button size="sm" variant="outline" onClick={() => setLines((p) => [...p, emptyLine()])}>
                <Plus className="h-3.5 w-3.5" /> Add line
              </Button>
            </div>
            <div className="rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[22%]">SKU</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead className="w-[14%] text-end">Quantity</TableHead>
                    <TableHead className="w-[14%] text-end">Unit Price</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lines.map((l) => (
                    <TableRow key={l.key}>
                      <TableCell>
                        <Input
                          value={l.sku}
                          onChange={(e) => setLine(l.key, { sku: e.target.value })}
                          placeholder="91000025"
                          className="h-9"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          value={l.description}
                          onChange={(e) => setLine(l.key, { description: e.target.value })}
                          placeholder="Product description"
                          className="h-9"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          value={l.quantity}
                          onChange={(e) => setLine(l.key, { quantity: e.target.value })}
                          className="h-9 text-end"
                          min={0}
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          value={l.unitPrice}
                          onChange={(e) => setLine(l.key, { unitPrice: e.target.value })}
                          className="h-9 text-end"
                          min={0}
                        />
                      </TableCell>
                      <TableCell>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 text-muted-foreground hover:text-destructive"
                          onClick={() => removeLine(l.key)}
                          disabled={lines.length === 1}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>

          <Field label="Notes">
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </Field>
        </div>

        <div className="flex justify-end gap-2 border-t pt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={pending}>
            {pending ? 'Saving…' : isEdit ? 'Save changes' : 'Create PI'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
