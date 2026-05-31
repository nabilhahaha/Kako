import { describe, it, expect } from 'vitest';
import {
  listConnectorAdapters, getConnectorAdapter, isKnownAdapter, validateConnection,
} from './registry';

describe('connector framework — registry (Phase 2C-1)', () => {
  it('ships the reference adapters + vendor adapters (Dynamics BC, SAP S/4HANA)', () => {
    expect(listConnectorAdapters().map((a) => a.key).sort()).toEqual(['csv_sftp', 'dynamics_bc', 'generic_rest', 'sap_s4']);
  });
  it('resolves known vs unknown adapters', () => {
    expect(isKnownAdapter('generic_rest')).toBe(true);
    expect(isKnownAdapter('csv_sftp')).toBe(true);
    expect(isKnownAdapter('dynamics_bc')).toBe(true);
    expect(isKnownAdapter('sap_s4')).toBe(true);
    expect(isKnownAdapter('oracle')).toBe(false);
  });
  it('every adapter has ar/en labels, a kind, directions, and config fields', () => {
    for (const a of listConnectorAdapters()) {
      expect(a.labelEn.length).toBeGreaterThan(0);
      expect(a.labelAr.length).toBeGreaterThan(0);
      expect(['rest', 'odata', 'file']).toContain(a.kind);
      expect(a.directions.length).toBeGreaterThan(0);
      expect(a.configFields.length).toBeGreaterThan(0);
    }
  });
});

describe('connector framework — generic_rest validation', () => {
  const a = getConnectorAdapter('generic_rest')!;
  it('requires an https base_url', () => {
    expect(a.validateConfig({})).toBeTruthy();
    expect(a.validateConfig({ base_url: 'http://x.com' })).toBe('Base URL must be https');
    expect(a.validateConfig({ base_url: 'https://api.example.com/v1' })).toBeNull();
  });
  it('exposes a secret field for the API token', () => {
    expect(a.secretField?.key).toBe('token');
    expect(a.secretField?.secret).toBe(true);
  });
});

describe('connector framework — csv_sftp validation', () => {
  const a = getConnectorAdapter('csv_sftp')!;
  it('requires host, username, remote_path, format', () => {
    expect(a.validateConfig({})).toBeTruthy();
    expect(a.validateConfig({ host: 'h', username: 'u', remote_path: '/p', format: 'csv' })).toBeNull();
  });
  it('rejects a bad format and non-numeric port', () => {
    expect(a.validateConfig({ host: 'h', username: 'u', remote_path: '/p', format: 'xml' })).toBe('Unsupported file format');
    expect(a.validateConfig({ host: 'h', username: 'u', remote_path: '/p', format: 'csv', port: 'abc' })).toBe('Port must be a number');
  });
});

describe('connector framework — sap_s4 transport validation (B3a odata + B3b file)', () => {
  const a = getConnectorAdapter('sap_s4')!;
  it('defaults to OData when transport unset (B3a back-compat): requires base_url + auth', () => {
    expect(a.validateConfig({})).toBeTruthy(); // missing base_url
    expect(a.validateConfig({ base_url: 'https://h/sap/opu/odata/sap', auth_kind: 'basic', username: 'u' })).toBeNull();
  });
  it('OData OAuth2 needs token_url + client_id', () => {
    expect(a.validateConfig({ transport: 'odata', base_url: 'https://h', auth_kind: 'oauth2' })).toBe('Token URL is required for OAuth2');
    expect(a.validateConfig({ transport: 'odata', base_url: 'https://h', auth_kind: 'oauth2', token_url: 'https://t', client_id: 'c' })).toBeNull();
  });
  it('file transport requires host, username, remote_path (not base_url/auth)', () => {
    expect(a.validateConfig({ transport: 'file' })).toBeTruthy();
    expect(a.validateConfig({ transport: 'file', host: 'sftp.x', username: 'u', remote_path: '/out/customers.csv' })).toBeNull();
  });
  it('file transport rejects a bad format and non-numeric port', () => {
    expect(a.validateConfig({ transport: 'file', host: 'h', username: 'u', remote_path: '/p', format: 'xml' })).toBe('Unsupported file format');
    expect(a.validateConfig({ transport: 'file', host: 'h', username: 'u', remote_path: '/p', port: 'abc' })).toBe('Port must be a number');
  });
  it('rejects an unknown transport', () => {
    expect(a.validateConfig({ transport: 'rfc' })).toBe('Transport must be odata or file');
  });
});

describe('connector framework — validateConnection', () => {
  it('rejects unknown adapters and delegates to the adapter otherwise', () => {
    expect(validateConnection('nope', {})).toBe('Unknown adapter');
    expect(validateConnection('generic_rest', { base_url: 'https://x.io' })).toBeNull();
  });
});
