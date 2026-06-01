import { describe, it, expect, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { captureScore, captureKindFor, CAPTURE_KINDS } from './field-capture';

describe('field-capture · captureScore', () => {
  it('reads a numeric score field, else null', () => {
    expect(captureScore({ score: '4' })).toBe(4);
    expect(captureScore({ score: 0 })).toBe(0);
    expect(captureScore({})).toBeNull();
    expect(captureScore({ score: '' })).toBeNull();
    expect(captureScore({ score: 'abc' })).toBeNull();
    expect(captureScore({ pts: '9' }, 'pts')).toBe(9);
  });
});

describe('field-capture · captureKindFor', () => {
  it('maps seeded form keys to kinds and defaults to quick', () => {
    expect(captureKindFor('fe_merchandising_audit')).toBe('merchandising');
    expect(captureKindFor('fe_competitor_capture')).toBe('competitor');
    expect(captureKindFor('fe_out_of_stock')).toBe('out_of_stock');
    expect(captureKindFor('fe_opportunity')).toBe('opportunity');
    expect(captureKindFor('fe_store_checklist')).toBe('survey');
    expect(captureKindFor('something_else')).toBe('quick');
    expect(CAPTURE_KINDS).toContain('merchandising');
  });
});
