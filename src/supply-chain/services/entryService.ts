/**
 * Manual entry service. The primary Phase-1 workflow: operators create PIs,
 * Delivery Notes and Invoices through ERP-style forms. Every mutation runs the
 * Validation Engine and recomputes statuses so the operator sees immediate,
 * authoritative feedback — exactly like posting a document in an ERP.
 */
import type { DeliveryNote, Invoice, PI, PiLine } from '../domain/models';
import { dataStore } from '../repositories';
import { newId } from '../utils/ids';
import { recordAudit } from './auditService';
import { recomputeAllStatuses } from './piService';
import { getCurrentOperator } from './session';
import { runValidationAndPersist } from './validationService';

// ---- input shapes -------------------------------------------------------------

export interface PiLineInput {
  sku: string;
  description: string;
  quantity: number;
  unitPrice?: number | null;
}

export interface PiInput {
  piNumber: string;
  customer: string;
  creationDate: string; // ISO (yyyy-MM-dd or full)
  notes?: string;
  lines: PiLineInput[];
}

export interface DeliveryNoteLineInput {
  sku: string;
  description: string;
  quantity: number;
  productionDate?: string | null;
  expiryDate?: string | null;
  shelfLifeDays?: number | null;
}

export interface DeliveryNoteInput {
  piId: string;
  deliveryNoteNumber: string;
  documentDate?: string | null;
  notes?: string;
  lines: DeliveryNoteLineInput[];
}

export interface InvoiceLineInput {
  sku: string;
  description: string;
  quantity: number;
}

export interface InvoiceInput {
  piId: string;
  invoiceNumber: string;
  deliveryNoteId?: string | null;
  documentDate?: string | null;
  notes?: string;
  lines: InvoiceLineInput[];
}

// ---- validation helpers -------------------------------------------------------

function assertLines<T extends { sku: string; quantity: number }>(
  lines: T[],
  label: string,
): T[] {
  const valid = lines.filter((l) => l.sku.trim() && l.quantity > 0);
  if (valid.length === 0) {
    throw new Error(`Add at least one ${label} line with an SKU and a quantity.`);
  }
  return valid;
}

async function refreshAfterChange() {
  await runValidationAndPersist();
  await recomputeAllStatuses();
}

// ---- PI -----------------------------------------------------------------------

export async function createPi(input: PiInput): Promise<PI> {
  const piNumber = input.piNumber.trim();
  if (!piNumber) throw new Error('PI number is required.');
  if (!input.customer.trim()) throw new Error('Customer is required.');
  const validLines = assertLines(input.lines, 'PI');

  const existing = await dataStore.pis.findByNumber(piNumber);
  if (existing) throw new Error(`PI ${piNumber} already exists.`);

  const now = new Date().toISOString();
  const id = newId('pi');
  const pi: PI = {
    id,
    piNumber,
    customer: input.customer.trim(),
    status: 'OPEN',
    creationDate: input.creationDate || now,
    notes: input.notes?.trim() ?? '',
    createdAt: now,
    updatedAt: now,
    createdBy: getCurrentOperator(),
  };
  await dataStore.pis.save(pi);
  await dataStore.piLines.saveMany(buildPiLines(id, piNumber, validLines));

  await recordAudit({
    action: 'PI_CREATE',
    entityType: 'PI',
    entityId: id,
    summary: `Created PI ${piNumber} for ${pi.customer} (${validLines.length} SKUs)`,
  });
  await refreshAfterChange();
  return pi;
}

export async function updatePi(
  id: string,
  input: PiInput,
): Promise<PI> {
  const existing = await dataStore.pis.getById(id);
  if (!existing) throw new Error('PI not found.');
  const piNumber = input.piNumber.trim();
  if (!piNumber) throw new Error('PI number is required.');
  const validLines = assertLines(input.lines, 'PI');

  const clash = await dataStore.pis.findByNumber(piNumber);
  if (clash && clash.id !== id) throw new Error(`PI ${piNumber} already exists.`);

  const updated: PI = {
    ...existing,
    piNumber,
    customer: input.customer.trim(),
    creationDate: input.creationDate || existing.creationDate,
    notes: input.notes?.trim() ?? '',
    updatedAt: new Date().toISOString(),
  };
  await dataStore.pis.save(updated);

  // Replace lines wholesale.
  const oldLines = await dataStore.piLines.byPi(id);
  await Promise.all(oldLines.map((l) => dataStore.piLines.remove(l.id)));
  await dataStore.piLines.saveMany(buildPiLines(id, piNumber, validLines));

  await recordAudit({
    action: 'PI_UPDATE',
    entityType: 'PI',
    entityId: id,
    summary: `Updated PI ${piNumber}`,
  });
  await refreshAfterChange();
  return updated;
}

function buildPiLines(piId: string, piNumber: string, lines: PiLineInput[]): PiLine[] {
  return lines.map((l) => ({
    id: newId('pl'),
    piId,
    piNumber,
    sku: l.sku.trim(),
    description: l.description.trim(),
    quantity: Number(l.quantity) || 0,
    unitPrice: l.unitPrice ?? null,
  }));
}

/** Delete a PI and all of its delivery notes / invoices. Exceptions are kept. */
export async function deletePi(id: string): Promise<void> {
  const pi = await dataStore.pis.getById(id);
  if (!pi) return;

  const [lines, dns, dnLines, invoices] = await Promise.all([
    dataStore.piLines.byPi(id),
    dataStore.deliveryNotes.byPi(id),
    dataStore.deliveryNoteLines.byPi(id),
    dataStore.invoices.byPi(id),
  ]);
  const invLines = (
    await Promise.all(invoices.map((i) => dataStore.invoiceLines.byInvoice(i.id)))
  ).flat();

  await Promise.all([
    ...lines.map((l) => dataStore.piLines.remove(l.id)),
    ...dnLines.map((l) => dataStore.deliveryNoteLines.remove(l.id)),
    ...dns.map((d) => dataStore.deliveryNotes.remove(d.id)),
    ...invLines.map((l) => dataStore.invoiceLines.remove(l.id)),
    ...invoices.map((i) => dataStore.invoices.remove(i.id)),
  ]);
  await dataStore.pis.remove(id);

  await recordAudit({
    action: 'PI_DELETE',
    entityType: 'PI',
    entityId: id,
    summary: `Deleted PI ${pi.piNumber} and its delivery notes / invoices`,
  });
  await refreshAfterChange();
}

// ---- Delivery Note ------------------------------------------------------------

export async function createDeliveryNote(input: DeliveryNoteInput): Promise<DeliveryNote> {
  const dnNumber = input.deliveryNoteNumber.trim();
  if (!dnNumber) throw new Error('Delivery Note number is required.');
  const pi = await dataStore.pis.getById(input.piId);
  if (!pi) throw new Error('Select a valid PI.');
  const validLines = assertLines(input.lines, 'Delivery Note');

  const clash = (await dataStore.deliveryNotes.getAll()).find(
    (d) => d.deliveryNoteNumber === dnNumber,
  );
  if (clash) throw new Error(`Delivery Note ${dnNumber} already exists.`);

  const now = new Date().toISOString();
  const id = newId('dn');
  const dn: DeliveryNote = {
    id,
    deliveryNoteNumber: dnNumber,
    piNumber: pi.piNumber,
    piId: pi.id,
    customer: pi.customer,
    documentDate: input.documentDate || null,
    notes: input.notes?.trim() ?? '',
    createdAt: now,
    createdBy: getCurrentOperator(),
  };
  await dataStore.deliveryNotes.save(dn);
  await dataStore.deliveryNoteLines.saveMany(
    validLines.map((l) => ({
      id: newId('dl'),
      deliveryNoteId: id,
      deliveryNoteNumber: dnNumber,
      piNumber: pi.piNumber,
      piId: pi.id,
      sku: l.sku.trim(),
      description: l.description.trim(),
      quantity: Number(l.quantity) || 0,
      productionDate: l.productionDate || null,
      expiryDate: l.expiryDate || null,
      shelfLifeDays: l.shelfLifeDays ?? null,
    })),
  );

  await recordAudit({
    action: 'DN_CREATE',
    entityType: 'DeliveryNote',
    entityId: id,
    summary: `Created Delivery Note ${dnNumber} for PI ${pi.piNumber}`,
  });
  await refreshAfterChange();
  return dn;
}

export async function deleteDeliveryNote(id: string): Promise<void> {
  const dn = await dataStore.deliveryNotes.getById(id);
  if (!dn) return;
  const lines = (await dataStore.deliveryNoteLines.getAll()).filter(
    (l) => l.deliveryNoteId === id,
  );
  await Promise.all([
    ...lines.map((l) => dataStore.deliveryNoteLines.remove(l.id)),
    dataStore.deliveryNotes.remove(id),
  ]);
  await recordAudit({
    action: 'DN_DELETE',
    entityType: 'DeliveryNote',
    entityId: id,
    summary: `Deleted Delivery Note ${dn.deliveryNoteNumber}`,
  });
  await refreshAfterChange();
}

// ---- Invoice ------------------------------------------------------------------

export async function createInvoice(input: InvoiceInput): Promise<Invoice> {
  const invoiceNumber = input.invoiceNumber.trim();
  if (!invoiceNumber) throw new Error('Invoice number is required.');
  const pi = await dataStore.pis.getById(input.piId);
  if (!pi) throw new Error('Select a valid PI.');
  const validLines = assertLines(input.lines, 'Invoice');

  const clash = (await dataStore.invoices.getAll()).find(
    (i) => i.invoiceNumber === invoiceNumber,
  );
  if (clash) throw new Error(`Invoice ${invoiceNumber} already exists.`);

  let deliveryNoteNumber: string | null = null;
  if (input.deliveryNoteId) {
    const dn = await dataStore.deliveryNotes.getById(input.deliveryNoteId);
    deliveryNoteNumber = dn?.deliveryNoteNumber ?? null;
  }

  const now = new Date().toISOString();
  const id = newId('inv');
  const invoice: Invoice = {
    id,
    invoiceNumber,
    piNumber: pi.piNumber,
    deliveryNoteNumber,
    piId: pi.id,
    customer: pi.customer,
    documentDate: input.documentDate || null,
    notes: input.notes?.trim() ?? '',
    createdAt: now,
    createdBy: getCurrentOperator(),
  };
  await dataStore.invoices.save(invoice);
  await dataStore.invoiceLines.saveMany(
    validLines.map((l) => ({
      id: newId('il'),
      invoiceId: id,
      invoiceNumber,
      piNumber: pi.piNumber,
      sku: l.sku.trim(),
      description: l.description.trim(),
      quantity: Number(l.quantity) || 0,
    })),
  );

  await recordAudit({
    action: 'INVOICE_CREATE',
    entityType: 'Invoice',
    entityId: id,
    summary: `Created Invoice ${invoiceNumber} for PI ${pi.piNumber}`,
  });
  await refreshAfterChange();
  return invoice;
}

export async function deleteInvoice(id: string): Promise<void> {
  const inv = await dataStore.invoices.getById(id);
  if (!inv) return;
  const lines = await dataStore.invoiceLines.byInvoice(id);
  await Promise.all([
    ...lines.map((l) => dataStore.invoiceLines.remove(l.id)),
    dataStore.invoices.remove(id),
  ]);
  await recordAudit({
    action: 'INVOICE_DELETE',
    entityType: 'Invoice',
    entityId: id,
    summary: `Deleted Invoice ${inv.invoiceNumber}`,
  });
  await refreshAfterChange();
}
