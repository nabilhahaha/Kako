import { describe, it, expect } from 'vitest';
import {
  FEATURES, FEATURES_BY_KEY, FEATURE_TEMPLATES, templateFeatureKeys, defaultEnabled,
  type FeatureTemplate,
} from './feature-catalog';
import { DICTIONARIES } from '../i18n/dictionaries';

function resolve(locale: 'ar' | 'en', key: string): unknown {
  return key.split('.').reduce<unknown>(
    (acc, part) => (acc && typeof acc === 'object' ? (acc as Record<string, unknown>)[part] : undefined),
    DICTIONARIES[locale],
  );
}

describe('feature catalog', () => {
  it('has unique keys', () => {
    const keys = FEATURES.map((f) => f.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(Object.keys(FEATURES_BY_KEY).length).toBe(keys.length);
  });

  it('labels & descriptions resolve in ar and en', () => {
    for (const f of FEATURES) {
      expect(resolve('ar', f.labelKey), `ar ${f.labelKey}`).toBeTypeOf('string');
      expect(resolve('en', f.labelKey), `en ${f.labelKey}`).toBeTypeOf('string');
      expect(resolve('ar', f.descKey), `ar ${f.descKey}`).toBeTypeOf('string');
      expect(resolve('en', f.descKey), `en ${f.descKey}`).toBeTypeOf('string');
    }
  });

  // UI Coverage Audit target: every feature must declare where it manifests, so
  // the audit can verify an enabled feature is actually visible/usable.
  it('every feature declares coverage (nav / screen / validation / logic)', () => {
    for (const f of FEATURES) {
      const c = f.coverage;
      const total = (c.nav?.length ?? 0) + (c.screens?.length ?? 0) + (c.validation?.length ?? 0) + (c.logic?.length ?? 0);
      expect(total, `coverage for ${f.key}`).toBeGreaterThan(0);
    }
  });

  it('templates are monotonic: lite ⊆ standard ⊆ enterprise', () => {
    const lite = new Set(templateFeatureKeys('lite'));
    const std = new Set(templateFeatureKeys('standard'));
    const ent = new Set(templateFeatureKeys('enterprise'));
    for (const k of lite) expect(std.has(k), `${k} in standard`).toBe(true);
    for (const k of std) expect(ent.has(k), `${k} in enterprise`).toBe(true);
    expect(ent.size).toBeGreaterThanOrEqual(std.size);
    expect(std.size).toBeGreaterThanOrEqual(lite.size);
  });

  it('default (unconfigured) equals the Lite preset', () => {
    const lite = new Set(templateFeatureKeys('lite'));
    for (const f of FEATURES) expect(defaultEnabled(f.key)).toBe(lite.has(f.key));
  });

  it('every template is a valid preset name', () => {
    for (const f of FEATURES) {
      for (const tmpl of f.templates) {
        expect(FEATURE_TEMPLATES).toContain(tmpl as FeatureTemplate);
      }
    }
  });
});
