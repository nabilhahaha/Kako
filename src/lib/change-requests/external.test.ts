import { describe, it, expect } from 'vitest';
import {
  canonicalPayload,
  signApprovalCallback,
  verifyApprovalCallback,
  parseApprovalCallback,
  type ExternalApprovalCallback,
} from './external';

const cb: ExternalApprovalCallback = { taskId: 'task-1', decision: 'approve', comment: 'ok', adapter: 'email' };
const SECRET = 'shhh-very-secret';

describe('change-requests/external · signature', () => {
  it('signs and verifies a callback (constant-time)', () => {
    const sig = signApprovalCallback(cb, SECRET);
    expect(verifyApprovalCallback(cb, sig, SECRET)).toBe(true);
  });
  it('rejects a tampered decision / task / adapter', () => {
    const sig = signApprovalCallback(cb, SECRET);
    expect(verifyApprovalCallback({ ...cb, decision: 'reject' }, sig, SECRET)).toBe(false);
    expect(verifyApprovalCallback({ ...cb, taskId: 'task-2' }, sig, SECRET)).toBe(false);
    expect(verifyApprovalCallback({ ...cb, adapter: 'erp' }, sig, SECRET)).toBe(false);
  });
  it('rejects a wrong secret / empty token', () => {
    const sig = signApprovalCallback(cb, SECRET);
    expect(verifyApprovalCallback(cb, sig, 'wrong')).toBe(false);
    expect(verifyApprovalCallback(cb, '', SECRET)).toBe(false);
    expect(verifyApprovalCallback(cb, sig, '')).toBe(false);
  });
  it('canonical payload is order-stable', () => {
    expect(canonicalPayload(cb)).toBe('email\ntask-1\napprove\nok');
    expect(canonicalPayload({ ...cb, comment: undefined })).toBe('email\ntask-1\napprove\n');
  });
});

describe('change-requests/external · parse', () => {
  it('parses a well-formed body', () => {
    const out = parseApprovalCallback({ task_id: 't1', decision: 'reject', adapter: 'erp', signature: 'abc', comment: 'no' });
    expect(out).toEqual({ callback: { taskId: 't1', decision: 'reject', comment: 'no', adapter: 'erp' }, signature: 'abc' });
  });
  it('rejects malformed bodies', () => {
    expect(parseApprovalCallback(null)).toBeNull();
    expect(parseApprovalCallback({ task_id: 't1', decision: 'maybe', adapter: 'e', signature: 's' })).toBeNull();
    expect(parseApprovalCallback({ task_id: 't1', decision: 'approve', adapter: 'e' })).toBeNull(); // no signature
    expect(parseApprovalCallback({ decision: 'approve', adapter: 'e', signature: 's' })).toBeNull(); // no task
  });
});
