/**
 * Structured audit envelope (G5) — pure, no I/O. Standardises the `details`
 * JSONB written to the audit log so every customer direct-edit and every applied
 * change request consistently carries: field(s) old→new, the actor role, the
 * reason, and the related request reference. Backward-compatible: callers pass
 * any existing keys via `extra`, which are merged so current consumers keep
 * working alongside the new structured keys.
 */

export interface AuditFieldChange {
  field: string;
  oldValue: unknown;
  newValue: unknown;
}

export interface AuditEnvelopeInput {
  /** Single-field change. */
  field?: string;
  oldValue?: unknown;
  newValue?: unknown;
  /** Multi-field change (direct edit diff). */
  changes?: AuditFieldChange[];
  /** Actor's role (e.g. highest-privilege role). */
  role?: string | null;
  /** Free-text reason captured at the call site. */
  reason?: string | null;
  /** Related request reference (change-request / workflow / request id). */
  requestRef?: string | null;
  /** Optional semantic event label (e.g. 'data_update_submitted'). */
  event?: string;
  /** Legacy/extra keys to preserve for existing consumers. */
  extra?: Record<string, unknown>;
}

/** Build a standardized audit `details` object. Empty/undefined keys are omitted;
 *  `extra` legacy keys are merged underneath. */
export function auditEnvelope(i: AuditEnvelopeInput): Record<string, unknown> {
  const d: Record<string, unknown> = { ...(i.extra ?? {}) };
  if (i.field !== undefined) d.field = i.field;
  if (i.oldValue !== undefined) d.oldValue = i.oldValue;
  if (i.newValue !== undefined) d.newValue = i.newValue;
  if (i.changes && i.changes.length > 0) d.changes = i.changes;
  if (i.role != null && i.role !== '') d.role = i.role;
  if (i.reason != null && i.reason !== '') d.reason = i.reason;
  if (i.requestRef != null && i.requestRef !== '') d.requestRef = i.requestRef;
  if (i.event) d.event = i.event;
  return d;
}

/** Field-level diff over `keys` (changed entries only; null-normalised). */
export function diffFields(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  keys: string[],
): AuditFieldChange[] {
  const out: AuditFieldChange[] = [];
  for (const k of keys) {
    const o = before[k] ?? null;
    const n = after[k] ?? null;
    if (JSON.stringify(o) !== JSON.stringify(n)) out.push({ field: k, oldValue: o, newValue: n });
  }
  return out;
}
