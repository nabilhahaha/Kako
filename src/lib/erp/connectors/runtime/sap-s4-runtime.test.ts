import { describe, it, expect } from 'vitest';
import { pullSapS4, pushSapS4, sapEntityPath, sapAuthHeaders, type SapConfig } from './sap-s4-runtime';

function mockFetch(responses: { ok: boolean; status: number; body: unknown }[]) {
  const calls: { url: string; init?: { method?: string; headers?: Record<string, string>; body?: string } }[] = [];
  let i = 0;
  const f = async (url: string, init?: { method?: string; headers?: Record<string, string>; body?: string }) => {
    calls.push({ url, init });
    const r = responses[Math.min(i++, responses.length - 1)];
    return { ok: r.ok, status: r.status, json: async () => r.body, text: async () => JSON.stringify(r.body) };
  };
  return { f, calls };
}

const basicCfg: SapConfig = { baseUrl: 'https://s4.example.com/sap/opu/odata/sap', auth: 'basic', username: 'COMM_USER', odataVersion: 'v2' };

describe('sap-s4 — entity paths + auth', () => {
  it('maps the first entity set to SAP OData service paths', () => {
    expect(sapEntityPath('customer')).toBe('API_BUSINESS_PARTNER/A_BusinessPartner');
    expect(sapEntityPath('product')).toBe('API_PRODUCT_SRV/A_Product');
    expect(sapEntityPath('order')).toBe('API_SALES_ORDER_SRV/A_SalesOrder');
    expect(sapEntityPath('invoice')).toBe('API_BILLING_DOCUMENT_SRV/A_BillingDocument');
    expect(sapEntityPath('unknown')).toBeUndefined();
  });
  it('builds a Basic auth header from username + secret', async () => {
    const h = await sapAuthHeaders(basicCfg, 'pw');
    expect(h.Authorization).toBe(`Basic ${Buffer.from('COMM_USER:pw').toString('base64')}`);
  });
  it('builds a Bearer header via OAuth2 when configured', async () => {
    const { f } = mockFetch([{ ok: true, status: 200, body: { access_token: 'tok' } }]);
    const h = await sapAuthHeaders({ baseUrl: 'x', auth: 'oauth2', tokenUrl: 'https://btp/token', clientId: 'c', scope: 's' }, 'sec', f);
    expect(h.Authorization).toBe('Bearer tok');
  });
});

describe('sap-s4 — pull (OData v2)', () => {
  it('parses d.results, maps fields, sends Basic auth + $filter delta', async () => {
    const { f, calls } = mockFetch([{ ok: true, status: 200, body: { d: { results: [
      { BusinessPartnerName: 'Acme', BusinessPartner: 'BP1', LastChangeDateTime: '2026-01-02' },
      { BusinessPartnerName: 'Globex', BusinessPartner: 'BP2', LastChangeDateTime: '2026-01-06' },
    ] } } }]);
    const res = await pullSapS4({
      cfg: basicCfg, path: 'API_BUSINESS_PARTNER/A_BusinessPartner', secret: 'pw',
      cursor: '2026-01-01', cursorField: 'LastChangeDateTime',
      fieldMap: { BusinessPartnerName: 'name', BusinessPartner: 'external_id', LastChangeDateTime: 'LastChangeDateTime' }, fetchImpl: f,
    });
    expect(res.records).toHaveLength(2);
    expect(res.records[0]).toMatchObject({ name: 'Acme', external_id: 'BP1' });
    expect(res.cursorAfter).toBe('2026-01-06');
    expect(calls[0].url).toContain('/sap/opu/odata/sap/API_BUSINESS_PARTNER/A_BusinessPartner?');
    expect(calls[0].url).toContain('$filter=');
    expect(calls[0].init?.headers?.Authorization).toMatch(/^Basic /);
  });
  it('throws on 429 throttling', async () => {
    const { f } = mockFetch([{ ok: false, status: 429, body: {} }]);
    await expect(pullSapS4({ cfg: basicCfg, path: 'API_PRODUCT_SRV/A_Product', secret: 'pw', fetchImpl: f })).rejects.toThrow(/429/);
  });
});

describe('sap-s4 — push', () => {
  it('posts each record to the collection with auth and counts results', async () => {
    const { f, calls } = mockFetch([
      { ok: true, status: 201, body: {} },
      { ok: false, status: 400, body: {} },
    ]);
    const res = await pushSapS4({ cfg: basicCfg, path: 'API_SALES_ORDER_SRV/A_SalesOrder', secret: 'pw', records: [{ a: 1 }, { a: 2 }], fetchImpl: f });
    expect(res).toEqual({ sent: 1, failed: 1 });
    expect(calls[0].url).toContain('/API_SALES_ORDER_SRV/A_SalesOrder');
    expect(calls[0].init?.method).toBe('POST');
    expect(calls[0].init?.headers?.Authorization).toMatch(/^Basic /);
  });
});
