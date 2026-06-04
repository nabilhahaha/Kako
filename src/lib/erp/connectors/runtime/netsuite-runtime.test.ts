import { describe, it, expect, vi } from 'vitest';
import {
  pullNetSuite, pushNetSuite, netsuiteRecordType, netsuiteBaseUrl, splitNetsuiteSecret,
} from './netsuite-runtime';

type FetchResponse = { ok: boolean; status: number; json: () => Promise<unknown>; text: () => Promise<string> };
function res(body: unknown, ok = true, status = 200): FetchResponse {
  return { ok, status, json: async () => body, text: async () => JSON.stringify(body) };
}

const CFG = { accountId: '123456_SB1', consumerKey: 'ck', tokenId: 'tok' };

describe('netsuite runtime (B4)', () => {
  it('maps VANTORA entities to NetSuite record types', () => {
    expect(netsuiteRecordType('customer')).toBe('customer');
    expect(netsuiteRecordType('supplier')).toBe('vendor');
    expect(netsuiteRecordType('product')).toBe('inventoryItem');
    expect(netsuiteRecordType('order')).toBe('salesOrder');
    expect(netsuiteRecordType('invoice')).toBe('invoice');
    expect(netsuiteRecordType('unknown')).toBeUndefined();
  });

  it('builds the account-specific base URL (underscore → hyphen, lowercased)', () => {
    expect(netsuiteBaseUrl('123456_SB1')).toBe('https://123456-sb1.suitetalk.api.netsuite.com/services/rest');
  });

  it('splits the packed Vault secret into consumer + token secrets', () => {
    expect(splitNetsuiteSecret('cs:ts')).toEqual({ consumerSecret: 'cs', tokenSecret: 'ts' });
    expect(splitNetsuiteSecret('only')).toEqual({ consumerSecret: 'only', tokenSecret: '' });
    expect(splitNetsuiteSecret(null)).toEqual({ consumerSecret: '', tokenSecret: '' });
  });

  it('pulls with a signed Authorization header, delta query, and watermark', async () => {
    let calledUrl = ''; let authHeader = '';
    const fetchImpl = vi.fn(async (url: string, init?: { headers?: Record<string, string> }) => {
      calledUrl = url; authHeader = init?.headers?.Authorization ?? '';
      return res({ items: [
        { id: '1', companyName: 'Acme', lastModifiedDate: '2024-02-01T00:00:00Z' },
        { id: '2', companyName: 'Globex', lastModifiedDate: '2024-02-05T00:00:00Z' },
      ], hasMore: false });
    });
    const out = await pullNetSuite({
      cfg: CFG, recordType: 'customer', secret: 'cs:ts', cursor: '2024-01-01T00:00:00Z',
      fieldMap: { id: 'external_id', companyName: 'name' }, fetchImpl, nonce: 'n', timestamp: '1700000000',
    });
    expect(out.records).toEqual([
      { external_id: '1', name: 'Acme' }, { external_id: '2', name: 'Globex' },
    ]);
    expect(out.cursorAfter).toBe('2024-02-05T00:00:00Z');
    expect(calledUrl).toContain('/record/v1/customer?');
    expect(calledUrl).toContain('limit=100');
    expect(calledUrl).toContain(encodeURIComponent('lastModifiedDate AFTER "2024-01-01T00:00:00Z"'));
    expect(authHeader.startsWith('OAuth ')).toBe(true);
    expect(authHeader).toContain('oauth_signature=');
  });

  it('pages via limit/offset while hasMore', async () => {
    let calls = 0;
    const fetchImpl = vi.fn(async () => {
      calls++;
      if (calls === 1) return res({ items: Array.from({ length: 100 }, (_, i) => ({ id: i, lastModifiedDate: 'x' })), hasMore: true });
      return res({ items: [{ id: 999, lastModifiedDate: 'y' }], hasMore: false });
    });
    const out = await pullNetSuite({ cfg: CFG, recordType: 'inventoryItem', secret: 'cs:ts', limit: 100, fetchImpl });
    expect(calls).toBe(2);
    expect(out.records).toHaveLength(101);
  });

  it('throws clearly on 429 throttling', async () => {
    const fetchImpl = vi.fn(async () => res({}, false, 429));
    await expect(pullNetSuite({ cfg: CFG, recordType: 'customer', secret: 'cs:ts', fetchImpl })).rejects.toThrow(/429/);
  });

  it('pushes each record signed and counts sent/failed', async () => {
    const fetchImpl = vi.fn(async (_url: string, init?: { body?: string }) => {
      const body = JSON.parse(init!.body!) as Record<string, unknown>;
      return res({}, !!body.externalId, body.externalId ? 204 : 400);
    });
    const out = await pushNetSuite({
      cfg: CFG, recordType: 'salesOrder', secret: 'cs:ts',
      records: [{ external_id: 'SO-1' }, { external_id: 'SO-2' }],
      fieldMap: { external_id: 'externalId' }, fetchImpl,
    });
    expect(out).toEqual({ sent: 2, failed: 0 });
  });
});
