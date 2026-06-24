import { describe, it, expect } from 'vitest';
import { buildFormSummaries, isReservedFormCode, formName, type FormRow, type FormVersionRow } from './forms-library';

const form = (p: Partial<FormRow> & { id: string; code: string }): FormRow => ({
  id: p.id, code: p.code, name_en: p.name_en ?? 'EN', name_ar: p.name_ar ?? 'AR',
  is_active: p.is_active ?? true, created_at: p.created_at ?? '2026-01-01T00:00:00Z',
});

describe('isReservedFormCode', () => {
  it('reserves fv_verification and customer_data_update', () => {
    expect(isReservedFormCode('fv_verification')).toBe(true);
    expect(isReservedFormCode('customer_data_update')).toBe(true);
    expect(isReservedFormCode('form_abcd1234')).toBe(false);
  });
});

describe('buildFormSummaries', () => {
  it('excludes reserved-code forms', () => {
    const forms = [form({ id: 'f1', code: 'fv_verification' }), form({ id: 'f2', code: 'form_x' })];
    const out = buildFormSummaries(forms, []);
    expect(out.map((s) => s.id)).toEqual(['f2']);
  });

  it('computes latest version + published flag', () => {
    const forms = [form({ id: 'f1', code: 'form_x' })];
    const versions: FormVersionRow[] = [
      { form_id: 'f1', version: 1, status: 'archived' },
      { form_id: 'f1', version: 2, status: 'published' },
    ];
    const [s] = buildFormSummaries(forms, versions);
    expect(s.latestVersion).toBe(2);
    expect(s.latestStatus).toBe('published');
    expect(s.hasPublished).toBe(true);
    expect(s.draftPending).toBe(false);
  });

  it('flags draftPending when a draft sits on top of a published version', () => {
    const forms = [form({ id: 'f1', code: 'form_x' })];
    const versions: FormVersionRow[] = [
      { form_id: 'f1', version: 1, status: 'published' },
      { form_id: 'f1', version: 2, status: 'draft' },
    ];
    const [s] = buildFormSummaries(forms, versions);
    expect(s.draftPending).toBe(true);
    expect(s.hasPublished).toBe(true);
    expect(s.latestStatus).toBe('draft');
  });

  it('handles a form with no versions', () => {
    const [s] = buildFormSummaries([form({ id: 'f1', code: 'form_x' })], []);
    expect(s.latestVersion).toBe(0);
    expect(s.latestStatus).toBeNull();
    expect(s.hasPublished).toBe(false);
  });

  it('orders newest form first', () => {
    const forms = [
      form({ id: 'old', code: 'form_a', created_at: '2026-01-01T00:00:00Z' }),
      form({ id: 'new', code: 'form_b', created_at: '2026-03-01T00:00:00Z' }),
    ];
    expect(buildFormSummaries(forms, []).map((s) => s.id)).toEqual(['new', 'old']);
  });
});

describe('formName', () => {
  it('falls back across locale then code', () => {
    expect(formName({ nameEn: 'Visit', nameAr: 'زيارة', code: 'form_x' }, 'ar')).toBe('زيارة');
    expect(formName({ nameEn: 'Visit', nameAr: '', code: 'form_x' }, 'ar')).toBe('Visit');
    expect(formName({ nameEn: '', nameAr: '', code: 'form_x' }, 'en')).toBe('form_x');
  });
});
