import { describe, it, expect } from 'vitest';
import { resolveFvForm, FV_CORE_FIELDS, type FvFieldOverride } from './fv-verification-form';

const keys = (rows: ReturnType<typeof resolveFvForm>) => rows.map((r) => r.key);

describe('resolveFvForm — defaults (no config = current behavior)', () => {
  it('returns all 6 core fields in canonical order, all visible', () => {
    const r = resolveFvForm(null);
    expect(keys(r)).toEqual(['city', 'channel', 'outside_photo', 'inside_photos', 'phone', 'notes']);
    expect(r.every((f) => f.visible)).toBe(true);
  });
  it('core-required fields default to required; optional fields default optional', () => {
    const r = resolveFvForm([]);
    const req = Object.fromEntries(r.map((f) => [f.key, f.required]));
    expect(req.city).toBe(true);
    expect(req.channel).toBe(true);
    expect(req.outside_photo).toBe(true);
    expect(req.phone).toBe(false);
    expect(req.notes).toBe(false);
    expect(req.inside_photos).toBe(false);
  });
});

describe('resolveFvForm — guardrails (config can never weaken core validation)', () => {
  it('a core-required field cannot be hidden or made optional', () => {
    const overrides: FvFieldOverride[] = [
      { key: 'city', visible: false, required: false },
      { key: 'outside_photo', visible: false, required: false },
    ];
    const r = resolveFvForm(overrides);
    const city = r.find((f) => f.key === 'city')!;
    const photo = r.find((f) => f.key === 'outside_photo')!;
    expect(city.visible).toBe(true); expect(city.required).toBe(true); expect(city.toggleable).toBe(false);
    expect(photo.visible).toBe(true); expect(photo.required).toBe(true);
  });
  it('a hidden optional field is never required', () => {
    const r = resolveFvForm([{ key: 'phone', visible: false, required: true }]);
    const phone = r.find((f) => f.key === 'phone')!;
    expect(phone.visible).toBe(false);
    expect(phone.required).toBe(false);
  });
});

describe('resolveFvForm — admin overrides (label / order / visible / required)', () => {
  it('optional field can be hidden', () => {
    const r = resolveFvForm([{ key: 'notes', visible: false }]);
    expect(r.find((f) => f.key === 'notes')!.visible).toBe(false);
  });
  it('optional field can be made required', () => {
    const r = resolveFvForm([{ key: 'phone', required: true }]);
    expect(r.find((f) => f.key === 'phone')!.required).toBe(true);
  });
  it('custom AR/EN labels + help are surfaced; blank → null (use default)', () => {
    const r = resolveFvForm([{ key: 'phone', labelEn: 'Mobile', labelAr: 'الجوال', help: ' call first ' }]);
    const phone = r.find((f) => f.key === 'phone')!;
    expect(phone.labelEn).toBe('Mobile');
    expect(phone.labelAr).toBe('الجوال');
    expect(phone.help).toBe('call first');
    expect(resolveFvForm([{ key: 'phone', labelEn: '   ' }]).find((f) => f.key === 'phone')!.labelEn).toBeNull();
  });
  it('explicit order reorders fields; unset falls back to canonical index', () => {
    const r = resolveFvForm([{ key: 'notes', order: 0 }, { key: 'city', order: 1 }]);
    expect(keys(r)[0]).toBe('notes');
  });
  it('unknown field keys are ignored (no throw)', () => {
    // @ts-expect-error — deliberately invalid key
    expect(() => resolveFvForm([{ key: 'bogus', visible: false }])).not.toThrow();
    expect(keys(resolveFvForm([{ key: 'bogus' } as unknown as FvFieldOverride]))).toHaveLength(FV_CORE_FIELDS.length);
  });
});
