/**
 * PI service. Aggregates everything related to a PI onto one view model and
 * derives the operational workflow status. Status reflects workflow progress;
 * severity (colour) is a separate axis surfaced alongside it.
 */
import type { PiStatus, Severity } from '../domain/enums';
import type {
  DeliveryNote,
  DeliveryNoteLine,
  ExceptionRecord,
  Invoice,
  InvoiceLine,
  PI,
  PiLine,
  ValidationResult,
} from '../domain/models';
import { dataStore } from '../repositories';
import { effectiveSeverity, worstSeverity } from './validationService';

export interface SkuProgress {
  sku: string;
  description: string;
  ordered: number;
  delivered: number;
  invoiced: number;
  remaining: number;
  severity: Severity;
}

export interface PiSummary {
  pi: PI;
  status: PiStatus;
  severity: Severity;
  skuCount: number;
  deliveryNoteCount: number;
  invoiceCount: number;
  exceptionCount: number;
  openExceptionCount: number;
  totalOrdered: number;
  totalDelivered: number;
}

export interface PiDetail extends PiSummary {
  lines: PiLine[];
  deliveryNotes: DeliveryNote[];
  deliveryNoteLines: DeliveryNoteLine[];
  invoices: Invoice[];
  invoiceLines: InvoiceLine[];
  exceptions: ExceptionRecord[];
  validationResults: ValidationResult[];
  skuProgress: SkuProgress[];
}

interface Bundle {
  lines: PiLine[];
  dns: DeliveryNote[];
  dnLines: DeliveryNoteLine[];
  invoices: Invoice[];
  invoiceLines: InvoiceLine[];
  exceptions: ExceptionRecord[];
  results: ValidationResult[];
}

async function loadBundle(pi: PI): Promise<Bundle> {
  const [lines, dns, dnLines, invoices, exceptions, results] = await Promise.all([
    dataStore.piLines.byPi(pi.id),
    dataStore.deliveryNotes.byPi(pi.id),
    dataStore.deliveryNoteLines.byPi(pi.id),
    dataStore.invoices.byPi(pi.id),
    dataStore.exceptions.byPi(pi.id),
    dataStore.validationResults.byPi(pi.id),
  ]);
  const invoiceLinesNested = await Promise.all(
    invoices.map((i) => dataStore.invoiceLines.byInvoice(i.id)),
  );
  return {
    lines,
    dns,
    dnLines,
    invoices,
    invoiceLines: invoiceLinesNested.flat(),
    exceptions,
    results,
  };
}

export function computeStatus(pi: PI, b: Bundle): PiStatus {
  if (b.lines.length === 0) return pi.status;

  const deliveredBySku = new Map<string, number>();
  for (const l of b.dnLines) {
    deliveredBySku.set(l.sku, (deliveredBySku.get(l.sku) ?? 0) + (l.quantity || 0));
  }

  const hasDeliveries = b.dns.length > 0;
  const fullyDelivered =
    hasDeliveries && b.lines.every((l) => (deliveredBySku.get(l.sku) ?? 0) >= l.quantity);
  const hasInvoice = b.invoices.length > 0;
  const hasEffectiveException =
    b.exceptions.some((e) => e.status === 'approved') ||
    b.results.some((r) => effectiveSeverity(r) === 'exception');

  if (!hasDeliveries) return 'OPEN';
  if (!fullyDelivered) return 'PARTIALLY_DELIVERED';
  if (!hasInvoice) return 'WAITING_INVOICE';
  return hasEffectiveException ? 'COMPLETED_WITH_EXCEPTION' : 'COMPLETED';
}

function buildSkuProgress(b: Bundle): SkuProgress[] {
  const deliveredBySku = new Map<string, number>();
  for (const l of b.dnLines) {
    deliveredBySku.set(l.sku, (deliveredBySku.get(l.sku) ?? 0) + (l.quantity || 0));
  }
  const invoicedBySku = new Map<string, number>();
  for (const l of b.invoiceLines) {
    invoicedBySku.set(l.sku, (invoicedBySku.get(l.sku) ?? 0) + (l.quantity || 0));
  }
  const resultsBySku = new Map<string, ValidationResult[]>();
  for (const r of b.results) {
    if (!r.sku) continue;
    const arr = resultsBySku.get(r.sku) ?? [];
    arr.push(r);
    resultsBySku.set(r.sku, arr);
  }

  return b.lines.map((l) => {
    const delivered = deliveredBySku.get(l.sku) ?? 0;
    return {
      sku: l.sku,
      description: l.description,
      ordered: l.quantity,
      delivered,
      invoiced: invoicedBySku.get(l.sku) ?? 0,
      remaining: l.quantity - delivered,
      severity: worstSeverity(resultsBySku.get(l.sku) ?? []),
    };
  });
}

function summarize(pi: PI, b: Bundle): PiSummary {
  const status = computeStatus(pi, b);
  const severity = worstSeverity(b.results);
  const totalOrdered = b.lines.reduce((a, l) => a + l.quantity, 0);
  const totalDelivered = b.dnLines.reduce((a, l) => a + l.quantity, 0);
  return {
    pi: { ...pi, status },
    status,
    severity,
    skuCount: b.lines.length,
    deliveryNoteCount: b.dns.length,
    invoiceCount: b.invoices.length,
    exceptionCount: b.exceptions.length,
    openExceptionCount: b.exceptions.filter((e) => e.status === 'pending').length,
    totalOrdered,
    totalDelivered,
  };
}

export async function listPiSummaries(): Promise<PiSummary[]> {
  const pis = await dataStore.pis.getAll();
  const summaries = await Promise.all(
    pis.map(async (pi) => summarize(pi, await loadBundle(pi))),
  );
  return summaries.sort((a, b) => b.pi.createdAt.localeCompare(a.pi.createdAt));
}

export async function getPiDetail(piId: string): Promise<PiDetail | null> {
  const pi = await dataStore.pis.getById(piId);
  if (!pi) return null;
  const b = await loadBundle(pi);
  const summary = summarize(pi, b);
  return {
    ...summary,
    lines: b.lines,
    deliveryNotes: b.dns,
    deliveryNoteLines: b.dnLines,
    invoices: b.invoices,
    invoiceLines: b.invoiceLines,
    exceptions: b.exceptions,
    validationResults: b.results,
    skuProgress: buildSkuProgress(b),
  };
}

/** Persist the derived status back onto every PI (called after data changes). */
export async function recomputeAllStatuses(): Promise<void> {
  const pis = await dataStore.pis.getAll();
  await Promise.all(
    pis.map(async (pi) => {
      const b = await loadBundle(pi);
      const status = computeStatus(pi, b);
      if (status !== pi.status) {
        await dataStore.pis.save({ ...pi, status, updatedAt: new Date().toISOString() });
      }
    }),
  );
}
