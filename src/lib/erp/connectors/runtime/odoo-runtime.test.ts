import { describe, it, expect, vi } from 'vitest';
import { pullOdoo, pushOdoo, odooModel } from './odoo-runtime';

type FetchResponse = { ok: boolean; status: number; json: () => Promise<unknown>; text: () => Promise<string> };
function mockResponse(body: unknown, ok = true, status = 200): FetchResponse {
  return { ok, status, json: async () => body, text: async () => JSON.stringify(body) };
}
interface RpcBody { params: { service: string; method: string; args: unknown[] } }

const CFG = { baseUrl: 'https://acme.odoo.com', database: 'acme', username: 'admin' };

describe('Odoo runtime (B5)', () => {
  it('odooModel maps VANTORA entities to Odoo models (partner shared)', () => {
    expect(odooModel('customer')).toBe('res.partner');
    expect(odooModel('supplier')).toBe('res.partner');
    expect(odooModel('product')).toBe('product.template');
    expect(odooModel('order')).toBe('sale.order');
    expect(odooModel('invoice')).toBe('account.move');
    expect(odooModel('unknown')).toBeUndefined();
  });

  it('authenticates, builds the search_read envelope, applies field map + cursor', async () => {
    let searchArgs: unknown[] | null = null;
    const fetchImpl = vi.fn(async (_url: string, init?: { body?: string }) => {
      const body = JSON.parse(init!.body!) as RpcBody;
      const { service, method, args } = body.params;
      if (service === 'common' && method === 'authenticate') return mockResponse({ result: 7 });
      if (service === 'object' && method === 'execute_kw') {
        searchArgs = args;
        return mockResponse({ result: [{ id: 100, name: 'Acme', write_date: '2024-02-01 10:00:00' }] });
      }
      return mockResponse({ result: false });
    });

    const res = await pullOdoo({
      cfg: CFG, model: 'res.partner', secret: 'key',
      cursor: '2024-01-01 00:00:00', domain: [['customer_rank', '>', 0]],
      fields: ['id', 'name'], fieldMap: { id: 'external_id', name: 'name' }, fetchImpl,
    });

    expect(res.records).toEqual([{ external_id: 100, name: 'Acme' }]);
    expect(res.cursorAfter).toBe('2024-02-01 10:00:00');
    // envelope: object.execute_kw(db, uid, key, model, 'search_read', [domain], kwargs)
    const a = searchArgs!;
    expect(a[0]).toBe('acme'); expect(a[1]).toBe(7); expect(a[2]).toBe('key');
    expect(a[3]).toBe('res.partner'); expect(a[4]).toBe('search_read');
    const domain = (a[5] as unknown[][])[0] as unknown[];
    expect(domain).toContainEqual(['customer_rank', '>', 0]);
    expect(domain).toContainEqual(['write_date', '>', '2024-01-01 00:00:00']);
    // cursor field auto-added to fields so the watermark can advance
    expect((a[6] as { fields: string[] }).fields).toContain('write_date');
  });

  it('pages with limit/offset until a short page', async () => {
    let calls = 0;
    const fetchImpl = vi.fn(async (_url: string, init?: { body?: string }) => {
      const body = JSON.parse(init!.body!) as RpcBody;
      if (body.params.service === 'common') return mockResponse({ result: 1 });
      calls++;
      // first page full (2), second page short (1) → stop
      const full = Array.from({ length: 2 }, (_, i) => ({ id: calls * 10 + i, write_date: `2024-0${calls}-01 00:00:00` }));
      return mockResponse({ result: calls === 1 ? full : [{ id: 99, write_date: '2024-03-01 00:00:00' }] });
    });
    const res = await pullOdoo({ cfg: CFG, model: 'product.template', secret: 'k', limit: 2, fetchImpl });
    expect(calls).toBe(2);
    expect(res.records).toHaveLength(3);
  });

  it('throws on an Odoo JSON-RPC error envelope', async () => {
    const fetchImpl = vi.fn(async () => mockResponse({ error: { data: { message: 'Access Denied' } } }));
    await expect(pullOdoo({ cfg: CFG, model: 'res.partner', secret: 'bad', fetchImpl })).rejects.toThrow('Access Denied');
  });

  it('pushes via create and counts sent/failed', async () => {
    const fetchImpl = vi.fn(async (_url: string, init?: { body?: string }) => {
      const body = JSON.parse(init!.body!) as RpcBody;
      if (body.params.service === 'common') return mockResponse({ result: 5 });
      const vals = (body.params.args[5] as unknown[])[0] as Record<string, unknown>;
      // simulate: rows with a ref create OK (new id), rows without fail (result false)
      return mockResponse({ result: vals.ref ? 42 : false });
    });
    const res = await pushOdoo({
      cfg: CFG, model: 'account.move', secret: 'k',
      records: [{ external_id: 'INV-1' }, { external_id: 'INV-2' }],
      fieldMap: { external_id: 'ref' }, fetchImpl,
    });
    expect(res.sent).toBe(2);
    expect(res.failed).toBe(0);
  });
});
