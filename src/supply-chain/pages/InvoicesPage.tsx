/** Invoices register — browse all invoices, create new ones. */
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Receipt } from 'lucide-react';
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
import { useInvoices } from '../hooks/queries';
import { InvoiceFormDialog } from '../components/forms/InvoiceFormDialog';
import { EmptyState, PageHeader } from '../components/primitives';
import { formatDate } from '../utils/format';

export function InvoicesPage() {
  const { data: invoices, isLoading } = useInvoices();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');

  const filtered = useMemo(() => {
    const q = text.trim().toLowerCase();
    if (!q) return invoices ?? [];
    return (invoices ?? []).filter(
      (i) =>
        i.invoiceNumber.toLowerCase().includes(q) ||
        i.piNumber.toLowerCase().includes(q) ||
        i.customer.toLowerCase().includes(q),
    );
  }, [invoices, text]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Invoices"
        description="All invoices recorded against approved PIs."
        actions={
          <Button onClick={() => setOpen(true)}>
            <Plus className="h-4 w-4" /> New Invoice
          </Button>
        }
      />

      <Card className="p-3">
        <Input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Filter by invoice number, PI or customer…"
          className="sm:max-w-xs"
        />
      </Card>

      {isLoading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      ) : (invoices ?? []).length === 0 ? (
        <EmptyState
          icon={<Receipt className="h-8 w-8" />}
          title="No invoices yet"
          description="Create an invoice against an existing PI."
          action={
            <Button onClick={() => setOpen(true)}>
              <Plus className="h-4 w-4" /> New Invoice
            </Button>
          }
        />
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Invoice</TableHead>
                <TableHead>PI</TableHead>
                <TableHead>Delivery Note</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Date</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((inv) => (
                <TableRow
                  key={inv.id}
                  className={inv.piId ? 'cursor-pointer' : ''}
                  onClick={() => inv.piId && navigate(`/supply-chain/pi/${inv.piId}`)}
                >
                  <TableCell className="font-semibold">{inv.invoiceNumber}</TableCell>
                  <TableCell className="text-maroon">{inv.piNumber}</TableCell>
                  <TableCell className="text-muted-foreground">{inv.deliveryNoteNumber || '—'}</TableCell>
                  <TableCell className="max-w-[200px] truncate">{inv.customer || '—'}</TableCell>
                  <TableCell className="text-muted-foreground">{formatDate(inv.documentDate)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      <InvoiceFormDialog open={open} onOpenChange={setOpen} />
    </div>
  );
}
