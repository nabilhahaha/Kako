/** Create a Delivery Note against a PI. SKUs are chosen from the PI's lines. */
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
import { useCreateDeliveryNote } from '../../hooks/mutations';
import { todayIso } from '../../utils/dates';
import { formatQty } from '../../utils/format';

interface LineDraft {
  key: number;
  sku: string;
  quantity: string;
  productionDate: string;
  expiryDate: string;
}

let counter = 0;
const emptyLine = (): LineDraft => ({
  key: counter++,
  sku: '',
  quantity: '',
  productionDate: '',
  expiryDate: '',
});

export function DeliveryNoteFormDialog({
  open,
  onOpenChange,
  piId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  piId?: string;
}) {
  const create = useCreateDeliveryNote();
  const { data: summaries } = usePiSummaries();
  const [selectedPi, setSelectedPi] = useState(piId ?? '');
  const { data: detail } = usePiDetail(selectedPi || undefined);

  const [dnNumber, setDnNumber] = useState('');
  const [documentDate, setDocumentDate] = useState(todayIso());
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<LineDraft[]>([emptyLine()]);

  useEffect(() => {
    if (open) {
      setSelectedPi(piId ?? '');
      setDnNumber('');
      setDocumentDate(todayIso());
      setNotes('');
      setLines([emptyLine()]);
    }
  }, [open, piId]);

  const skuOptions = detail?.skuProgress ?? [];
  const skuMap = useMemo(
    () => new Map(skuOptions.map((s) => [s.sku, s])),
    [skuOptions],
  );

  const setLine = (key: number, patch: Partial<LineDraft>) =>
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const removeLine = (key: number) => setLines((prev) => prev.filter((l) => l.key !== key));

  const submit = async () => {
    if (!selectedPi) return toast.error('Select a PI.');
    try {
      await create.mutateAsync({
        piId: selectedPi,
        deliveryNoteNumber: dnNumber,
        documentDate,
        notes,
        lines: lines
          .filter((l) => l.sku.trim())
          .map((l) => ({
            sku: l.sku,
            description: skuMap.get(l.sku)?.description ?? '',
            quantity: Number(l.quantity) || 0,
            productionDate: l.productionDate || null,
            expiryDate: l.expiryDate || null,
          })),
      });
      toast.success(`Delivery Note ${dnNumber} created.`);
      onOpenChange(false);
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>New Delivery Note</DialogTitle>
          <DialogDescription>
            Record a delivery against a PI. Add production and expiry dates so shelf-life is validated.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[68vh] space-y-5 overflow-y-auto pe-1">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="PI" required>
              <NativeSelect
                value={selectedPi}
                onChange={(e) => setSelectedPi(e.target.value)}
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
            <Field label="Delivery Note number" required>
              <Input value={dnNumber} onChange={(e) => setDnNumber(e.target.value)} placeholder="DN-2026-001" />
            </Field>
            <Field label="Delivery date">
              <Input type="date" value={documentDate} onChange={(e) => setDocumentDate(e.target.value)} />
            </Field>
          </div>

          {selectedPi && skuOptions.length === 0 && (
            <p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
              This PI has no SKUs. Add SKUs to the PI first.
            </p>
          )}

          {selectedPi && skuOptions.length > 0 && (
            <div>
              <div className="mb-2 flex items-center justify-between">
                <p className="text-sm font-medium">Delivered SKUs</p>
                <Button size="sm" variant="outline" onClick={() => setLines((p) => [...p, emptyLine()])}>
                  <Plus className="h-3.5 w-3.5" /> Add line
                </Button>
              </div>
              <div className="rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[26%]">SKU</TableHead>
                      <TableHead className="text-end">Remaining</TableHead>
                      <TableHead className="w-[14%] text-end">Quantity</TableHead>
                      <TableHead>Production</TableHead>
                      <TableHead>Expiry</TableHead>
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
                            {info ? formatQty(info.remaining) : '—'}
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
                              type="date"
                              value={l.productionDate}
                              onChange={(e) => setLine(l.key, { productionDate: e.target.value })}
                              className="h-9"
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              type="date"
                              value={l.expiryDate}
                              onChange={(e) => setLine(l.key, { expiryDate: e.target.value })}
                              className="h-9"
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
              <p className="mt-1.5 text-xs text-muted-foreground">
                Production date lets the engine compute remaining shelf life. Provide it when available.
              </p>
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
            {create.isPending ? 'Saving…' : 'Create Delivery Note'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
