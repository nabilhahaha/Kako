import { describe, it, expect } from 'vitest';
import {
  WEBHOOK_EVENTS, isKnownWebhookEvent, isValidEventKey, isValidWebhookUrl, webhookEventsByEntity,
} from './webhooks';

describe('webhooks — event catalog (Phase 2B)', () => {
  it('contains the approved starter set', () => {
    expect(WEBHOOK_EVENTS.map((e) => e.key).sort()).toEqual([
      'approval.completed', 'customer.created', 'customer.updated',
      'invoice.created', 'product.created', 'product.updated',
      'supplier.created', 'supplier.updated',
    ]);
  });
  it('every event has ar + en labels and a well-formed key', () => {
    for (const e of WEBHOOK_EVENTS) {
      expect(e.labelEn.length).toBeGreaterThan(0);
      expect(e.labelAr.length).toBeGreaterThan(0);
      expect(isValidEventKey(e.key)).toBe(true);
    }
  });
  it('recognises known vs unknown events', () => {
    expect(isKnownWebhookEvent('customer.created')).toBe(true);
    expect(isKnownWebhookEvent('customer.deleted')).toBe(false);
  });
});

describe('webhooks — validation (mirrors DB-side checks in 0092)', () => {
  it('event key format', () => {
    expect(isValidEventKey('invoice.created')).toBe(true);
    expect(isValidEventKey('approval.completed')).toBe(true);
    expect(isValidEventKey('Invoice.Created')).toBe(false);
    expect(isValidEventKey('invoice')).toBe(false);
    expect(isValidEventKey('a.b.c')).toBe(false);
  });
  it('requires https URLs', () => {
    expect(isValidWebhookUrl('https://example.com/hook')).toBe(true);
    expect(isValidWebhookUrl('http://example.com/hook')).toBe(false);
    expect(isValidWebhookUrl('ftp://example.com')).toBe(false);
    expect(isValidWebhookUrl('  https://x.io ')).toBe(true);
  });
});

describe('webhooks — grouping for the UI', () => {
  it('groups events by entity', () => {
    const g = webhookEventsByEntity();
    expect(g.customer.map((e) => e.key)).toEqual(['customer.created', 'customer.updated']);
    expect(g.invoice.map((e) => e.key)).toEqual(['invoice.created']);
    expect(g.approval.map((e) => e.key)).toEqual(['approval.completed']);
  });
});
