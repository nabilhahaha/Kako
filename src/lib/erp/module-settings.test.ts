import { describe, it, expect } from 'vitest';
import {
  MODULE_SETTINGS, MODULE_LABELS, MODULE_ORDER, findSetting, coerceSettingValue,
  type ModuleSettingDef,
} from './module-settings-catalog';

describe('module-settings catalog integrity', () => {
  it('every setting has a label/help in both languages', () => {
    for (const s of MODULE_SETTINGS) {
      expect(s.label.en.trim(), s.key).toBeTruthy();
      expect(s.label.ar.trim(), s.key).toBeTruthy();
      expect(s.help.en.trim(), s.key).toBeTruthy();
      expect(s.help.ar.trim(), s.key).toBeTruthy();
    }
  });

  it('keys are unique within each module', () => {
    const seen = new Set<string>();
    for (const s of MODULE_SETTINGS) {
      const id = `${s.module}.${s.key}`;
      expect(seen.has(id), `duplicate ${id}`).toBe(false);
      seen.add(id);
    }
  });

  it('every setting belongs to a known, ordered module', () => {
    for (const s of MODULE_SETTINGS) {
      expect(MODULE_ORDER).toContain(s.module);
      expect(MODULE_LABELS[s.module]).toBeDefined();
    }
  });

  it('defaults match the declared type; enums declare options', () => {
    for (const s of MODULE_SETTINGS) {
      if (s.type === 'boolean') expect(typeof s.default, s.key).toBe('boolean');
      if (s.type === 'number') expect(typeof s.default, s.key).toBe('number');
      if (s.type === 'enum') {
        expect(Array.isArray(s.options), s.key).toBe(true);
        expect(s.options).toContain(s.default);
      }
    }
  });

  it('Phase 1 is documentation-only — nothing is enforced yet', () => {
    expect(MODULE_SETTINGS.every((s) => s.enforced === false)).toBe(true);
  });

  it('findSetting locates by module + key', () => {
    expect(findSetting('pos', 'require_shift_open')?.type).toBe('boolean');
    expect(findSetting('pos', 'nope')).toBeUndefined();
  });
});

describe('coerceSettingValue', () => {
  const bool = MODULE_SETTINGS.find((s) => s.type === 'boolean') as ModuleSettingDef;
  const numeric = MODULE_SETTINGS.find((s) => s.type === 'number') as ModuleSettingDef;

  it('keeps well-typed values', () => {
    expect(coerceSettingValue(bool, true)).toBe(true);
    expect(coerceSettingValue(numeric, 42)).toBe(42);
  });

  it('falls back to the default for malformed values', () => {
    expect(coerceSettingValue(bool, 'yes')).toBe(bool.default);
    expect(coerceSettingValue(numeric, 'NaN')).toBe(numeric.default);
    expect(coerceSettingValue(numeric, Infinity)).toBe(numeric.default);
  });
});
