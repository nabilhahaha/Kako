// ============================================================================
// Web transport — talks to the cloud via the dedicated /api/sync endpoint
// (design §3, cloud transport decision). push is idempotent via clientOpId; pull
// is cursor-based. The server endpoint + its dedupe/migration are DESIGNED in
// docs/architecture/offline-first-sync.md and gated behind KAKO_SYNC; this
// client is inert until that endpoint is enabled.
// ============================================================================

import type { OutboxEntry, PushOutcome, RemoteRecord } from '../types';
import type { Transport } from '../engine';

export interface WebTransportOptions {
  /** Base path of the sync API. */
  endpoint?: string;
  /** Injectable fetch (defaults to global fetch) — eases testing. */
  fetchImpl?: typeof fetch;
}

export class WebTransport implements Transport {
  private readonly endpoint: string;
  private readonly fetchImpl: typeof fetch;

  constructor(opts: WebTransportOptions = {}) {
    this.endpoint = opts.endpoint ?? '/api/sync';
    this.fetchImpl = opts.fetchImpl ?? globalThis.fetch.bind(globalThis);
  }

  async push(ops: OutboxEntry[]): Promise<PushOutcome[]> {
    const res = await this.fetchImpl(`${this.endpoint}/push`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      // Send only what the server needs; clientOpId carries idempotency.
      body: JSON.stringify({
        ops: ops.map((o) => ({
          clientOpId: o.clientOpId, entity: o.entity, op: o.op, pk: o.pk,
          baseVersion: o.baseVersion, payload: o.payload,
        })),
      }),
    });
    if (!res.ok) {
      // Whole-batch transport failure → mark each op errored so it retries.
      const error = `sync push failed: HTTP ${res.status}`;
      return ops.map((o) => ({ clientOpId: o.clientOpId, status: 'error' as const, error }));
    }
    const json = (await res.json()) as { outcomes: PushOutcome[] };
    return json.outcomes;
  }

  async pull(entity: string, cursor: string | null): Promise<{ changes: RemoteRecord[]; cursor: string }> {
    const url = new URL(`${this.endpoint}/pull`, globalThis.location?.origin ?? 'http://localhost');
    url.searchParams.set('entity', entity);
    if (cursor) url.searchParams.set('cursor', cursor);
    const res = await this.fetchImpl(url.toString(), { method: 'GET' });
    if (!res.ok) throw new Error(`sync pull failed: HTTP ${res.status}`);
    return (await res.json()) as { changes: RemoteRecord[]; cursor: string };
  }
}
