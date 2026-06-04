import { describe, it, expect } from 'vitest';
import { validateAttachment, safeExtension, ALLOWED_MIME_TYPES } from './attachments';

const PDF = 'application/pdf';
const PNG = 'image/png';
const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const MB = 1024 * 1024;

describe('attachments validation', () => {
  it('accepts the allowed types within their size limits', () => {
    expect(validateAttachment({ type: PNG, size: 9 * MB }).ok).toBe(true);   // image ≤ 10MB
    expect(validateAttachment({ type: PDF, size: 19 * MB }).ok).toBe(true);  // pdf ≤ 20MB
    expect(validateAttachment({ type: DOCX, size: 9 * MB }).ok).toBe(true);  // doc ≤ 10MB
    expect(validateAttachment({ type: XLSX, size: 9 * MB }).ok).toBe(true);
  });

  it('rejects disallowed types', () => {
    const r = validateAttachment({ type: 'application/x-msdownload', size: 1000 });
    expect(r.ok).toBe(false);
  });

  it('enforces per-category size limits', () => {
    expect(validateAttachment({ type: PNG, size: 11 * MB }).ok).toBe(false);  // image > 10MB
    expect(validateAttachment({ type: PDF, size: 21 * MB }).ok).toBe(false);  // pdf > 20MB
    expect(validateAttachment({ type: DOCX, size: 11 * MB }).ok).toBe(false); // doc > 10MB
    expect(validateAttachment({ type: PNG, size: 0 }).ok).toBe(false);        // empty
  });

  it('maps mime → safe extension', () => {
    expect(safeExtension(PDF, 'x')).toBe('pdf');
    expect(safeExtension(XLSX, 'x')).toBe('xlsx');
    expect(safeExtension('image/jpeg', 'photo.JPG')).toBe('jpg');
  });

  it('exposes the locked allowed-type set', () => {
    expect(ALLOWED_MIME_TYPES).toContain(PDF);
    expect(ALLOWED_MIME_TYPES).toContain(DOCX);
    expect(ALLOWED_MIME_TYPES).toContain(XLSX);
    expect(ALLOWED_MIME_TYPES).not.toContain('text/plain');
  });
});
