import { createHmac, timingSafeEqual } from 'node:crypto';

// Universal Change Request engine — external approval seam (Phase 8). The inbound
// callback every external approval system (email / ERP / government / API) uses to
// return a decision. Security is an HMAC-SHA256 signature over a canonical payload
// with a shared secret (CR_APPROVAL_SECRET) — pure + testable. Concrete outbound
// adapters register via registerApprovalAdapter; this module is the verified intake.

export type ExternalDecision = 'approve' | 'reject';

export interface ExternalApprovalCallback {
  taskId: string;
  decision: ExternalDecision;
  comment?: string;
  adapter: string;        // which external system produced the decision
}

/** Stable, order-fixed string to sign/verify (newline-separated). */
export function canonicalPayload(c: ExternalApprovalCallback): string {
  return [c.adapter, c.taskId, c.decision, c.comment ?? ''].join('\n');
}

/** HMAC-SHA256 signature (hex) of the callback payload. */
export function signApprovalCallback(c: ExternalApprovalCallback, secret: string): string {
  return createHmac('sha256', secret).update(canonicalPayload(c)).digest('hex');
}

/** Constant-time verification of a callback signature. */
export function verifyApprovalCallback(c: ExternalApprovalCallback, token: string, secret: string): boolean {
  if (!secret || !token) return false;
  const expected = Buffer.from(signApprovalCallback(c, secret), 'utf8');
  const got = Buffer.from(token, 'utf8');
  if (expected.length !== got.length) return false;
  return timingSafeEqual(expected, got);
}

/** Validate a raw callback body into a typed callback (or null if malformed). */
export function parseApprovalCallback(body: unknown): { callback: ExternalApprovalCallback; signature: string } | null {
  if (!body || typeof body !== 'object') return null;
  const b = body as Record<string, unknown>;
  const taskId = typeof b.task_id === 'string' ? b.task_id : '';
  const decision = b.decision === 'approve' || b.decision === 'reject' ? b.decision : null;
  const adapter = typeof b.adapter === 'string' ? b.adapter : '';
  const signature = typeof b.signature === 'string' ? b.signature : '';
  const comment = typeof b.comment === 'string' ? b.comment : undefined;
  if (!taskId || !decision || !adapter || !signature) return null;
  return { callback: { taskId, decision, comment, adapter }, signature };
}
