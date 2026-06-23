import { describe, it, expect } from 'vitest';
import { resolveFvForm, buildFvFormSchema, sanitizeFvOverride, FV_CORE_FIELDS, type FvFieldOverride } from './fv-verification-form';

const keys = (rows: ReturnType<typeof resolveFvForm>) => rows.map((r) => r.key);

describe('resolveFvForm — defaults (no config = today\'s behavior)', () => {
  it('returns all 6 fields in canonical order, all visible', () => {
    const r = resolveFvForm(null);
    expect(keys(r)).toEqual(['city', 'channel', 'outside_photo', 'inside_photos', 'phone', 'notes']);
    expect(r.every((f) => f.visible)).toBe(true);
  });
  it('FV-template safe defaults: city/channel/outside required; inside/phone/notes optional', () => {
    const req = Object.fromEntries(resolveFvForm([]).map((f) => [f.key, f.required]));
    expect(req.city).toBe(true);
    expect(req.channel).toBe(true);
    expect(req.outside_photo).toBe(true);
    expect(req.inside_photos).toBe(false);
    expect(req.phone).toBe(false);
    expect(req.notes).toBe(false);
  });
  it('warnOnRelax marks the core fields (city/channel/outside) but not the rest', () => {
    const warn = Object.fromEntries(resolveFvForm(null).map((f) => [f.key, f.warnOnRelax]));
    expect(warn.city).toBe(true); expect(warn.channel).toBe(true); expect(warn.outside_photo).toBe(true);
    expect(warn.phone).toBe(false); expect(warn.notes).toBe(false); expect(warn.inside_photos).toBe(false);
  });
});

describe('resolveFvForm — EVERY field is configurable (reusable module)', () => {
  it('a core field CAN be made optional (allowed) and is flagged relaxed', () => {
    const r = resolveFvForm([{ key: 'city', required: false }]);
    const city = r.find((f) => f.key === 'city')!;
    expect(city.visible).toBe(true);
    expect(city.required).toBe(false);   // not locked — admin override wins
    expect(city.relaxed).toBe(true);     // surfaced for the warning
  });
  it('a core field CAN be hidden (allowed) and is flagged relaxed', () => {
    const photo = resolveFvForm([{ key: 'outside_photo', visible: false }]).find((f) => f.key === 'outside_photo')!;
    expect(photo.visible).toBe(false);
    expect(photo.required).toBe(false);  // hidden ⇒ not required
    expect(photo.relaxed).toBe(true);
  });
  it('an optional field can be made required (and is not "relaxed")', () => {
    const phone = resolveFvForm([{ key: 'phone', required: true }]).find((f) => f.key === 'phone')!;
    expect(phone.required).toBe(true);
    expect(phone.relaxed).toBe(false);
  });
  it('a hidden field is never required (logical consistency, not a lock)', () => {
    const notes = resolveFvForm([{ key: 'notes', visible: false, required: true }]).find((f) => f.key === 'notes')!;
    expect(notes.visible).toBe(false);
    expect(notes.required).toBe(false);
  });
});

describe('resolveFvForm — labels / order / safety', () => {
  it('custom AR/EN labels + help surface; blank → null (use default)', () => {
    const phone = resolveFvForm([{ key: 'phone', labelEn: 'Mobile', labelAr: 'الجوال', help: ' call first ' }]).find((f) => f.key === 'phone')!;
    expect(phone.labelEn).toBe('Mobile');
    expect(phone.labelAr).toBe('الجوال');
    expect(phone.help).toBe('call first');
    expect(resolveFvForm([{ key: 'phone', labelEn: '   ' }]).find((f) => f.key === 'phone')!.labelEn).toBeNull();
  });
  it('explicit order reorders fields', () => {
    expect(keys(resolveFvForm([{ key: 'notes', order: 0 }, { key: 'city', order: 1 }]))[0]).toBe('notes');
  });
  it('unknown field keys are ignored (no throw)', () => {
    expect(keys(resolveFvForm([{ key: 'bogus' } as unknown as FvFieldOverride]))).toHaveLength(FV_CORE_FIELDS.length);
  });
});

describe('buildFvFormSchema / sanitizeFvOverride — persisted shape', () => {
  it('drops unknown keys, trims labels/help, coerces requireGps', () => {
    const schema = buildFvFormSchema(
      [
        { key: 'phone', labelEn: '  Mobile  ', labelAr: '', required: true, visible: true, order: 4 },
        { key: 'bogus' } as unknown as FvFieldOverride,
      ],
      true,
    );
    expect(schema.settings.requireGps).toBe(true);
    expect(schema.fields).toHaveLength(1);
    expect(schema.fields[0]).toMatchObject({ key: 'phone', labelEn: 'Mobile', labelAr: null, required: true, order: 4 });
  });
  it('sanitizeFvOverride returns null for an unknown key', () => {
    expect(sanitizeFvOverride({ key: 'nope' } as unknown as FvFieldOverride)).toBeNull();
  });
  it('round-trips through resolveFvForm (save → read gives the same effective config)', () => {
    const schema = buildFvFormSchema([{ key: 'notes', visible: false }, { key: 'phone', required: true }], false);
    const resolved = resolveFvForm(schema.fields);
    expect(resolved.find((f) => f.key === 'notes')!.visible).toBe(false);
    expect(resolved.find((f) => f.key === 'phone')!.required).toBe(true);
  });
});
