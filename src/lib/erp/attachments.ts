/** Attachments — pure helpers (no server deps; unit-testable). Allowed types and
 *  per-category size limits per the locked pilot decision. */

export const ATTACHMENTS_BUCKET = 'attachments';

const MB = 1024 * 1024;

/** Allowed MIME types → category + max size (bytes). */
const ALLOWED: Record<string, { category: 'image' | 'pdf' | 'document'; maxBytes: number; ext: string }> = {
  'image/jpeg': { category: 'image', maxBytes: 10 * MB, ext: 'jpg' },
  'image/png': { category: 'image', maxBytes: 10 * MB, ext: 'png' },
  'application/pdf': { category: 'pdf', maxBytes: 20 * MB, ext: 'pdf' },
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': { category: 'document', maxBytes: 10 * MB, ext: 'docx' },
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': { category: 'document', maxBytes: 10 * MB, ext: 'xlsx' },
};

export const ALLOWED_MIME_TYPES = Object.keys(ALLOWED);
export const ALLOWED_EXTENSIONS = ['jpg', 'jpeg', 'png', 'pdf', 'docx', 'xlsx'];

/** A safe lowercase extension for the stored object name. */
export function safeExtension(mimeType: string, fileName: string): string {
  const byMime = ALLOWED[mimeType]?.ext;
  if (byMime) return byMime;
  const dot = fileName.lastIndexOf('.');
  const ext = dot >= 0 ? fileName.slice(dot + 1).toLowerCase() : '';
  return ALLOWED_EXTENSIONS.includes(ext) ? ext : 'bin';
}

/** Validate a candidate upload by MIME type + size against the category limit. */
export function validateAttachment(input: { type: string; size: number }): { ok: true } | { ok: false; error: string } {
  const spec = ALLOWED[input.type];
  if (!spec) return { ok: false, error: 'type_not_allowed' };
  if (input.size <= 0) return { ok: false, error: 'empty_file' };
  if (input.size > spec.maxBytes) return { ok: false, error: `too_large_${spec.category}` };
  return { ok: true };
}
