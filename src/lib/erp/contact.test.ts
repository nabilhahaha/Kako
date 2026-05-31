import { describe, it, expect } from 'vitest';
import {
  whatsappLink,
  normalizeWhatsAppPhone,
  customerWhatsappLink,
  SUPPORT_PHONE,
  SUPPORT_PHONE_EG,
} from './contact';

describe('normalizeWhatsAppPhone', () => {
  it('converts Egyptian local mobile (01x…) to international digits without +', () => {
    // Leading 0 stripped, 20 prepended: '01012345678' → '20' + '1012345678' = '201012345678'
    expect(normalizeWhatsAppPhone('01012345678')).toBe('201012345678');
  });

  it('leaves an already-international Egyptian number unchanged', () => {
    // Starts with '20' → returned as-is (digits only)
    expect(normalizeWhatsAppPhone('+201012345678')).toBe('201012345678');
  });

  it('leaves a Saudi number (966…) unchanged', () => {
    expect(normalizeWhatsAppPhone('+966567628842')).toBe('966567628842');
  });

  it('strips non-digit characters before checking prefix', () => {
    // +20 104 421 5144 → digits 201044215144
    expect(normalizeWhatsAppPhone('+20 104 421 5144')).toBe('201044215144');
  });

  it('returns empty string for null input', () => {
    expect(normalizeWhatsAppPhone(null)).toBe('');
  });

  it('returns empty string for undefined input', () => {
    expect(normalizeWhatsAppPhone(undefined)).toBe('');
  });

  it('returns empty string for an empty string', () => {
    expect(normalizeWhatsAppPhone('')).toBe('');
  });

  it('returns empty string for whitespace-only input', () => {
    expect(normalizeWhatsAppPhone('   ')).toBe('');
  });

  it('returns raw digits when no known country prefix is detected (non-Egyptian/Saudi number)', () => {
    // e.g. US number 1234567890 – no leading 0, not 20/966 → returned as-is
    const result = normalizeWhatsAppPhone('1234567890');
    expect(result).toBe('1234567890');
  });
});

describe('whatsappLink', () => {
  it('builds a wa.me link for the default (primary Saudi) number when no args given', () => {
    const link = whatsappLink();
    const digits = SUPPORT_PHONE.replace(/[^0-9]/g, '');
    expect(link).toBe(`https://wa.me/${digits}`);
  });

  it('builds a wa.me link for the Egyptian support number when passed explicitly', () => {
    const link = whatsappLink(undefined, SUPPORT_PHONE_EG);
    const digits = SUPPORT_PHONE_EG.replace(/[^0-9]/g, '');
    expect(link).toBe(`https://wa.me/${digits}`);
  });

  it('appends a URL-encoded ?text= query when a message is supplied', () => {
    const link = whatsappLink('Hello World', SUPPORT_PHONE);
    expect(link).toContain('?text=');
    expect(link).toContain(encodeURIComponent('Hello World'));
  });

  it('omits the query string entirely when no message is provided', () => {
    const link = whatsappLink(undefined, SUPPORT_PHONE);
    expect(link).not.toContain('?');
  });
});

describe('customerWhatsappLink', () => {
  it('returns a wa.me link for a valid Egyptian local number', () => {
    const link = customerWhatsappLink('01012345678');
    expect(link).toBe('https://wa.me/201012345678');
  });

  it('returns a wa.me link with encoded message when message is provided', () => {
    const link = customerWhatsappLink('01012345678', 'مرحبا');
    expect(link).toContain('https://wa.me/201012345678');
    expect(link).toContain('?text=');
  });

  it('returns empty string for null phone', () => {
    expect(customerWhatsappLink(null)).toBe('');
  });

  it('returns empty string for undefined phone', () => {
    expect(customerWhatsappLink(undefined)).toBe('');
  });

  it('returns empty string for empty string phone', () => {
    expect(customerWhatsappLink('')).toBe('');
  });

  it('handles already-international number correctly', () => {
    const link = customerWhatsappLink('+201044215144');
    expect(link).toBe('https://wa.me/201044215144');
  });
});
