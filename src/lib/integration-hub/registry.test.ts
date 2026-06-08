import { describe, it, expect } from 'vitest';
import { ConnectorRegistry, type ConnectorDescriptor } from './registry';

const c = (id: string, o: Partial<ConnectorDescriptor>): ConnectorDescriptor => ({
  id, name: id, category: 'erp', authKind: 'oauth2', direction: 'bidirectional',
  entities: ['customer', 'product'], version: '1.0.0', ...o,
});

describe('connector registry', () => {
  it('registers + resolves connectors by id', () => {
    const r = new ConnectorRegistry();
    r.register(c('sap_b1', { category: 'erp', tier: 1 }));
    r.register(c('quickbooks', { category: 'accounting', tier: 3 }));
    expect(r.get('sap_b1')!.category).toBe('erp');
    expect(r.get('nope')).toBeUndefined();
    expect(r.list()).toHaveLength(2);
  });

  it('filters by category', () => {
    const r = new ConnectorRegistry();
    r.register(c('sap_b1', { category: 'erp' }));
    r.register(c('shopify', { category: 'commerce' }));
    r.register(c('odoo', { category: 'erp' }));
    expect(r.byCategory('erp').map((x) => x.id).sort()).toEqual(['odoo', 'sap_b1']);
    expect(r.byCategory('commerce').map((x) => x.id)).toEqual(['shopify']);
  });

  it('finds connectors supporting a mappable entity (Mapping Studio)', () => {
    const r = new ConnectorRegistry();
    r.register(c('sap_b1', { entities: ['customer', 'product', 'invoice'] }));
    r.register(c('sheets', { category: 'data', entities: ['customer'] }));
    expect(r.supporting('invoice').map((x) => x.id)).toEqual(['sap_b1']);
    expect(r.supporting('customer').map((x) => x.id).sort()).toEqual(['sap_b1', 'sheets']);
  });
});
