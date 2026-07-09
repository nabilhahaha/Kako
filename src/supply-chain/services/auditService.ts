/**
 * Audit logging. Every meaningful action funnels through here so the trail is
 * complete and consistent. Entries are append-only — never updated or deleted.
 */
import type { AuditAction } from '../domain/enums';
import type { AuditLogEntry } from '../domain/models';
import { dataStore } from '../repositories';
import { newId } from '../utils/ids';
import { getCurrentOperator } from './session';

export async function recordAudit(params: {
  action: AuditAction;
  entityType: string;
  entityId?: string | null;
  summary: string;
  meta?: Record<string, unknown>;
  user?: string;
}): Promise<AuditLogEntry> {
  const entry: AuditLogEntry = {
    id: newId('audit'),
    action: params.action,
    entityType: params.entityType,
    entityId: params.entityId ?? null,
    summary: params.summary,
    user: params.user ?? getCurrentOperator(),
    timestamp: new Date().toISOString(),
    meta: params.meta ?? {},
  };
  await dataStore.audit.save(entry);
  return entry;
}

export async function listAudit(): Promise<AuditLogEntry[]> {
  const all = await dataStore.audit.getAll();
  return all.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
}
