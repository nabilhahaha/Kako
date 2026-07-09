/** Create an Invoice against a PI (optionally linked to a Delivery Note). */
import { useEffect, useMemo, useState } from 'react';
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
import { NativeSelect } from '@/components/ui/native-select';
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
import { usePiDetail, usePiSummaries } from '../../hooks/queries';
import { useCreateInvoice } from '../../hooks/mutations';
import { todayIso } from '../../utils/dates';

interface LineDraft {
  key: number;
  sku: string;
  quantity: string;
}

let counter = 0;
const emptyLine = (): LineDraft => ({ key: counter++, sku: '', quantity: '' });

export function InvoiceFormDialog({
  open,
  onOpenChange,
  piId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  piId?: string;
}) {
  const create = useCreateInvoice();
  const { data: summaries } = usePiSummaries();
  const [selectedPi, setSelectedPi] = useState(piId ?? '');
  const { data: detail } = usePiDetail(selectedPi || undefined);

  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [deliveryNoteId, setDeliveryNoteId] = useState('');
  const [documentDate, setDocumentDate] = useState(todayIso());
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<LineDraft[]>([emptyLine()]);

  useEffect(() => {
    if (open) {
      setSelectedPi(piId ?? '');
      setInvoiceNumber('');
      setDeliveryNoteId('');
      setDocumentDate(todayIso());
      setNotes('');
      setLines([emptyLine()]);
    }
  }, [open, piId]);

  const skuOptions = detail?.skuProgress ?? [];
  const skuMap = useMemo(() => new Map(skuOptions.map((s) => [s.sku, s])), [skuOptions]);

  const setLine = (key: number, patch: Partial<LineDraft>) =>
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const removeLine = (key: number) => setLines((prev) => prev.filter((l) => l.key !== key));

  const submit = async () => {
    if (!selectedPi) return toast.error('Select a PI.');
    try {
      await create.mutateAsync({
        piId: selectedPi,
        invoiceNumber,
        deliveryNoteId: deliveryNoteId || null,
        documentDate,
        notes,
        lines: lines
          .filter((l) => l.sku.trim())
          .map((l) => ({
            sku: l.sku,
            description: skuMap.get(l.sku)?.description ?? '',
            quantity: Number(l.quantity) || 0,
          })),
      });
      toast.success(`Invoice ${invoiceNumber} created.`);
      onOpenChange(false);
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>New Invoice</DialogTitle>
          <DialogDescription>
            Record an invoice against a PI, optionally linked to a Delivery Note.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[68vh] space-y-5 overflow-y-auto pe-1">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="PI" required>
              <NativeSelect
                value={selectedPi}
                onChange={(e) => {
                  setSelectedPi(e.target.value);
                  setDeliveryNoteId('');
                }}
                disabled={Boolean(piId)}
              >
                <option value="">Select PI…</option>
                {(summaries ?? []).map((s) => (
                  <option key={s.pi.id} value={s.pi.id}>
                    {s.pi.piNumber} · {s.pi.customer}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Invoice number" required>
              <Input value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} placeholder="INV-2026-001" />
            </Field>
            <Field label="Delivery Note (optional)">
              <NativeSelect value={deliveryNoteId} onChange={(e) => setDeliveryNoteId(e.target.value)}>
                <option value="">Not linked</option>
                {(detail?.deliveryNotes ?? []).map((dn) => (
                  <option key={dn.id} value={dn.id}>
                    {dn.deliveryNoteNumber}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Invoice date">
              <Input type="date" value={documentDate} onChange={(e) => setDocumentDate(e.target.value)} />
            </Field>
          </div>

          {selectedPi && skuOptions.length > 0 && (
            <div>
              <div className="mb-2 flex items-center justify-between">
                <p className="text-sm font-medium">Invoiced SKUs</p>
                <Button size="sm" variant="outline" onClick={() => setLines((p) => [...p, emptyLine()])}>
                  <Plus className="h-3.5 w-3.5" /> Add line
                </Button>
              </div>
              <div className="rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[45%]">SKU</TableHead>
                      <TableHead className="text-end">Delivered</TableHead>
                      <TableHead className="w-[18%] text-end">Quantity</TableHead>
                      <TableHead className="w-10" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {lines.map((l) => {
                      const info = skuMap.get(l.sku);
                      return (
                        <TableRow key={l.key}>
                          <TableCell>
                            <NativeSelect
                              value={l.sku}
                              onChange={(e) => setLine(l.key, { sku: e.target.value })}
                              className="h-9"
                            >
                              <option value="">Select SKU…</option>
                              {skuOptions.map((s) => (
                                <option key={s.sku} value={s.sku}>
                                  {s.sku} — {s.description || 'SKU'}
                                </option>
                              ))}
                            </NativeSelect>
                          </TableCell>
                          <TableCell className="text-end text-muted-foreground">
                            {info ? info.delivered : '—'}
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
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}

          <Field label="Notes">
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </Field>
        </div>

        <div className="flex justify-end gap-2 border-t pt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={create.isPending}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={create.isPending}>
            {create.isPending ? 'Saving…' : 'Create Invoice'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
