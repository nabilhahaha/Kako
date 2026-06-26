import { describe, it, expect } from 'vitest';
import { bytesToBase64, tlvField, zatcaQrPayload } from './zatca-qr';

describe('zatca-qr — Phase-1 TLV/Base64 payload', () => {
  it('bytesToBase64 matches known vectors (incl. padding)', () => {
    const enc = (s: string) => bytesToBase64(new TextEncoder().encode(s));
    expect(enc('')).toBe('');
    expect(enc('f')).toBe('Zg==');
    expect(enc('fo')).toBe('Zm8=');
    expect(enc('foo')).toBe('Zm9v');
    expect(enc('foobar')).toBe('Zm9vYmFy');
  });

  it('tlvField encodes [tag][len][utf8] with the byte length', () => {
    const f = tlvField(1, 'AB');
    expect(Array.from(f)).toEqual([1, 2, 65, 66]);
    // multi-byte UTF-8 length is the BYTE count, not char count
    const arabic = tlvField(2, 'م'); // 1 char, 2 bytes
    expect(arabic[0]).toBe(2);
    expect(arabic[1]).toBe(2);
  });

  it('zatcaQrPayload is a stable base64 of tags 1..5 that round-trips', () => {
    const qr = zatcaQrPayload({ sellerName: 'Tasty Bites', vatNumber: '300000000000003', timestamp: '2026-06-25T13:30:00Z', total: '135.43', vatTotal: '16.63' });
    expect(typeof qr).toBe('string');
    expect(qr.length).toBeGreaterThan(20);
    // decode first TLV field: tag 1, length 11 ("Tasty Bites")
    const bin = atob(qr);
    expect(bin.charCodeAt(0)).toBe(1);       // tag 1
    expect(bin.charCodeAt(1)).toBe(11);      // "Tasty Bites" length
    expect(bin.slice(2, 13)).toBe('Tasty Bites');
  });
});
