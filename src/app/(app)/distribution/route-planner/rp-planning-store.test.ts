import { describe, it, expect, beforeEach, vi } from 'vitest';

// ============================================================================
// Wave A — client persistence orchestration tests (segments + templates).
// We mock the server-action module and a localStorage polyfill, and assert the
// server-first → cache-mirror → offline-fallback → one-time-migration behaviour
// that keeps the Planner working whether or not the server is reachable.
// ============================================================================

// In-memory localStorage polyfill (node env has none).
class MemStorage {
  private m = new Map<string, string>();
  getItem(k: string) { return this.m.has(k) ? this.m.get(k)! : null; }
  setItem(k: string, v: string) { this.m.set(k, v); }
  removeItem(k: string) { this.m.delete(k); }
  clear() { this.m.clear(); }
}

// Mutable server state the mocked actions read/write, so tests can simulate the DB.
const server = {
  segments: [] as { id: string; name: string; filter: Record<string, string>; createdAt: number }[],
  templates: [] as { id: string; name: string; headers: string[]; fingerprint: string; mapping: Record<string, string>; createdAt: number }[],
  fail: false,
  throwOn: new Set<string>(),
};

vi.mock('./rp-planning-actions', () => {
  const ok = <T,>(data: T) => (server.fail ? { ok: false as const, error: 'err' } : { ok: true as const, data });
  return {
    listSegments: vi.fn(async () => ok([...server.segments])),
    migrateLocalSegments: vi.fn(async (items: { name: string; filter: Record<string, string> }[]) => {
      for (const it of items) if (!server.segments.some((s) => s.name.toLowerCase() === it.name.toLowerCase()))
        server.segments.unshift({ id: `srv-${it.name}`, name: it.name, filter: it.filter, createdAt: Date.now() });
      return ok([...server.segments]);
    }),
    saveSegment: vi.fn(async (name: string, filter: Record<string, string>) => {
      if (server.throwOn.has('saveSegment')) throw new Error('network');
      server.segments = server.segments.filter((s) => s.name.toLowerCase() !== name.toLowerCase());
      server.segments.unshift({ id: `srv-${name}`, name, filter, createdAt: Date.now() });
      return ok([...server.segments]);
    }),
    deleteSegment: vi.fn(async (id: string) => { server.segments = server.segments.filter((s) => s.id !== id); return ok([...server.segments]); }),
    listMappingTemplates: vi.fn(async () => ok([...server.templates])),
    migrateLocalTemplates: vi.fn(async (items: { name: string; headers: string[]; fingerprint: string; mapping: Record<string, string> }[]) => {
      for (const it of items) if (!server.templates.some((t) => t.name.toLowerCase() === it.name.toLowerCase()))
        server.templates.unshift({ id: `srv-${it.name}`, ...it, createdAt: Date.now() });
      return ok([...server.templates]);
    }),
    saveMappingTemplate: vi.fn(async (name: string, headers: string[], fingerprint: string, mapping: Record<string, string>) => {
      if (server.throwOn.has('saveMappingTemplate')) throw new Error('network');
      server.templates = server.templates.filter((t) => t.name.toLowerCase() !== name.toLowerCase());
      server.templates.unshift({ id: `srv-${name}`, name, headers, fingerprint, mapping, createdAt: Date.now() });
      return ok([...server.templates]);
    }),
    deleteMappingTemplate: vi.fn(async (id: string) => { server.templates = server.templates.filter((t) => t.id !== id); return ok([...server.templates]); }),
  };
});

beforeEach(() => {
  (globalThis as unknown as { localStorage: MemStorage }).localStorage = new MemStorage();
  server.segments = []; server.templates = []; server.fail = false; server.throwOn.clear();
  vi.clearAllMocks();
  vi.resetModules();
});

describe('Wave A — Saved Segments store', () => {
  it('migrates local-only segments to the server on first sync, then mirrors the cache', async () => {
    localStorage.setItem('vantora-rp-segments', JSON.stringify([{ id: 'loc1', name: 'Jeddah VIP', filter: { city: 'Jeddah' }, createdAt: 1 }]));
    const mod = await import('./route-planner-segments');
    const list = await mod.syncSegments();
    expect(list.map((s) => s.name)).toContain('Jeddah VIP');
    expect(server.segments.some((s) => s.name === 'Jeddah VIP')).toBe(true);      // pushed up
    expect(mod.loadSegments().some((s) => s.name === 'Jeddah VIP')).toBe(true);   // cache mirrored
  });

  it('second sync lists from the server (does not re-migrate)', async () => {
    const actions = await import('./rp-planning-actions');
    const mod = await import('./route-planner-segments');
    await mod.syncSegments();
    await mod.syncSegments();
    expect((actions.migrateLocalSegments as ReturnType<typeof vi.fn>)).toHaveBeenCalledTimes(1);
    expect((actions.listSegments as ReturnType<typeof vi.fn>)).toHaveBeenCalledTimes(1);
  });

  it('falls back to the localStorage cache when the server errors', async () => {
    localStorage.setItem('vantora-rp-segments', JSON.stringify([{ id: 'loc1', name: 'Cached', filter: {}, createdAt: 1 }]));
    server.fail = true;
    const mod = await import('./route-planner-segments');
    const list = await mod.syncSegments();
    expect(list.map((s) => s.name)).toEqual(['Cached']);
  });

  it('persistSegment saves server-first and caches the result', async () => {
    const mod = await import('./route-planner-segments');
    const list = await mod.persistSegment('Riyadh A', { class: 'A' });
    expect(list.some((s) => s.name === 'Riyadh A')).toBe(true);
    expect(server.segments.some((s) => s.name === 'Riyadh A')).toBe(true);
  });

  it('persistSegment falls back to a local save when the action throws', async () => {
    server.throwOn.add('saveSegment');
    const mod = await import('./route-planner-segments');
    const list = await mod.persistSegment('Offline Seg', { area: 'X' });
    expect(list.some((s) => s.name === 'Offline Seg')).toBe(true);   // saved locally
    expect(server.segments.length).toBe(0);                          // never reached server
  });

  it('removeSegment deletes via the server and updates the cache', async () => {
    const mod = await import('./route-planner-segments');
    await mod.persistSegment('Temp', {});
    const id = mod.loadSegments()[0].id;
    const list = await mod.removeSegment(id);
    expect(list.some((s) => s.id === id)).toBe(false);
  });
});

describe('Wave A — Mapping/Route Templates store', () => {
  it('migrates local-only templates up on first sync', async () => {
    localStorage.setItem('vantora-day-planner-templates', JSON.stringify([
      { id: 'loc1', name: 'Roshen Format', headers: ['Code', 'Name'], fingerprint: 'code|name', mapping: { code: 'Code' }, createdAt: 1 },
    ]));
    const mod = await import('./day-planner-templates');
    const list = await mod.syncDpTemplates();
    expect(list.some((t) => t.name === 'Roshen Format')).toBe(true);
    expect(server.templates.some((t) => t.name === 'Roshen Format')).toBe(true);
  });

  it('persistDpTemplate computes a fingerprint and saves server-first', async () => {
    const mod = await import('./day-planner-templates');
    const list = await mod.persistDpTemplate('Fmt', ['Customer', 'Lat', 'Lng'], { code: 'Customer', lat: 'Lat', lng: 'Lng' });
    const saved = list.find((t) => t.name === 'Fmt');
    expect(saved).toBeTruthy();
    expect(saved!.fingerprint.length).toBeGreaterThan(0);
    expect(server.templates.some((t) => t.name === 'Fmt')).toBe(true);
  });

  it('findBestTemplate matches the cached fingerprint after a sync', async () => {
    const mod = await import('./day-planner-templates');
    await mod.persistDpTemplate('Exact', ['Code', 'Name', 'Lat', 'Lng'], { code: 'Code' });
    const hit = mod.findBestTemplate(['Code', 'Name', 'Lat', 'Lng']);
    expect(hit?.name).toBe('Exact');
  });

  it('persistDpTemplate falls back to a local save when the action throws', async () => {
    server.throwOn.add('saveMappingTemplate');
    const mod = await import('./day-planner-templates');
    const list = await mod.persistDpTemplate('Offline Fmt', ['A'], { code: 'A' });
    expect(list.some((t) => t.name === 'Offline Fmt')).toBe(true);
    expect(server.templates.length).toBe(0);
  });
});
