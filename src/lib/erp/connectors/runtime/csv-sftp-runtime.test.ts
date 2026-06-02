import { describe, it, expect } from 'vitest';
import { pullCsvSftp, pushCsvSftp, type SftpClientLike } from './csv-sftp-runtime';

function mockSftp(getBody?: string) {
  const calls: { connectCfg?: Record<string, unknown>; putBody?: string; putPath?: string; ended: boolean } = { ended: false };
  const client: SftpClientLike = {
    async connect(cfg) { calls.connectCfg = cfg; return undefined; },
    async get() { return Buffer.from(getBody ?? '', 'utf8'); },
    async put(input, remotePath) {
      calls.putBody = Buffer.isBuffer(input) ? input.toString('utf8') : String(input);
      calls.putPath = remotePath; return undefined;
    },
    async end() { calls.ended = true; return undefined; },
  };
  return { client, calls };
}

describe('csv-sftp runtime — pull', () => {
  it('downloads + parses CSV into mapped records', async () => {
    const { client, calls } = mockSftp('Name,Ext\nAcme,a1\nGlobex,a2\n');
    const res = await pullCsvSftp({
      auth: { host: 'sftp.example.com', username: 'u', secret: 'pw' },
      remotePath: '/in/customers.csv', format: 'csv',
      fieldMap: { Name: 'name', Ext: 'external_id' },
      clientFactory: async () => client,
    });
    expect(res.records).toEqual([
      { name: 'Acme', external_id: 'a1' },
      { name: 'Globex', external_id: 'a2' },
    ]);
    expect(calls.connectCfg).toMatchObject({ host: 'sftp.example.com', port: 22, username: 'u', password: 'pw' });
    expect(calls.ended).toBe(true);
  });

  it('parses JSON files', async () => {
    const { client } = mockSftp(JSON.stringify([{ name: 'X', external_id: 'x1' }]));
    const res = await pullCsvSftp({
      auth: { host: 'h', username: 'u', secret: 'pw' },
      remotePath: '/in/p.json', format: 'json', clientFactory: async () => client,
    });
    expect(res.records).toEqual([{ name: 'X', external_id: 'x1' }]);
  });

  it('uses privateKey auth when isPrivateKey is set', async () => {
    const { client, calls } = mockSftp('a\n1\n');
    await pullCsvSftp({
      auth: { host: 'h', username: 'u', secret: '-----BEGIN PRIVATE KEY-----xx', isPrivateKey: true },
      remotePath: '/f.csv', format: 'csv', clientFactory: async () => client,
    });
    expect(calls.connectCfg).toHaveProperty('privateKey');
    expect(calls.connectCfg).not.toHaveProperty('password');
  });
});

describe('csv-sftp runtime — push', () => {
  it('serializes records to CSV and uploads to the remote path', async () => {
    const { client, calls } = mockSftp();
    const res = await pushCsvSftp({
      auth: { host: 'h', username: 'u', secret: 'pw' },
      remotePath: '/out/customers.csv', format: 'csv',
      records: [{ name: 'A', code: 'C1' }, { name: 'B', code: 'C2' }],
      clientFactory: async () => client,
    });
    expect(res.sent).toBe(2);
    expect(calls.putPath).toBe('/out/customers.csv');
    expect(calls.putBody).toContain('A');
    expect(calls.putBody).toContain('C2');
    expect(calls.ended).toBe(true);
  });

  it('serializes to JSON when format is json', async () => {
    const { client, calls } = mockSftp();
    await pushCsvSftp({
      auth: { host: 'h', username: 'u', secret: 'pw' },
      remotePath: '/out/p.json', format: 'json',
      records: [{ name: 'A' }], clientFactory: async () => client,
    });
    expect(() => JSON.parse(calls.putBody ?? '')).not.toThrow();
  });
});
