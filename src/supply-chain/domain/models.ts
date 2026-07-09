/**
 * Core domain models. Persistence-agnostic plain data structures.
 * Repositories store them; services operate on them; the UI renders them.
 *
 * Phase 1 is manual-first: PIs, Delivery Notes and Invoices are created through
 * ERP-style entry forms. Nothing here assumes a file/import origin.
 */
import type { ExceptionStatus, PiStatus, Severity } from './enums';

/** Header-level Proforma Invoice. */
export interface PI {
  id: string;
  piNumber: string;
  customer: string;
  status: PiStatus;
  creationDate: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
}

/** A per-SKU line on a PI — the authoritative ordered quantity. */
export interface PiLine {
  id: string;
  piId: string;
  piNumber: string;
  sku: string;
  description: string;
  quantity: number;
  unitPrice: number | null;
}

export interface DeliveryNote {
  id: string;
  deliveryNoteNumber: string;
  piNumber: string;
  piId: string | null;
  customer: string;
  documentDate: string | null;
  notes: string;
  createdAt: string;
  createdBy: string;
}

export interface DeliveryNoteLine {
  id: string;
  deliveryNoteId: string;
  deliveryNoteNumber: string;
  piNumber: string;
  piId: string | null;
  sku: string;
  description: string;
  quantity: number;
  productionDate: string | null;
  expiryDate: string | null;
  shelfLifeDays: number | null;
}

export interface Invoice {
  id: string;
  invoiceNumber: string;
  piNumber: string;
  deliveryNoteNumber: string | null;
  piId: string | null;
  customer: string;
  documentDate: string | null;
  notes: string;
  createdAt: string;
  createdBy: string;
}

export interface InvoiceLine {
  id: string;
  invoiceId: string;
  invoiceNumber: string;
  piNumber: string;
  sku: string;
  description: string;
  quantity: number;
}

/** A single entry in an exception's immutable history trail. */
export interface ExceptionHistoryEntry {
  at: string;
  by: string;
  action: string;
  note?: string;
}

/** A stored email/document attachment (base64 data URL). */
export interface StoredAttachment {
  name: string;
  mimeType: string;
  sizeBytes: number;
  dataUrl: string;
}

/**
 * A validation exception. Mandatory whenever a validation failure is
 * overridden. Permanently linked to PI / Delivery Note / SKU and never deleted.
 */
export interface ExceptionRecord {
  id: string;
  status: ExceptionStatus;
  ruleCode: string;
  piId: string | null;
  piNumber: string;
  deliveryNoteId: string | null;
  deliveryNoteNumber: string | null;
  sku: string | null;
  reason: string;
  notes: string;
  emailAttachment: StoredAttachment | null;
  approvedBy: string | null;
  approvalDate: string | null;
  createdAt: string;
  createdBy: string;
  history: ExceptionHistoryEntry[];
}

/** One outcome produced by a validation rule. */
export interface ValidationResult {
  id: string;
  ruleCode: string;
  ruleName: string;
  severity: Severity;
  scope: 'pi' | 'delivery_note' | 'invoice' | 'sku';
  piId: string | null;
  piNumber: string | null;
  deliveryNoteNumber: string | null;
  invoiceNumber: string | null;
  sku: string | null;
  message: string;
  details: Record<string, string | number | null>;
  coveredByExceptionId: string | null;
  createdAt: string;
}

export interface AuditLogEntry {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  summary: string;
  user: string;
  timestamp: string;
  meta: Record<string, unknown>;
}
