import { describe, it, expect } from 'vitest';
import { hostFromUrl, isEgressAllowed, type EgressRule } from './egress';

describe('hostFromUrl', () => {
  it('extracts lowercase host; empty on invalid', () => {
    expect(hostFromUrl('https://API.Partner.com/hook')).toBe('api.partner.com');
    expect(hostFromUrl('not a url')).toBe('');
  });
});

describe('isEgressAllowed', () => {
  const rules: EgressRule[] = [
    { domain: 'api.partner.com', connectorKey: null },
    { domain: '.trusted.io', connectorKey: 'trusted_rest' },
    { domain: 'inactive.com', connectorKey: null, isActive: false },
  ];

  it('denies an unknown host', () => {
    expect(isEgressAllowed('evil.com', null, rules)).toBe(false);
  });
  it('allows an exact approved domain (any connector)', () => {
    expect(isEgressAllowed('api.partner.com', null, rules)).toBe(true);
    expect(isEgressAllowed('api.partner.com', 'whatever', rules)).toBe(true);
  });
  it('allows a suffix domain only with the approved connector', () => {
    expect(isEgressAllowed('hooks.trusted.io', 'trusted_rest', rules)).toBe(true);
    expect(isEgressAllowed('trusted.io', 'trusted_rest', rules)).toBe(true);
    expect(isEgressAllowed('hooks.trusted.io', 'other_connector', rules)).toBe(false); // wrong connector
    expect(isEgressAllowed('hooks.trusted.io', null, rules)).toBe(false);
  });
  it('ignores inactive rules', () => {
    expect(isEgressAllowed('inactive.com', null, rules)).toBe(false);
  });
  it('does not match a look-alike host', () => {
    expect(isEgressAllowed('api.partner.com.evil.com', null, rules)).toBe(false);
    expect(isEgressAllowed('nottrusted.io', 'trusted_rest', rules)).toBe(false);
  });
});
