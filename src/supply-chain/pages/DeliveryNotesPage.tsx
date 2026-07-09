/** Delivery Notes register — browse all delivery notes, create new ones. */
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Truck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useDeliveryNotes } from '../hooks/queries';
import { DeliveryNoteFormDialog } from '../components/forms/DeliveryNoteFormDialog';
import { EmptyState, PageHeader } from '../components/primitives';
import { formatDate } from '../utils/format';

export function DeliveryNotesPage() {
  const { data: dns, isLoading } = useDeliveryNotes();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');

  const filtered = useMemo(() => {
    const q = text.trim().toLowerCase();
    if (!q) return dns ?? [];
    return (dns ?? []).filter(
      (d) =>
        d.deliveryNoteNumber.toLowerCase().includes(q) ||
        d.piNumber.toLowerCase().includes(q) ||
        d.customer.toLowerCase().includes(q),
    );
  }, [dns, text]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Delivery Notes"
        description="All delivery notes recorded against approved PIs."
        actions={
          <Button onClick={() => setOpen(true)}>
            <Plus className="h-4 w-4" /> New Delivery Note
          </Button>
        }
      />

      <Card className="p-3">
        <Input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Filter by DN number, PI or customer…"
          className="sm:max-w-xs"
        />
      </Card>

      {isLoading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      ) : (dns ?? []).length === 0 ? (
        <EmptyState
          icon={<Truck className="h-8 w-8" />}
          title="No delivery notes yet"
          description="Create a delivery note against an existing PI."
          action={
            <Button onClick={() => setOpen(true)}>
              <Plus className="h-4 w-4" /> New Delivery Note
            </Button>
          }
        />
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Delivery Note</TableHead>
                <TableHead>PI</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((dn) => (
                <TableRow
                  key={dn.id}
                  className={dn.piId ? 'cursor-pointer' : ''}
                  onClick={() => dn.piId && navigate(`/supply-chain/pi/${dn.piId}`)}
                >
                  <TableCell className="font-semibold">{dn.deliveryNoteNumber}</TableCell>
                  <TableCell className="text-maroon">{dn.piNumber}</TableCell>
                  <TableCell className="max-w-[200px] truncate">{dn.customer || '—'}</TableCell>
                  <TableCell className="text-muted-foreground">{formatDate(dn.documentDate)}</TableCell>
                  <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                    {formatDate(dn.createdAt)} · {dn.createdBy}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      <DeliveryNoteFormDialog open={open} onOpenChange={setOpen} />
    </div>
  );
}
