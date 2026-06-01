/** Field evidence upload (FE-5a). Browser-side: uploads a photo blob to the
 *  private `field-evidence` bucket under a company-prefixed, deterministic path
 *  (so a retried upload resumes to the same object — idempotent), with automatic
 *  exponential-backoff retry. Returns the storage path stored as evidence. */

export const EVIDENCE_BUCKET = 'field-evidence';

/** Company-prefixed path: `<company>/<entity>/<uuid>.<ext>`. The company prefix
 *  is what the storage RLS authorizes against. */
export function evidencePath(companyId: string, entity: string, fileName?: string): string {
  const name = fileName ?? '';
  const dot = name.lastIndexOf('.');
  const ext = (dot >= 0 ? name.slice(dot + 1) : '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 5) || 'jpg';
  const id = (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${companyId}/${entity}/${id}.${ext}`;
}

/** Exponential backoff: 0.5s, 1s, 2s … capped at 8s. */
export function uploadBackoffMs(attempt: number): number {
  return Math.min(8000, 500 * 2 ** attempt);
}

interface StorageLike {
  storage: {
    from: (bucket: string) => {
      upload: (path: string, file: Blob, opts?: { upsert?: boolean; contentType?: string }) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
    };
  };
}

/** Upload with retry/backoff to a stable path. Throws after exhausting retries. */
export async function uploadEvidence(
  supabase: StorageLike, companyId: string, file: Blob & { name?: string; type?: string }, entity = 'capture',
  opts: { retries?: number; sleep?: (ms: number) => Promise<void> } = {},
): Promise<string> {
  const path = evidencePath(companyId, entity, file.name);
  const retries = opts.retries ?? 3;
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  let lastError = 'upload failed';
  for (let attempt = 0; attempt <= retries; attempt++) {
    const { error } = await supabase.storage.from(EVIDENCE_BUCKET).upload(path, file, { upsert: true, contentType: file.type || 'image/jpeg' });
    if (!error) return path;
    lastError = error.message;
    if (attempt < retries) await sleep(uploadBackoffMs(attempt));
  }
  throw new Error(lastError);
}
