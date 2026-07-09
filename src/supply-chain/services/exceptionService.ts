/**
 * Exception management. Exceptions are mandatory to override validation
 * failures, permanently linked to PI / Delivery Note / SKU, and never deleted.
 * Every state change appends to an immutable history trail.
 */
import type { ExceptionStatus } from '../domain/enums';
import type { ExceptionRecord, StoredAttachment } from '../domain/models';
import { dataStore } from '../repositories';
import { fileToDataUrl } from '../utils/files';
import { newId } from '../utils/ids';
import { recordAudit } from './auditService';
import { recomputeAllStatuses } from './piService';
import { getCurrentOperator } from './session';
import { runValidationAndPersist } from './validationService';

export interface CreateExceptionInput {
  ruleCode: string;
  piId: string | null;
  piNumber: string;
  deliveryNoteId?: string | null;
  deliveryNoteNumber?: string | null;
  sku?: string | null;
  reason: string;
  notes?: string;
  attachment?: File | null;
  approvedBy?: string | null;
  approvalDate?: string | null;
}

async function toStoredAttachment(file: File): Promise<StoredAttachment> {
  return {
    name: file.name,
    mimeType: file.type || 'application/octet-stream',
    sizeBytes: file.size,
    dataUrl: await fileToDataUrl(file),
  };
}

export async function createException(input: CreateExceptionInput): Promise<ExceptionRecord> {
  if (!input.reason?.trim()) throw new Error('A reason is required.');
  if (!input.attachment) throw new Error('An email attachment is required.');

  const now = new Date().toISOString();
  const operator = getCurrentOperator();
  const record: ExceptionRecord = {
    id: newId('exc'),
    status: 'pending',
    ruleCode: input.ruleCode,
    piId: input.piId,
    piNumber: input.piNumber,
    deliveryNoteId: input.deliveryNoteId ?? null,
    deliveryNoteNumber: input.deliveryNoteNumber ?? null,
    sku: input.sku ?? null,
    reason: input.reason.trim(),
    notes: input.notes?.trim() ?? '',
    emailAttachment: await toStoredAttachment(input.attachment),
    approvedBy: input.approvedBy ?? null,
    approvalDate: input.approvalDate ?? null,
    createdAt: now,
    createdBy: operator,
    history: [{ at: now, by: operator, action: 'CREATED', note: input.reason.trim() }],
  };

  await dataStore.exceptions.save(record);
  await recordAudit({
    action: 'EXCEPTION_CREATE',
    entityType: 'Exception',
    entityId: record.id,
    summary: `Exception created for PI ${record.piNumber}${record.sku ? ` / SKU ${record.sku}` : ''} (${record.ruleCode})`,
    meta: { ruleCode: record.ruleCode },
  });

  await runValidationAndPersist();
  await recomputeAllStatuses();
  return record;
}

export async function decideException(
  id: string,
  status: Extract<ExceptionStatus, 'approved' | 'rejected'>,
  opts: { approvedBy: string; note?: string },
): Promise<ExceptionRecord> {
  const existing = await dataStore.exceptions.getById(id);
  if (!existing) throw new Error('Exception not found.');
  if (!opts.approvedBy?.trim()) throw new Error('Approver name is required.');

  const now = new Date().toISOString();
  const updated: ExceptionRecord = {
    ...existing,
    status,
    approvedBy: opts.approvedBy.trim(),
    approvalDate: now,
    history: [
      ...existing.history,
      {
        at: now,
        by: getCurrentOperator(),
        action: status === 'approved' ? 'APPROVED' : 'REJECTED',
        note: opts.note,
      },
    ],
  };

  await dataStore.exceptions.save(updated);
  await recordAudit({
    action: 'EXCEPTION_UPDATE',
    entityType: 'Exception',
    entityId: id,
    summary: `Exception ${status} for PI ${updated.piNumber} by ${updated.approvedBy}`,
    meta: { status },
  });

  await runValidationAndPersist();
  await recomputeAllStatuses();
  return updated;
}

export async function updateExceptionNotes(id: string, notes: string): Promise<ExceptionRecord> {
  const existing = await dataStore.exceptions.getById(id);
  if (!existing) throw new Error('Exception not found.');
  const now = new Date().toISOString();
  const updated: ExceptionRecord = {
    ...existing,
    notes: notes.trim(),
    history: [
      ...existing.history,
      { at: now, by: getCurrentOperator(), action: 'NOTE_UPDATED' },
    ],
  };
  await dataStore.exceptions.save(updated);
  await recordAudit({
    action: 'EXCEPTION_UPDATE',
    entityType: 'Exception',
    entityId: id,
    summary: `Exception notes updated for PI ${updated.piNumber}`,
  });
  return updated;
}

export async function listExceptions(): Promise<ExceptionRecord[]> {
  const all = await dataStore.exceptions.getAll();
  return all.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
