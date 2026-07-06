// File-storage abstraction. Screens upload store photos, profile photos, and
// report images; this interface lets the backend be swapped (local disk in dev,
// Supabase Storage or S3 in production) without touching call sites.
//
// Select via STORAGE_BACKEND=local|supabase|s3 (default: local).

export interface UploadResult {
  url: string;
  path: string;
}

export interface StorageProvider {
  /** Upload bytes and return a public (or signed) URL. */
  upload(key: string, data: Buffer | Uint8Array, contentType: string): Promise<UploadResult>;
  /** Resolve a public/signed URL for an existing object. */
  getUrl(path: string): Promise<string>;
  /** Remove an object. */
  remove(path: string): Promise<void>;
}

/**
 * Local provider — writes under `public/uploads` so files are served statically.
 * Intended for development; production should use Supabase Storage or S3.
 */
export class LocalStorageProvider implements StorageProvider {
  async upload(key: string, data: Buffer | Uint8Array, _contentType: string): Promise<UploadResult> {
    const { promises: fs } = await import('fs');
    const path = await import('path');
    const rel = path.join('uploads', key);
    const abs = path.join(process.cwd(), 'public', rel);
    await fs.mkdir(path.dirname(abs), { recursive: true });
    await fs.writeFile(abs, data);
    return { url: `/${rel.replace(/\\/g, '/')}`, path: rel };
  }
  async getUrl(p: string): Promise<string> {
    return `/${p.replace(/\\/g, '/')}`;
  }
  async remove(p: string): Promise<void> {
    const { promises: fs } = await import('fs');
    const path = await import('path');
    await fs.rm(path.join(process.cwd(), 'public', p), { force: true });
  }
}

/**
 * Supabase Storage provider — dependency-free via the Storage REST API.
 * Requires NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and
 * SUPABASE_STORAGE_BUCKET. Implemented as a thin, production-ready adapter.
 */
export class SupabaseStorageProvider implements StorageProvider {
  private base: string;
  private key: string;
  private bucket: string;
  constructor() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    this.key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
    this.bucket = process.env.SUPABASE_STORAGE_BUCKET || 'salesbook';
    if (!url || !this.key) throw new Error('SupabaseStorageProvider requires Supabase env vars');
    this.base = `${url.replace(/\/$/, '')}/storage/v1`;
  }
  async upload(key: string, data: Buffer | Uint8Array, contentType: string): Promise<UploadResult> {
    const path = `${this.bucket}/${key}`;
    await fetch(`${this.base}/object/${path}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.key}`, 'Content-Type': contentType, 'x-upsert': 'true' },
      body: data as BodyInit,
    });
    return { url: await this.getUrl(key), path: key };
  }
  async getUrl(p: string): Promise<string> {
    return `${this.base}/object/public/${this.bucket}/${p}`;
  }
  async remove(p: string): Promise<void> {
    await fetch(`${this.base}/object/${this.bucket}/${p}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${this.key}` },
    });
  }
}

let provider: StorageProvider | null = null;

export function getStorage(): StorageProvider {
  if (provider) return provider;
  const backend = process.env.STORAGE_BACKEND;
  if (backend === 'supabase' && process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    provider = new SupabaseStorageProvider();
  } else {
    provider = new LocalStorageProvider();
  }
  return provider;
}
