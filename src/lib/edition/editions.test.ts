import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { EDITIONS, currentEdition, resolveEdition, isEditionId, DEFAULT_EDITION_ID, type EditionId } from './editions';

describe('edition descriptors', () => {
  const ids: EditionId[] = ['retail', 'pharmacy', 'restaurant', 'fmcg'];

  it('every edition maps onto an existing business_type gate', () => {
    const allowed = new Set(['clothing', 'pharmacy', 'restaurant', 'general']);
    for (const id of ids) {
      expect(allowed.has(EDITIONS[id].businessType), `${id}`).toBe(true);
    }
  });

  it('every edition is a VANTORA brand with a unique productCode + bundleId', () => {
    const codes = new Set<string>();
    const bundles = new Set<string>();
    for (const id of ids) {
      const e = EDITIONS[id];
      expect(e.brand.startsWith('VANTORA ')).toBe(true);
      expect(e.id).toBe(id);
      codes.add(e.productCode);
      bundles.add(e.assets.bundleId);
    }
    expect(codes.size).toBe(ids.length);
    expect(bundles.size).toBe(ids.length);
  });

  it('isEditionId / resolveEdition fall back to the default for unknowns', () => {
    expect(isEditionId('retail')).toBe(true);
    expect(isEditionId('nope')).toBe(false);
    expect(resolveEdition(undefined).id).toBe(DEFAULT_EDITION_ID);
    expect(resolveEdition('totally-unknown').id).toBe(DEFAULT_EDITION_ID);
    expect(resolveEdition('pharmacy').id).toBe('pharmacy');
  });

  describe('currentEdition() reads KAKO_EDITION', () => {
    const prev = process.env.KAKO_EDITION;
    afterEach(() => { if (prev === undefined) delete process.env.KAKO_EDITION; else process.env.KAKO_EDITION = prev; });
    it('defaults to retail and resolves a set value', () => {
      delete process.env.KAKO_EDITION;
      expect(currentEdition().id).toBe('retail');
      process.env.KAKO_EDITION = 'fmcg';
      expect(currentEdition().id).toBe('fmcg');
    });
  });

  // No-core-fork rule: the per-EDITION brand names + product codes must live
  // ONLY in the descriptor. ("VANTORA" alone is the existing house brand and is
  // allowed anywhere.) If an edition-specific literal leaks into the core,
  // adding/branding an edition would require a code change — exactly what the
  // abstraction forbids.
  it('per-edition brand names + product codes appear only in the edition descriptor', () => {
    const root = path.resolve(__dirname, '..', '..'); // src/
    // Build the forbidden-outside-descriptor token list straight from the
    // descriptor so it can never drift.
    const tokens = ids.flatMap((id) => [EDITIONS[id].brand, EDITIONS[id].productCode, EDITIONS[id].assets.bundleId]);
    const offenders: string[] = [];
    // The descriptor itself, and the i18n translation catalogs (data, where
    // product/brand names legitimately appear — the invariant targets CODE, not
    // translation strings).
    const allow = [path.join('lib', 'edition'), path.join('lib', 'i18n', 'messages')];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const full = path.join(dir, name);
        const st = statSync(full);
        if (st.isDirectory()) { walk(full); continue; }
        if (!/\.(ts|tsx)$/.test(name)) continue;
        if (allow.some((a) => full.includes(a))) continue;
        const body = readFileSync(full, 'utf8');
        for (const tok of tokens) {
          if (body.includes(tok)) { offenders.push(`${path.relative(root, full)} :: ${tok}`); break; }
        }
      }
    };
    walk(root);
    expect(offenders, `edition-specific literals outside the descriptor:\n${offenders.join('\n')}`).toEqual([]);
  });
});
