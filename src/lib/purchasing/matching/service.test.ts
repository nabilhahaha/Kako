import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { matchInvoice } from './service';
import type { MatchGateway, InvoiceLineForMatch, PoLineRef, LineMatchStatus } from './gateway';

interface Scenario {
  lines: InvoiceLineForMatch[];
  poLines: Record<string, PoLineRef>;
  received: Record<string, number>; // keyed by line id
}

function makeGateway(s: Scenario) {
  const lineSaves: Record<string, { status: LineMatchStatus; flags: string[] }> = {};
  let invoiceSave: { matchStatus: LineMatchStatus; invoiceStatus: string } | null = null;
  const byPoLine = new Map(s.lines.map((l) => [l.poLineId, l.id] as const));

  const gw: MatchGateway = {
    async loadInvoiceLines() { return s.lines.map((l) => ({ ...l })); },
    async loadPoLine(poLineId) { return s.poLines[poLineId] ?? null; },
    async loadReceivedQty(poLineId) {
      const lineId = poLineId ? byPoLine.get(poLineId) : undefined;
      return lineId ? (s.received[lineId] ?? 0) : 0;
    },
    async saveLineMatch(lineId, status, flags) { lineSaves[lineId] = { status, flags }; },
    async saveInvoiceMatch(_id, matchStatus, invoiceStatus) { invoiceSave = { matchStatus, invoiceStatus }; },
  };
  return { gw, lineSaves, get invoiceSave() { return invoiceSave; } };
}

describe('matching service', () => {
  beforeEach(() => { process.env.KAKO_PURCHASING = '1'; });
  afterEach(() => { delete process.env.KAKO_PURCHASING; });

  it('no-op when KAKO_PURCHASING is off', async () => {
    delete process.env.KAKO_PURCHASING;
    const f = makeGateway({ lines: [], poLines: {}, received: {} });
    expect(await matchInvoice(f.gw, 'inv1')).toEqual({ applied: false, reason: 'disabled' });
  });

  it('reports no_lines for an empty invoice', async () => {
    const f = makeGateway({ lines: [], poLines: {}, received: {} });
    expect(await matchInvoice(f.gw, 'inv1')).toEqual({ applied: false, reason: 'no_lines' });
  });

  it('marks invoice matched when every line reconciles (PO = GRN = invoice)', async () => {
    const f = makeGateway({
      lines: [{ id: 'L1', invoicedQty: 100, invoiceUnitPrice: 10, poLineId: 'PO1', grLineId: 'GR1' }],
      poLines: { PO1: { orderedQty: 100, unitPrice: 10 } },
      received: { L1: 100 },
    });
    const r = await matchInvoice(f.gw, 'inv1');
    expect(r).toMatchObject({ applied: true, matchStatus: 'matched', invoiceStatus: 'matched' });
    expect(f.lineSaves.L1).toEqual({ status: 'matched', flags: [] });
    expect(f.invoiceSave).toEqual({ matchStatus: 'matched', invoiceStatus: 'matched' });
  });

  it('HOLDS the invoice when any line is over-billed (billed > received)', async () => {
    const f = makeGateway({
      lines: [
        { id: 'L1', invoicedQty: 100, invoiceUnitPrice: 10, poLineId: 'PO1', grLineId: 'GR1' },
        { id: 'L2', invoicedQty: 50, invoiceUnitPrice: 5, poLineId: 'PO2', grLineId: 'GR2' },
      ],
      poLines: { PO1: { orderedQty: 100, unitPrice: 10 }, PO2: { orderedQty: 50, unitPrice: 5 } },
      received: { L1: 90, L2: 50 }, // L1 over-billed
    });
    const r = await matchInvoice(f.gw, 'inv1');
    expect(r).toMatchObject({ matchStatus: 'variance', invoiceStatus: 'on_hold' });
    expect(f.lineSaves.L1).toMatchObject({ status: 'variance', flags: expect.arrayContaining(['over_billed']) });
    expect(f.lineSaves.L2.status).toBe('matched');
    expect(f.invoiceSave).toEqual({ matchStatus: 'variance', invoiceStatus: 'on_hold' });
  });

  it('HOLDS on a price variance beyond tolerance', async () => {
    const f = makeGateway({
      lines: [{ id: 'L1', invoicedQty: 10, invoiceUnitPrice: 12, poLineId: 'PO1', grLineId: 'GR1' }],
      poLines: { PO1: { orderedQty: 10, unitPrice: 10 } },
      received: { L1: 10 },
    });
    const r = await matchInvoice(f.gw, 'inv1');
    expect(r.invoiceStatus).toBe('on_hold');
    expect(f.lineSaves.L1.flags).toContain('price_variance');
  });

  it('respects a supplied price tolerance', async () => {
    const f = makeGateway({
      lines: [{ id: 'L1', invoicedQty: 10, invoiceUnitPrice: 10.4, poLineId: 'PO1', grLineId: 'GR1' }],
      poLines: { PO1: { orderedQty: 10, unitPrice: 10 } },
      received: { L1: 10 },
    });
    const r = await matchInvoice(f.gw, 'inv1', { pricePct: 5 });
    expect(r.invoiceStatus).toBe('matched');
  });

  it('still blocks over-billing on a line with no PO link (received defaults to 0)', async () => {
    const f = makeGateway({
      lines: [{ id: 'L1', invoicedQty: 10, invoiceUnitPrice: 10, poLineId: null, grLineId: null }],
      poLines: {},
      received: {},
    });
    const r = await matchInvoice(f.gw, 'inv1');
    expect(r.invoiceStatus).toBe('on_hold');
    expect(f.lineSaves.L1.flags).toContain('over_billed'); // billed 10, received 0
  });
});
