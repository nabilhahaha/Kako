// ZATCA (Saudi e-invoicing) — Phase-1 simplified-tax-invoice QR payload (pure, isomorphic).
//
// Builds the Base64 TLV (Tag-Length-Value) string mandated for the simplified tax invoice QR:
//   tag 1 = seller name, 2 = VAT number, 3 = timestamp (ISO-8601), 4 = invoice total (with
//   VAT), 5 = VAT total. Phase-2 adds tags 6–9 (hash, ECDSA signature, public key, signature
//   of the public key) — those plug in here later without changing callers, which is why this
//   is a small, modular, dependency-free encoder. This prepares the QR DATA; it does NOT make
//   the invoice officially compliant until Phase-2 cryptographic signing + ZATCA reporting are
//   integrated and tested.

export interface ZatcaQrFields {
  sellerName: string;
  vatNumber: string;
  timestamp: string;   // ISO-8601, e.g. 2026-06-25T13:30:00Z
  total: string;       // invoice grand total incl. VAT, e.g. "135.43"
  vatTotal: string;    // total VAT amount, e.g. "16.63"
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** Base64 of a byte array — manual (no Buffer/btoa) so it runs anywhere and is unit-tested. */
export function bytesToBase64(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i], b1 = bytes[i + 1], b2 = bytes[i + 2];
    out += B64[b0 >> 2];
    out += B64[((b0 & 3) << 4) | ((b1 ?? 0) >> 4)];
    out += i + 1 < bytes.length ? B64[((b1 & 15) << 2) | ((b2 ?? 0) >> 6)] : '=';
    out += i + 2 < bytes.length ? B64[b2 & 63] : '=';
  }
  return out;
}

/** One TLV field as bytes: [tag][length][UTF-8 value...]. Length is the UTF-8 byte count. */
export function tlvField(tag: number, value: string): Uint8Array {
  const val = new TextEncoder().encode(value ?? '');
  const out = new Uint8Array(2 + val.length);
  out[0] = tag & 0xff;
  out[1] = val.length & 0xff;
  out.set(val, 2);
  return out;
}

/** The ZATCA Phase-1 simplified-invoice QR string (Base64 of TLV tags 1–5). Pure. */
export function zatcaQrPayload(f: ZatcaQrFields): string {
  const parts = [
    tlvField(1, f.sellerName),
    tlvField(2, f.vatNumber),
    tlvField(3, f.timestamp),
    tlvField(4, f.total),
    tlvField(5, f.vatTotal),
  ];
  const total = parts.reduce((n, p) => n + p.length, 0);
  const buf = new Uint8Array(total);
  let off = 0;
  for (const p of parts) { buf.set(p, off); off += p.length; }
  return bytesToBase64(buf);
}
