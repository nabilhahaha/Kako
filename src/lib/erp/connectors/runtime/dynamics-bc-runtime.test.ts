import { describe, it, expect } from 'vitest';
import { fetchClientCredentialsToken } from './oauth2';
import { bcBaseUrl, bcEntitySet, pullDynamicsBc, pushDynamicsBc, type BcConfig } from './dynamics-bc-runtime';

const cfg: BcConfig = { tenantId: 'T', clientId: 'C', environment: 'production', companyId: 'GUID' };

/** Mock fetch that returns queued responses and records the calls. */
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

describe('oauth2 — client credentials', () => {
  it('posts form body and returns the access token', async () => {
    const { f, calls } = mockFetch([{ ok: true, status: 200, body: { access_token: 'tok', expires_in: 3599 } }]);
    const res = await fetchClientCredentialsToken({ tokenUrl: 'https://login/t/token', clientId: 'c', clientSecret: 's', scope: 'scope/.default', fetchImpl: f });
    expect(res.accessToken).toBe('tok');
    expect(res.expiresIn).toBe(3599);
    expect(calls[0].init?.method).toBe('POST');
    expect(calls[0].init?.body).toContain('grant_type=client_credentials');
    expect(calls[0].init?.body).toContain('client_id=c');
  });
  it('throws on non-2xx and on missing token', async () => {
    const e1 = mockFetch([{ ok: false, status: 401, body: {} }]);
    await expect(fetchClientCredentialsToken({ tokenUrl: 'u', clientId: 'c', clientSecret: 's', scope: 'x', fetchImpl: e1.f })).rejects.toThrow(/HTTP 401/);
    const e2 = mockFetch([{ ok: true, status: 200, body: {} }]);
    await expect(fetchClientCredentialsToken({ tokenUrl: 'u', clientId: 'c', clientSecret: 's', scope: 'x', fetchImpl: e2.f })).rejects.toThrow(/missing access_token/);
  });
});

describe('dynamics-bc — base url + entity sets', () => {
  it('builds the BC company OData base url', () => {
    expect(bcBaseUrl(cfg)).toBe('https://api.businesscentral.dynamics.com/v2.0/T/production/api/v2.0/companies(GUID)');
  });
  it('maps the first entity set (customer/product/supplier) then orders/invoices', () => {
    expect(bcEntitySet('customer')).toBe('customers');
    expect(bcEntitySet('supplier')).toBe('vendors');
    expect(bcEntitySet('product')).toBe('items');
    expect(bcEntitySet('order')).toBe('salesOrders');
    expect(bcEntitySet('invoice')).toBe('salesInvoices');
    expect(bcEntitySet('unknown')).toBeUndefined();
  });
});

describe('dynamics-bc — pull', () => {
  it('gets a token, builds delta $filter + auth, maps records, computes cursor', async () => {
    const { f, calls } = mockFetch([
      { ok: true, status: 200, body: { access_token: 'tok', expires_in: 3599 } },
      { ok: true, status: 200, body: { value: [
        { displayName: 'Acme', number: 'C1', lastModifiedDateTime: '2026-01-02T00:00:00Z' },
        { displayName: 'Globex', number: 'C2', lastModifiedDateTime: '2026-01-05T00:00:00Z' },
      ] } },
    ]);
    const res = await pullDynamicsBc({
      cfg, entitySet: 'customers', clientSecret: 's', cursor: '2026-01-01T00:00:00Z',
      fieldMap: { displayName: 'name', number: 'external_id', lastModifiedDateTime: 'lastModifiedDateTime' }, fetchImpl: f,
    });
    expect(res.records).toHaveLength(2);
    expect(res.records[0]).toMatchObject({ name: 'Acme', external_id: 'C1' });
    expect(res.cursorAfter).toBe('2026-01-05T00:00:00Z');
    // 2nd call = the OData GET with auth + filter
    expect(calls[1].url).toContain('/companies(GUID)/customers?');
    expect(calls[1].url).toContain('$filter='); // OData $filter (value URL-encoded)
    expect(calls[1].url).toContain('gt%20'); // encoded "gt "
    expect(calls[1].init?.headers?.Authorization).toBe('Bearer tok');
  });
  it('throws a clear error on 429 throttling', async () => {
    const { f } = mockFetch([
      { ok: true, status: 200, body: { access_token: 'tok' } },
      { ok: false, status: 429, body: {} },
    ]);
    await expect(pullDynamicsBc({ cfg, entitySet: 'items', clientSecret: 's', fetchImpl: f })).rejects.toThrow(/429/);
  });
});

describe('dynamics-bc — push', () => {
  it('posts each record with the bearer token and counts results', async () => {
    const { f, calls } = mockFetch([
      { ok: true, status: 200, body: { access_token: 'tok' } },
      { ok: true, status: 201, body: {} },
      { ok: false, status: 400, body: {} },
    ]);
    const res = await pushDynamicsBc({ cfg, entitySet: 'salesOrders', clientSecret: 's', records: [{ a: 1 }, { a: 2 }], fetchImpl: f });
    expect(res).toEqual({ sent: 1, failed: 1 });
    expect(calls[1].url).toContain('/companies(GUID)/salesOrders');
    expect(calls[1].init?.headers?.Authorization).toBe('Bearer tok');
  });
});
