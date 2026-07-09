/** Overview: the PI register — every approved PI tracked until completion. */
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ClipboardList, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { PI_STATUS_LABELS, type PiStatus } from '../domain/enums';
import { usePiSummaries } from '../hooks/queries';
import { PiStatusBadge, SeverityBadge } from '../components/badges';
import { PiFormDialog } from '../components/forms/PiFormDialog';
import { EmptyState, PageHeader, StatTile } from '../components/primitives';
import { formatDate, formatQty } from '../utils/format';

const STATUS_ORDER: PiStatus[] = [
  'OPEN',
  'PARTIALLY_DELIVERED',
  'WAITING_INVOICE',
  'COMPLETED',
  'COMPLETED_WITH_EXCEPTION',
];

export function OverviewPage() {
  const { data: summaries, isLoading } = usePiSummaries();
  const navigate = useNavigate();
  const [statusFilter, setStatusFilter] = useState<PiStatus | 'ALL'>('ALL');
  const [text, setText] = useState('');
  const [newPiOpen, setNewPiOpen] = useState(false);

  const counts = useMemo(() => {
    const map = new Map<PiStatus, number>();
    for (const s of summaries ?? []) map.set(s.status, (map.get(s.status) ?? 0) + 1);
    return map;
  }, [summaries]);

  const filtered = useMemo(() => {
    const q = text.trim().toLowerCase();
    return (summaries ?? []).filter((s) => {
      if (statusFilter !== 'ALL' && s.status !== statusFilter) return false;
      if (q && !(s.pi.piNumber.toLowerCase().includes(q) || s.pi.customer.toLowerCase().includes(q))) {
        return false;
      }
      return true;
    });
  }, [summaries, statusFilter, text]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="PI Register"
        description="Track every approved PI through Delivery Notes and Invoices until completion."
        actions={
          <Button onClick={() => setNewPiOpen(true)}>
            <Plus className="h-4 w-4" /> New PI
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {STATUS_ORDER.map((status) => (
          <button key={status} type="button" onClick={() => setStatusFilter(status)} className="text-start">
            <StatTile
              label={PI_STATUS_LABELS[status]}
              value={counts.get(status) ?? 0}
              className={statusFilter === status ? 'ring-2 ring-maroon' : ''}
            />
          </button>
        ))}
      </div>

      <Card className="p-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <Input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Filter by PI number or customer…"
            className="sm:max-w-xs"
          />
          <div className="sm:w-56">
            <NativeSelect value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as PiStatus | 'ALL')}>
              <option value="ALL">All statuses</option>
              {STATUS_ORDER.map((s) => (
                <option key={s} value={s}>
                  {PI_STATUS_LABELS[s]}
                </option>
              ))}
            </NativeSelect>
          </div>
        </div>
      </Card>

      {isLoading ? (
        <div className="space-y-2">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      ) : (summaries ?? []).length === 0 ? (
        <EmptyState
          icon={<ClipboardList className="h-8 w-8" />}
          title="No PIs yet"
          description="Create your first Proforma Invoice to start tracking shipments."
          action={
            <Button onClick={() => setNewPiOpen(true)}>
              <Plus className="h-4 w-4" /> New PI
            </Button>
          }
        />
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>PI Number</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Validation</TableHead>
                <TableHead className="text-end">SKUs</TableHead>
                <TableHead className="text-end">Delivered / Ordered</TableHead>
                <TableHead className="text-end">DNs</TableHead>
                <TableHead className="text-end">Invoices</TableHead>
                <TableHead className="text-end">Exceptions</TableHead>
                <TableHead>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((s) => (
                <TableRow
                  key={s.pi.id}
                  className="cursor-pointer"
                  onClick={() => navigate(`/supply-chain/pi/${s.pi.id}`)}
                >
                  <TableCell className="font-semibold text-maroon">{s.pi.piNumber}</TableCell>
                  <TableCell className="max-w-[180px] truncate">{s.pi.customer}</TableCell>
                  <TableCell><PiStatusBadge status={s.status} /></TableCell>
                  <TableCell><SeverityBadge severity={s.severity} /></TableCell>
                  <TableCell className="text-end">{s.skuCount}</TableCell>
                  <TableCell className="text-end">
                    {formatQty(s.totalDelivered)} / {formatQty(s.totalOrdered)}
                  </TableCell>
                  <TableCell className="text-end">{s.deliveryNoteCount}</TableCell>
                  <TableCell className="text-end">{s.invoiceCount}</TableCell>
                  <TableCell className="text-end">
                    {s.exceptionCount > 0 ? (
                      <span className={s.openExceptionCount > 0 ? 'font-semibold text-warning' : ''}>
                        {s.exceptionCount}
                      </span>
                    ) : (
                      '—'
                    )}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                    {formatDate(s.pi.creationDate)}
                  </TableCell>
                </TableRow>
              ))}
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={10} className="py-8 text-center text-muted-foreground">
                    No PIs match the current filters.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </Card>
      )}

      <PiFormDialog open={newPiOpen} onOpenChange={setNewPiOpen} />
    </div>
  );
}
