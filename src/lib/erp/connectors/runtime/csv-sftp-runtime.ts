import { parseCsv, parseJson } from '@/lib/erp/import-parse';
import { toCsv, toJson, type ExportRow } from '@/lib/erp/export-serialize';
import { mapRecord } from './generic-rest-runtime';

/** ── CSV/JSON over SFTP runtime (Phase 2C-3 / B1) ───────────────────────────
 *  Node-side pull/push transport for the csv_sftp adapter, used by the sync
 *  dispatcher. Reuses the pure CSV/JSON parsers (import-parse) and serializers
 *  (export-serialize). The SFTP client is lazy-loaded so this module is
 *  unit-testable with an injected mock (no native dep at test time). Files are
 *  read/written whole — file feeds have no modified-since cursor (mode = full). */

export interface SftpClientLike {
  connect(cfg: Record<string, unknown>): Promise<unknown>;
  get(remotePath: string): Promise<Buffer | string | NodeJS.ReadableStream>;
  put(input: Buffer | string, remotePath: string): Promise<unknown>;
  end(): Promise<unknown>;
}

export interface SftpAuth {
  host: string;
  port?: number;
  username: string;
  /** From Vault: either a password or a private key (PEM). */
  secret?: string | null;
  /** Set true when the secret is an SSH private key rather than a password. */
  isPrivateKey?: boolean;
}

export type FileFormat = 'csv' | 'json';

async function defaultClientFactory(): Promise<SftpClientLike> {
  const mod = await import('ssh2-sftp-client');
  const Client = ((mod as unknown as { default?: unknown }).default ?? mod) as { new (): SftpClientLike };
  return new Client();
}

function connectConfig(auth: SftpAuth): Record<string, unknown> {
  return {
    host: auth.host,
    port: auth.port ?? 22,
    username: auth.username,
    ...(auth.secret ? (auth.isPrivateKey ? { privateKey: auth.secret } : { password: auth.secret }) : {}),
  };
}

async function toText(raw: Buffer | string | NodeJS.ReadableStream): Promise<string> {
  if (typeof raw === 'string') return raw;
  if (Buffer.isBuffer(raw)) return raw.toString('utf8');
  // ReadableStream fallback
  const chunks: Buffer[] = [];
  for await (const c of raw as AsyncIterable<Buffer>) chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c));
  return Buffer.concat(chunks).toString('utf8');
}

export interface PullArgs {
  auth: SftpAuth; remotePath: string; format: FileFormat;
  fieldMap?: Record<string, string>;
  clientFactory?: () => Promise<SftpClientLike>;
}

export async function pullCsvSftp(args: PullArgs): Promise<{ records: Record<string, unknown>[] }> {
  const client = await (args.clientFactory ?? defaultClientFactory)();
  try {
    await client.connect(connectConfig(args.auth));
    const text = await toText(await client.get(args.remotePath));
    const sheet = args.format === 'json' ? parseJson(text) : parseCsv(text);
    const records = sheet.rows.map((r) => mapRecord(r, args.fieldMap));
    return { records };
  } finally {
    try { await client.end(); } catch { /* ignore close errors */ }
  }
}

export interface PushArgs {
  auth: SftpAuth; remotePath: string; format: FileFormat;
  records: Record<string, unknown>[]; fieldMap?: Record<string, string>;
  clientFactory?: () => Promise<SftpClientLike>;
}

export async function pushCsvSftp(args: PushArgs): Promise<{ sent: number }> {
  const mapped = args.records.map((r) => mapRecord(r, args.fieldMap));
  const headers = [...new Set(mapped.flatMap((r) => Object.keys(r)))];
  const body = args.format === 'json'
    ? toJson(headers, mapped as unknown as ExportRow[])
    : toCsv(headers, mapped as unknown as ExportRow[]);
  const client = await (args.clientFactory ?? defaultClientFactory)();
  try {
    await client.connect(connectConfig(args.auth));
    await client.put(Buffer.from(body, 'utf8'), args.remotePath);
    return { sent: mapped.length };
  } finally {
    try { await client.end(); } catch { /* ignore close errors */ }
  }
}
