import { describe, it, expect, afterEach } from 'vitest';
import path from 'node:path';
import os from 'node:os';
import { isOffline, offlineOS, offlineHome, offlinePaths, offlinePorts, offlineGatewayUrl } from './runtime';

describe('offline runtime', () => {
  const prev = { ...process.env };
  afterEach(() => { process.env = { ...prev }; });

  it('isOffline reflects KAKO_OFFLINE (and is false by default → cloud unaffected)', () => {
    delete process.env.KAKO_OFFLINE;
    expect(isOffline()).toBe(false);
    process.env.KAKO_OFFLINE = '1';
    expect(isOffline()).toBe(true);
    process.env.KAKO_OFFLINE = 'true';
    expect(isOffline()).toBe(true);
    process.env.KAKO_OFFLINE = '0';
    expect(isOffline()).toBe(false);
  });

  it('offlineOS normalizes the platform', () => {
    expect(offlineOS('darwin')).toBe('macos');
    expect(offlineOS('win32')).toBe('windows');
    expect(offlineOS('linux')).toBe('linux');
  });

  it('per-OS home: macOS Application Support, Windows PROGRAMDATA, Linux XDG', () => {
    const home = os.homedir();
    expect(offlineHome('Kako', 'darwin', {})).toBe(path.join(home, 'Library', 'Application Support', 'Kako'));
    expect(offlineHome('Kako', 'win32', { PROGRAMDATA: 'C:\\ProgramData' })).toBe(path.join('C:\\ProgramData', 'Kako'));
    expect(offlineHome('Kako', 'linux', { XDG_DATA_HOME: '/xdg' })).toBe(path.join('/xdg', 'Kako'));
  });

  it('KAKO_OFFLINE_HOME overrides the per-OS home (test/CI/portable)', () => {
    expect(offlineHome('Kako', 'darwin', { KAKO_OFFLINE_HOME: '/tmp/store' })).toBe(path.resolve('/tmp/store'));
  });

  it('offlinePaths lays out db/backups/run/license/secrets under the home', () => {
    const p = offlinePaths('Kako', 'linux', { KAKO_OFFLINE_HOME: '/tmp/store' });
    expect(p.dataDir).toBe(path.join('/tmp/store', 'db'));
    expect(p.backupsDir).toBe(path.join('/tmp/store', 'backups'));
    expect(p.licenseFile).toBe(path.join('/tmp/store', 'license.json'));
  });

  it('offlinePorts defaults avoid 5432 and honor env overrides', () => {
    const d = offlinePorts({});
    expect(d.pg).toBe(54329);
    expect(d.pg).not.toBe(5432);
    expect(offlinePorts({ KAKO_OFFLINE_PG_PORT: '6000' }).pg).toBe(6000);
  });

  it('offlineGatewayUrl points at the local app port (or explicit override)', () => {
    expect(offlineGatewayUrl({ KAKO_OFFLINE_APP_PORT: '7777' })).toBe('http://127.0.0.1:7777');
    expect(offlineGatewayUrl({ KAKO_OFFLINE_URL: 'http://localhost:9000' })).toBe('http://localhost:9000');
  });
});
