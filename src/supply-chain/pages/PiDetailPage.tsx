/** PI Details: everything related to one PI on a single screen. */
import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  Paperclip,
  Pencil,
  Plus,
  RefreshCw,
  ShieldAlert,
  Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { RULE_BY_CODE } from '../validation/rules';
import type { ValidationResult } from '../domain/models';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { usePiDetail } from '../hooks/queries';
import {
  useDeleteDeliveryNote,
  useDeleteInvoice,
  useDeletePi,
  useRevalidate,
} from '../hooks/mutations';
import {
  ExceptionStatusBadge,
  PiStatusBadge,
  SeverityBadge,
} from '../components/badges';
import { ExceptionDialog, type ExceptionPrefill } from '../components/ExceptionDialog';
import { DecisionDialog } from '../components/DecisionDialog';
import { PiFormDialog } from '../components/forms/PiFormDialog';
import { DeliveryNoteFormDialog } from '../components/forms/DeliveryNoteFormDialog';
import { InvoiceFormDialog } from '../components/forms/InvoiceFormDialog';
import { EmptyState, StatTile } from '../components/primitives';
import { formatDate, formatDateTime, formatQty } from '../utils/format';

export function PiDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: detail, isLoading } = usePiDetail(id);
  const revalidate = useRevalidate();
  const deletePi = useDeletePi();
  const deleteDn = useDeleteDeliveryNote();
  const deleteInvoice = useDeleteInvoice();

  const [expandedDn, setExpandedDn] = useState<Set<string>>(new Set());
  const [expandedInv, setExpandedInv] = useState<Set<string>>(new Set());
  const [exceptionPrefill, setExceptionPrefill] = useState<ExceptionPrefill | null>(null);
  const [decision, setDecision] = useState<{ id: string; decision: 'approved' | 'rejected' } | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [dnOpen, setDnOpen] = useState(false);
  const [invoiceOpen, setInvoiceOpen] = useState(false);

  const toggle = (set: Set<string>, setSet: (s: Set<string>) => void, key: string) => {
    const next = new Set(set);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setSet(next);
  };

  const needsException = (r: ValidationResult) =>
    r.severity === 'fail' && !r.coveredByExceptionId && RULE_BY_CODE[r.ruleCode]?.requiresExceptionOnFail;

  const openException = (r: ValidationResult) =>
    setExceptionPrefill({
      ruleCode: r.ruleCode,
      piId: detail?.pi.id ?? null,
      piNumber: detail?.pi.piNumber ?? '',
      deliveryNoteNumber: r.deliveryNoteNumber,
      sku: r.sku,
    });

  const failCount = useMemo(
    () => (detail?.validationResults ?? []).filter((r) => needsException(r)).length,
    [detail],
  );

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!detail) {
    return (
      <EmptyState
        title="PI not found"
        description="This PI may have been reset or never existed."
        action={
          <Link to="/supply-chain">
            <Button variant="outline">
              <ArrowLeft className="h-4 w-4" /> Back to register
            </Button>
          </Link>
        }
      />
    );
  }

  const linesByDn = (dnId: string) => detail.deliveryNoteLines.filter((l) => l.deliveryNoteId === dnId);
  const linesByInvoice = (invId: string) => detail.invoiceLines.filter((l) => l.invoiceId === invId);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link to="/supply-chain" className="rounded-md p-1.5 text-muted-foreground hover:bg-accent">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="heading-1">{detail.pi.piNumber}</h1>
              <PiStatusBadge status={detail.status} />
              <SeverityBadge severity={detail.severity} />
            </div>
            <p className="text-sm text-muted-foreground">{detail.pi.customer}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={() => setDnOpen(true)}>
            <Plus className="h-4 w-4" /> Delivery Note
          </Button>
          <Button size="sm" onClick={() => setInvoiceOpen(true)}>
            <Plus className="h-4 w-4" /> Invoice
          </Button>
          <Button size="sm" variant="outline" onClick={() => setEditOpen(true)}>
            <Pencil className="h-4 w-4" /> Edit
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => revalidate.mutate()}
            disabled={revalidate.isPending}
          >
            <RefreshCw className={cn('h-4 w-4', revalidate.isPending && 'animate-spin')} /> Re-validate
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="text-destructive hover:text-destructive"
            onClick={async () => {
              if (!detail) return;
              if (!window.confirm(`Delete PI ${detail.pi.piNumber} and all its delivery notes and invoices?`)) return;
              await deletePi.mutateAsync(detail.pi.id);
              toast.success('PI deleted.');
              navigate('/supply-chain');
            }}
            disabled={deletePi.isPending}
          >
            <Trash2 className="h-4 w-4" /> Delete
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <StatTile label="Customer" value={<span className="text-base">{detail.pi.customer}</span>} />
        <StatTile label="Created" value={<span className="text-base">{formatDate(detail.pi.creationDate)}</span>} />
        <StatTile label="SKUs" value={detail.skuCount} />
        <StatTile label="Delivered" value={`${formatQty(detail.totalDelivered)} / ${formatQty(detail.totalOrdered)}`} />
        <StatTile label="Invoices" value={detail.invoiceCount} />
        <StatTile
          label="Open failures"
          value={failCount}
          className={failCount > 0 ? 'border-destructive/40' : ''}
        />
      </div>

      <Tabs defaultValue="skus">
        <TabsList>
          <TabsTrigger value="skus">SKUs</TabsTrigger>
          <TabsTrigger value="deliveries">Delivery Notes ({detail.deliveryNotes.length})</TabsTrigger>
          <TabsTrigger value="invoices">Invoices ({detail.invoices.length})</TabsTrigger>
          <TabsTrigger value="exceptions">Exceptions ({detail.exceptions.length})</TabsTrigger>
          <TabsTrigger value="validation">Validation ({detail.validationResults.length})</TabsTrigger>
        </TabsList>

        {/* SKUs */}
        <TabsContent value="skus">
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>SKU</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="text-end">Ordered</TableHead>
                  <TableHead className="text-end">Delivered</TableHead>
                  <TableHead className="text-end">Invoiced</TableHead>
                  <TableHead className="text-end">Remaining</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {detail.skuProgress.map((s) => (
                  <TableRow key={s.sku}>
                    <TableCell className="font-medium">{s.sku}</TableCell>
                    <TableCell className="max-w-[220px] truncate text-muted-foreground">{s.description || '—'}</TableCell>
                    <TableCell className="text-end">{formatQty(s.ordered)}</TableCell>
                    <TableCell className="text-end">{formatQty(s.delivered)}</TableCell>
                    <TableCell className="text-end">{formatQty(s.invoiced)}</TableCell>
                    <TableCell className={cn('text-end', s.remaining < 0 && 'font-semibold text-destructive')}>
                      {formatQty(s.remaining)}
                    </TableCell>
                    <TableCell><SeverityBadge severity={s.severity} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        {/* Delivery Notes */}
        <TabsContent value="deliveries">
          {detail.deliveryNotes.length === 0 ? (
            <EmptyState title="No delivery notes" description="Delivery Notes linked to this PI will appear here." />
          ) : (
            <Card>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8" />
                    <TableHead>Delivery Note</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead className="text-end">Lines</TableHead>
                    <TableHead className="text-end">Total Qty</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {detail.deliveryNotes.map((dn) => {
                    const lines = linesByDn(dn.id);
                    const open = expandedDn.has(dn.id);
                    const total = lines.reduce((a, l) => a + l.quantity, 0);
                    return (
                      <>
                        <TableRow
                          key={dn.id}
                          className="cursor-pointer"
                          onClick={() => toggle(expandedDn, setExpandedDn, dn.id)}
                        >
                          <TableCell>
                            {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                          </TableCell>
                          <TableCell className="font-medium">{dn.deliveryNoteNumber}</TableCell>
                          <TableCell className="text-muted-foreground">{formatDate(dn.documentDate)}</TableCell>
                          <TableCell className="text-end">{lines.length}</TableCell>
                          <TableCell className="text-end">{formatQty(total)}</TableCell>
                          <TableCell>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-8 w-8 text-muted-foreground hover:text-destructive"
                              onClick={async (e) => {
                                e.stopPropagation();
                                if (!window.confirm(`Delete Delivery Note ${dn.deliveryNoteNumber}?`)) return;
                                await deleteDn.mutateAsync(dn.id);
                                toast.success('Delivery Note deleted.');
                              }}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                        {open && (
                          <TableRow key={`${dn.id}-detail`} className="bg-muted/30 hover:bg-muted/30">
                            <TableCell colSpan={6} className="p-0">
                              <div className="p-3">
                                <Table>
                                  <TableHeader>
                                    <TableRow>
                                      <TableHead>SKU</TableHead>
                                      <TableHead>Description</TableHead>
                                      <TableHead className="text-end">Qty</TableHead>
                                      <TableHead>Production</TableHead>
                                      <TableHead>Expiry</TableHead>
                                    </TableRow>
                                  </TableHeader>
                                  <TableBody>
                                    {lines.map((l) => (
                                      <TableRow key={l.id}>
                                        <TableCell className="font-medium">{l.sku}</TableCell>
                                        <TableCell className="max-w-[200px] truncate text-muted-foreground">{l.description || '—'}</TableCell>
                                        <TableCell className="text-end">{formatQty(l.quantity)}</TableCell>
                                        <TableCell>{formatDate(l.productionDate)}</TableCell>
                                        <TableCell>{formatDate(l.expiryDate)}</TableCell>
                                      </TableRow>
                                    ))}
                                  </TableBody>
                                </Table>
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                      </>
                    );
                  })}
                </TableBody>
              </Table>
            </Card>
          )}
        </TabsContent>

        {/* Invoices */}
        <TabsContent value="invoices">
          {detail.invoices.length === 0 ? (
            <EmptyState title="No invoices" description="Invoices linked to this PI will appear here." />
          ) : (
            <Card>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8" />
                    <TableHead>Invoice</TableHead>
                    <TableHead>Delivery Note</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead className="text-end">Lines</TableHead>
                    <TableHead className="text-end">Total Qty</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {detail.invoices.map((inv) => {
                    const lines = linesByInvoice(inv.id);
                    const open = expandedInv.has(inv.id);
                    const total = lines.reduce((a, l) => a + l.quantity, 0);
                    return (
                      <>
                        <TableRow
                          key={inv.id}
                          className="cursor-pointer"
                          onClick={() => toggle(expandedInv, setExpandedInv, inv.id)}
                        >
                          <TableCell>
                            {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                          </TableCell>
                          <TableCell className="font-medium">{inv.invoiceNumber}</TableCell>
                          <TableCell className="text-muted-foreground">{inv.deliveryNoteNumber || '—'}</TableCell>
                          <TableCell className="text-muted-foreground">{formatDate(inv.documentDate)}</TableCell>
                          <TableCell className="text-end">{lines.length}</TableCell>
                          <TableCell className="text-end">{formatQty(total)}</TableCell>
                          <TableCell>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-8 w-8 text-muted-foreground hover:text-destructive"
                              onClick={async (e) => {
                                e.stopPropagation();
                                if (!window.confirm(`Delete Invoice ${inv.invoiceNumber}?`)) return;
                                await deleteInvoice.mutateAsync(inv.id);
                                toast.success('Invoice deleted.');
                              }}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                        {open && (
                          <TableRow key={`${inv.id}-detail`} className="bg-muted/30 hover:bg-muted/30">
                            <TableCell colSpan={7} className="p-0">
                              <div className="p-3">
                                <Table>
                                  <TableHeader>
                                    <TableRow>
                                      <TableHead>SKU</TableHead>
                                      <TableHead>Description</TableHead>
                                      <TableHead className="text-end">Qty</TableHead>
                                    </TableRow>
                                  </TableHeader>
                                  <TableBody>
                                    {lines.map((l) => (
                                      <TableRow key={l.id}>
                                        <TableCell className="font-medium">{l.sku}</TableCell>
                                        <TableCell className="max-w-[240px] truncate text-muted-foreground">{l.description || '—'}</TableCell>
                                        <TableCell className="text-end">{formatQty(l.quantity)}</TableCell>
                                      </TableRow>
                                    ))}
                                  </TableBody>
                                </Table>
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                      </>
                    );
                  })}
                </TableBody>
              </Table>
            </Card>
          )}
        </TabsContent>

        {/* Exceptions */}
        <TabsContent value="exceptions">
          {detail.exceptions.length === 0 ? (
            <EmptyState title="No exceptions" description="Exceptions raised for this PI will appear here." />
          ) : (
            <div className="space-y-3">
              {detail.exceptions.map((ex) => (
                <Card key={ex.id}>
                  <CardContent className="space-y-3 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <ExceptionStatusBadge status={ex.status} />
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
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setDecision({ id: ex.id, decision: 'rejected' })}
                          >
                            Reject
                          </Button>
                        </div>
                      )}
                    </div>
                    <p className="text-sm">{ex.reason}</p>
                    {ex.notes && <p className="text-sm text-muted-foreground">{ex.notes}</p>}
                    <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground">
                      <span>Raised by {ex.createdBy} · {formatDateTime(ex.createdAt)}</span>
                      {ex.approvedBy && <span>Decided by {ex.approvedBy} · {formatDateTime(ex.approvalDate)}</span>}
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
        </TabsContent>

        {/* Validation */}
        <TabsContent value="validation">
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Severity</TableHead>
                  <TableHead>Rule</TableHead>
                  <TableHead>Message</TableHead>
                  <TableHead className="text-end">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {detail.validationResults.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>
                      <SeverityBadge
                        severity={r.coveredByExceptionId && r.severity === 'fail' ? 'exception' : r.severity}
                      />
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-xs font-medium">{r.ruleName}</TableCell>
                    <TableCell className="text-sm">{r.message}</TableCell>
                    <TableCell className="text-end">
                      {needsException(r) ? (
                        <Button size="sm" variant="secondary" onClick={() => openException(r)}>
                          <ShieldAlert className="h-3.5 w-3.5" /> Exception
                        </Button>
                      ) : r.coveredByExceptionId ? (
                        <span className="text-xs text-orange-600 dark:text-orange-400">Covered</span>
                      ) : (
                        '—'
                      )}
                    </TableCell>
                  </TableRow>
                ))}
                {detail.validationResults.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                      No validation results yet.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>
      </Tabs>

      <ExceptionDialog
        open={Boolean(exceptionPrefill)}
        onOpenChange={(open) => !open && setExceptionPrefill(null)}
        prefill={exceptionPrefill}
      />
      <DecisionDialog
        open={Boolean(decision)}
        onOpenChange={(open) => !open && setDecision(null)}
        exceptionId={decision?.id ?? null}
        decision={decision?.decision ?? 'approved'}
      />
      <PiFormDialog open={editOpen} onOpenChange={setEditOpen} editing={detail} />
      <DeliveryNoteFormDialog open={dnOpen} onOpenChange={setDnOpen} piId={detail.pi.id} />
      <InvoiceFormDialog open={invoiceOpen} onOpenChange={setInvoiceOpen} piId={detail.pi.id} />
    </div>
  );
}
