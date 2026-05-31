import { describe, it, expect } from 'vitest';
import {
  INBOUND_ENTITIES, isInboundEntity, scopeFor, hasScope, isValidScope, offeredScopes,
  RATE_LIMIT_PER_WINDOW, RATE_WINDOW_MS,
} from './integration';

describe('integration — inbound entities (Phase 2A)', () => {
  it('exposes exactly customer, supplier, product', () => {
    expect(INBOUND_ENTITIES.slice().sort()).toEqual(['customer', 'product', 'supplier']);
  });
  it('recognises only the enabled entities', () => {
    expect(isInboundEntity('customer')).toBe(true);
    expect(isInboundEntity('invoice')).toBe(false);
    expect(isInboundEntity('order')).toBe(false);
  });
});

describe('integration — entity-based scopes', () => {
  it('builds {entity}:{action} scopes', () => {
    expect(scopeFor('customer', 'write')).toBe('customer:write');
    expect(scopeFor('product', 'read')).toBe('product:read');
  });
  it('checks the exact scope (no global wildcard)', () => {
    const scopes = ['customer:write', 'product:read'];
    expect(hasScope(scopes, 'customer', 'write')).toBe(true);
    expect(hasScope(scopes, 'customer', 'read')).toBe(false);
    expect(hasScope(scopes, 'product', 'write')).toBe(false);
    expect(hasScope(scopes, 'supplier', 'write')).toBe(false);
  });
  it('validates scope format, matching the DB-side regex', () => {
    expect(isValidScope('customer:write')).toBe(true);
    expect(isValidScope('supplier:read')).toBe(true);
    expect(isValidScope('customer:delete')).toBe(false);
    expect(isValidScope('read')).toBe(false);
    expect(isValidScope('Customer:write')).toBe(false);
    expect(isValidScope('customer:*')).toBe(false);
  });
  it('offers read+write for every enabled entity, all well-formed', () => {
    const offered = offeredScopes();
    expect(offered).toHaveLength(INBOUND_ENTITIES.length * 2);
    expect(offered.every(isValidScope)).toBe(true);
    expect(offered).toContain('customer:read');
    expect(offered).toContain('customer:write');
  });
});

describe('integration — rate limit constants', () => {
  it('are sane positive values', () => {
    expect(RATE_LIMIT_PER_WINDOW).toBeGreaterThan(0);
    expect(RATE_WINDOW_MS).toBe(60_000);
  });
});
