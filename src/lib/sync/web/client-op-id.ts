// ============================================================================
// Stable client operation id (idempotency key) for offline-first sync.
//
// Every local mutation gets ONE id at creation time, persisted in the outbox.
// Retries reuse the same id, so the cloud can dedupe (exactly-once effect) even
// across browser refreshes / reconnects. See design §6 (idempotency).
// ============================================================================

/** A v4-ish uuid using the platform CSPRNG (crypto.randomUUID where available). */
export function newClientOpId(): string {
  const c: Crypto | undefined =
    typeof globalThis !== 'undefined' ? (globalThis.crypto as Crypto | undefined) : undefined;
  if (c?.randomUUID) return c.randomUUID();
  // Fallback (older webviews): RFC-4122 v4 from getRandomValues.
  const b = new Uint8Array(16);
  if (c?.getRandomValues) c.getRandomValues(b);
  else for (let i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0'));
  return `${h.slice(0, 4).join('')}-${h.slice(4, 6).join('')}-${h.slice(6, 8).join('')}-${h.slice(8, 10).join('')}-${h.slice(10, 16).join('')}`;
}
