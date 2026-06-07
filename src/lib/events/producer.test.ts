import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';

// Mock the underlying emit so we test the backbone gate, not the bus.
const recordEvent = vi.fn(async (_i: unknown) => {});
vi.mock('@/lib/workflow/emit', () => ({ recordEvent: (i: unknown) => recordEvent(i) }));

import { emitDomainEvent, EVENTS_ENABLED, EVENT } from './producer';

const saved = process.env.KAKO_EVENTS;
beforeEach(() => { recordEvent.mockClear(); });
afterEach(() => { if (saved === undefined) delete process.env.KAKO_EVENTS; else process.env.KAKO_EVENTS = saved; });

describe('event-producer backbone (KAKO_EVENTS)', () => {
  it('defaults OFF when unset', () => {
    delete process.env.KAKO_EVENTS;
    expect(EVENTS_ENABLED()).toBe(false);
  });

  it('no-op when OFF (recordEvent not called)', async () => {
    delete process.env.KAKO_EVENTS;
    await emitDomainEvent({ eventType: EVENT.CUSTOMER_CREATED, entity: 'customer', recordId: 'c1' });
    expect(recordEvent).not.toHaveBeenCalled();
  });

  it('emits via recordEvent when ON ("1" or "true")', async () => {
    process.env.KAKO_EVENTS = '1';
    await emitDomainEvent({ eventType: EVENT.INVOICE_ISSUED, entity: 'invoice', recordId: 'i1', payload: { net: 100 } });
    expect(recordEvent).toHaveBeenCalledTimes(1);
    expect(recordEvent).toHaveBeenCalledWith(expect.objectContaining({ eventType: 'invoice.issued', entity: 'invoice', recordId: 'i1' }));
    process.env.KAKO_EVENTS = 'true';
    await emitDomainEvent({ eventType: EVENT.PAYMENT_RECEIVED, entity: 'payment', recordId: 'p1' });
    expect(recordEvent).toHaveBeenCalledTimes(2);
  });

  it('never throws even if the underlying emit rejects', async () => {
    process.env.KAKO_EVENTS = '1';
    recordEvent.mockRejectedValueOnce(new Error('boom'));
    await expect(emitDomainEvent({ eventType: EVENT.ORDER_CREATED, entity: 'order', recordId: 'o1' })).resolves.toBeUndefined();
  });
});
