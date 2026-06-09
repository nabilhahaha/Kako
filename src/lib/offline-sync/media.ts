'use client';

// ============================================================================
// Offline media capture (Step 1 — Mobile Field Client). Photos can't ride the
// JSON mutation queue, so they live in their OWN IndexedDB blob store and upload
// via a multipart intake. Two capture targets share one store + one upload loop:
//   • Visit photos — captured against (customer, visitDay); the SERVER resolves
//     the synced visit_id at upload time, so capture is decoupled from check-in
//     ordering (online or offline).
//   • Direct-entity photos — captured against (referenceType, referenceId) for a
//     record that already exists or syncs on its own (van load confirmations,
//     variance evidence, returns, merchandising audits, route riding).
// Idempotent via a per-photo client_ref (UNIQUE on erp_attachments). Compresses
// before storing to keep the device queue + upload small. Browser-only (guarded).
// ============================================================================

const DB_NAME = 'vantora-media';
const STORE = 'media';

export interface PendingMedia {
  id: string;            // client_ref — the idempotency key for the upload
  // Visit-resolution target: server resolves the synced visit for customer + day.
  customerId?: string;
  visitDate?: string;    // device-local YYYY-MM-DD the photo belongs to
  // OR a direct-entity target: attach straight to this record at upload time.
  referenceType?: string;
  referenceId?: string;
  blob: Blob;
  fileName: string;
  mimeType: string;
  createdAt: string;
}

function hasIDB(): boolean {
  return typeof window !== 'undefined' && typeof window.indexedDB !== 'undefined';
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = window.indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then((db) => new Promise<T>((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const r = fn(t.objectStore(STORE));
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  }));
}

/** Fitted dimensions preserving aspect ratio, capped at maxDim. Pure (testable). */
export function fitDimensions(w: number, h: number, maxDim: number): { width: number; height: number } {
  const s = Math.min(1, maxDim / Math.max(w, h || 1));
  return { width: Math.max(1, Math.round(w * s)), height: Math.max(1, Math.round(h * s)) };
}

/** Compress an image to JPEG (≤ maxDim on the long edge). Falls back to the
 *  original file if the browser can't decode/encode it. */
export async function compressImage(file: File, maxDim = 1280, quality = 0.7): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file);
    const { width, height } = fitDimensions(bitmap.width, bitmap.height, maxDim);
    const canvas = document.createElement('canvas');
    canvas.width = width; canvas.height = height;
    const cx = canvas.getContext('2d');
    if (!cx) return file;
    cx.drawImage(bitmap, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob((b) => res(b), 'image/jpeg', quality));
    bitmap.close?.();
    return blob ?? file;
  } catch {
    return file;
  }
}

async function queueMedia(target: Pick<PendingMedia, 'customerId' | 'visitDate' | 'referenceType' | 'referenceId'>, file: File): Promise<string> {
  if (!hasIDB()) return '';
  const blob = await compressImage(file);
  const m: PendingMedia = {
    id: crypto.randomUUID(),
    ...target, blob,
    fileName: file.name || `photo-${Date.now()}.jpg`,
    mimeType: blob.type || 'image/jpeg',
    createdAt: new Date().toISOString(),
  };
  await tx('readwrite', (s) => s.put(m));
  return m.id;
}

/** Capture a field photo against a customer/day — compressed + queued offline.
 *  The server resolves the rep's synced visit at upload time. */
export async function captureMedia(customerId: string, visitDate: string, file: File): Promise<string> {
  return queueMedia({ customerId, visitDate }, file);
}

/** Capture a field photo against a specific record (van load confirmation,
 *  variance evidence, return, merchandising audit, route ride) — compressed +
 *  queued offline. The server attaches it directly to that entity at upload time.
 *  Reuses the same store, upload loop, intake route, and field.attach_media gate. */
export async function captureEntityMedia(referenceType: string, referenceId: string, file: File): Promise<string> {
  return queueMedia({ referenceType, referenceId }, file);
}

function getAll(): Promise<PendingMedia[]> {
  return tx<PendingMedia[]>('readonly', (s) => s.getAll());
}

export async function pendingMediaCount(): Promise<number> {
  if (!hasIDB()) return 0;
  return (await getAll()).length;
}

export interface MediaSyncOutcome { uploaded: number; pending: number; failed: number; offline?: boolean }

/** The non-blob intake fields for a queued photo. A direct-entity target
 *  (reference_type/reference_id) takes precedence over visit resolution
 *  (customer_id/visit_date). Pure (testable). */
export function mediaUploadFields(m: PendingMedia): Record<string, string> {
  const fields: Record<string, string> = { client_ref: m.id };
  if (m.referenceType && m.referenceId) {
    fields.reference_type = m.referenceType;
    fields.reference_id = m.referenceId;
  } else {
    if (m.customerId) fields.customer_id = m.customerId;
    if (m.visitDate) fields.visit_date = m.visitDate;
  }
  return fields;
}

/**
 * Upload queued photos. The server resolves the synced visit and attaches the
 * photo to it; if the visit hasn't synced yet the item stays queued (counted as
 * `pending`) and retries on the next sync. Uploaded items are removed.
 */
export async function syncMedia(): Promise<MediaSyncOutcome> {
  if (!hasIDB()) return { uploaded: 0, pending: 0, failed: 0 };
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return { uploaded: 0, pending: 0, failed: 0, offline: true };
  const all = await getAll();
  let uploaded = 0, pending = 0, failed = 0;
  for (const m of all) {
    const fd = new FormData();
    for (const [k, v] of Object.entries(mediaUploadFields(m))) fd.append(k, v);
    fd.append('file', m.blob, m.fileName);
    let res: Response;
    try {
      res = await fetch('/api/internal/offline-media', { method: 'POST', body: fd });
    } catch {
      return { uploaded, pending, failed, offline: true };
    }
    if (!res.ok) { failed++; continue; }
    const data = (await res.json().catch(() => ({}))) as { status?: string };
    if (data.status === 'uploaded') { await tx('readwrite', (s) => s.delete(m.id)); uploaded++; }
    else if (data.status === 'pending') { pending++; }       // visit not synced yet — retry later
    else { failed++; }
  }
  return { uploaded, pending, failed };
}
