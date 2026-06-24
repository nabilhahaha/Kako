import { describe, it, expect } from 'vitest';
import { buildFormExportRows, buildCrossExportRows, type CommonHeaders, type ExportSubmission } from './form-export';
import { resolveFormSchema } from './form-schema';

const H: CommonHeaders = {
  formName: 'Form', version: 'Version', submissionId: 'ID', customerCode: 'Code', customerName: 'Customer',
  rep: 'Rep', datetime: 'Date', status: 'Status', gpsLat: 'Lat', gpsLng: 'Lng', photos: 'Photos',
};

const sub = (p: Partial<ExportSubmission> & { id: string }): ExportSubmission => ({
  id: p.id, version: p.version ?? 1, formName: p.formName, recordCode: p.recordCode ?? null,
  recordName: p.recordName ?? null, repName: p.repName ?? null, createdAt: p.createdAt ?? '2026-06-24T08:30:00.000Z',
  status: p.status ?? 'submitted', gpsLat: p.gpsLat ?? null, gpsLng: p.gpsLng ?? null,
  photoCount: p.photoCount ?? 0, answers: p.answers,
});

describe('buildFormExportRows', () => {
  it('common columns + dynamic report-field columns (respecting includeInReport)', () => {
    const schema = resolveFormSchema({ fields: [
      { id: 'note', type: 'text', labelEn: 'Note', includeInReport: true },
      { id: 'secret', type: 'text', labelEn: 'Secret', includeInReport: false },
      { id: 'chan', type: 'select', labelEn: 'Channel', includeInReport: true, options: [{ value: 'r', labelEn: 'Retail', labelAr: 'تجزئة' }] },
    ] });
    const t = buildFormExportRows(schema, [
      sub({ id: 's1', recordCode: 'C1', recordName: 'Acme', repName: 'Sam', answers: { note: 'hello', chan: 'r', secret: 'x' } }),
    ], { lang: 'en', common: H, formName: 'Visit', yes: 'Yes', no: 'No' });

    expect(t.columns).toEqual(['Form', 'Version', 'ID', 'Code', 'Customer', 'Rep', 'Date', 'Status', 'Lat', 'Lng', 'Photos', 'Note', 'Channel']);
    expect(t.rows[0]).toEqual(['Visit', 1, 's1', 'C1', 'Acme', 'Sam', '2026-06-24 08:30:00', 'submitted', '', '', 0, 'hello', 'Retail']);
  });

  it('uses per-submission formName when present', () => {
    const schema = resolveFormSchema({ fields: [] });
    const t = buildFormExportRows(schema, [sub({ id: 's', formName: 'Market Visit' })], { lang: 'en', common: H, formName: 'fallback', yes: 'Y', no: 'N' });
    expect(t.rows[0][0]).toBe('Market Visit');
  });
});

describe('buildCrossExportRows', () => {
  it('common columns only', () => {
    const t = buildCrossExportRows([
      sub({ id: 's1', formName: 'A', recordName: 'Cust', photoCount: 2, gpsLat: 24.7, gpsLng: 46.7 }),
    ], { common: H });
    expect(t.columns).toEqual(['Form', 'Version', 'ID', 'Code', 'Customer', 'Rep', 'Date', 'Status', 'Lat', 'Lng', 'Photos']);
    expect(t.rows[0]).toEqual(['A', 1, 's1', '', 'Cust', '', '2026-06-24 08:30:00', 'submitted', 24.7, 46.7, 2]);
  });
});
