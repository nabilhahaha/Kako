import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { applyCostedMovement, MissingUnitCostError } from './service';
import { InsufficientStockError } from './types';
import type { CostingGateway, CostStateRow, PersistedLayer } from './gateway';
import type { CostingMethod, AvgCostState } from './types';

// In-memory fake gateway (keeps the service unit-testable without a DB).
function makeFakeGateway(method: CostingMethod) {
  let state: CostStateRow | null = null;
  let layers: PersistedLayer[] = [];
  const movementCosts: Record<string, { unitCost: number; totalCost: number }> = {};
  let standardCost: number | null = null;
  let seq = 0;

  const gw: CostingGateway = {
    async loadState() { return state ? { ...state } : (method ? { method, qty: 0, avgCost: 0 } : null); },
    async saveState(_w, _p, m, s: AvgCostState) { state = { method: m, qty: s.qty, avgCost: s.avgCost }; },
    async loadLayers() { return layers.map((l) => ({ ...l })); },
    async insertLayer(_w, _p, qty, unitCost) { layers.push({ id: `L${++seq}`, qty, unitCost }); },
    async updateLayerRemaining(updates) {
      const byId = new Map(updates.map((u) => [u.id, u.remainingQty]));
      layers = layers
        .map((l) => (byId.has(l.id) ? { ...l, qty: byId.get(l.id)! } : l))
        .filter((l) => l.qty > 0);
    },
    async getStandardCost() { return standardCost; },
    async setMovementCost(movementId, unitCost, totalCost) { movementCosts[movementId] = { unitCost, totalCost }; },
  };
  return {
    gw,
    get state() { return state; },
    get layers() { return layers; },
    movementCosts,
    setStandard(c: number) { standardCost = c; },
  };
}

describe('costing service', () => {
  beforeEach(() => { process.env.KAKO_INVENTORY_COSTING = '1'; });
  afterEach(() => { delete process.env.KAKO_INVENTORY_COSTING; });

  const base = { warehouseId: 'w1', productId: 'p1' };

  it('is a no-op when the flag is off', async () => {
    delete process.env.KAKO_INVENTORY_COSTING;
    const f = makeFakeGateway('moving_average');
    const r = await applyCostedMovement(f.gw, { ...base, movementId: 'm1', quantity: 10, unitCost: 5 });
    expect(r).toEqual({ applied: false, reason: 'disabled' });
  });

  it('ignores zero-quantity movements', async () => {
    const f = makeFakeGateway('moving_average');
    const r = await applyCostedMovement(f.gw, { ...base, movementId: 'm1', quantity: 0 });
    expect(r).toEqual({ applied: false, reason: 'zero_qty' });
  });

  describe('moving average', () => {
    it('values receipts, recomputes average, then values an issue at average', async () => {
      const f = makeFakeGateway('moving_average');
      await applyCostedMovement(f.gw, { ...base, movementId: 'm1', quantity: 10, unitCost: 5 });
      await applyCostedMovement(f.gw, { ...base, movementId: 'm2', quantity: 10, unitCost: 7 });
      expect(f.state).toEqual({ method: 'moving_average', qty: 20, avgCost: 6 });

      const issue = await applyCostedMovement(f.gw, { ...base, movementId: 'm3', quantity: -5 });
      expect(issue).toMatchObject({ applied: true, totalCost: 30, unitCost: 6 });
      expect(f.state).toEqual({ method: 'moving_average', qty: 15, avgCost: 6 });
      expect(f.movementCosts.m3).toEqual({ unitCost: 6, totalCost: 30 });
    });

    it('throws rather than fabricate cost on an over-issue', async () => {
      const f = makeFakeGateway('moving_average');
      await applyCostedMovement(f.gw, { ...base, movementId: 'm1', quantity: 3, unitCost: 5 });
      await expect(applyCostedMovement(f.gw, { ...base, movementId: 'm2', quantity: -5 }))
        .rejects.toThrow(InsufficientStockError);
    });

    it('requires a unit cost on receipts', async () => {
      const f = makeFakeGateway('moving_average');
      await expect(applyCostedMovement(f.gw, { ...base, movementId: 'm1', quantity: 10 }))
        .rejects.toThrow(MissingUnitCostError);
    });
  });

  describe('FIFO', () => {
    it('appends layers on receipt and consumes oldest-first on issue', async () => {
      const f = makeFakeGateway('fifo');
      await applyCostedMovement(f.gw, { ...base, movementId: 'm1', quantity: 10, unitCost: 5 });
      await applyCostedMovement(f.gw, { ...base, movementId: 'm2', quantity: 10, unitCost: 7 });
      expect(f.layers).toHaveLength(2);

      const issue = await applyCostedMovement(f.gw, { ...base, movementId: 'm3', quantity: -15 }); // 10@5 + 5@7
      expect(issue).toMatchObject({ applied: true, totalCost: 85 });
      expect(f.layers).toEqual([{ id: 'L2', qty: 5, unitCost: 7 }]); // first layer drained, second partial
      expect(f.state).toMatchObject({ qty: 5 });
    });
  });

  describe('standard cost', () => {
    it('values at standard and reports purchase-price variance on receipt', async () => {
      const f = makeFakeGateway('standard');
      f.setStandard(5);
      const r = await applyCostedMovement(f.gw, { ...base, movementId: 'm1', quantity: 10, unitCost: 6, date: '2026-01-01' });
      expect(r).toMatchObject({ applied: true, totalCost: 50, priceVariance: 10, unitCost: 5 });
      expect(f.movementCosts.m1).toEqual({ unitCost: 5, totalCost: 50 });
    });

    it('values issues at standard', async () => {
      const f = makeFakeGateway('standard');
      f.setStandard(5);
      await applyCostedMovement(f.gw, { ...base, movementId: 'm1', quantity: 10, unitCost: 6 });
      const issue = await applyCostedMovement(f.gw, { ...base, movementId: 'm2', quantity: -4 });
      expect(issue).toMatchObject({ applied: true, totalCost: 20, unitCost: 5 });
    });
  });
});
