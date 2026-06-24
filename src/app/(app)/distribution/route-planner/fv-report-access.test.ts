import { describe, it, expect } from 'vitest';
import { canViewFvReports, verificationPhotoIds } from './fv-report-access';

describe('fv-report-access', () => {
  it('canViewFvReports: admin / super / platform always allowed', () => {
    expect(canViewFvReports({ isPlatformOwner: true, permissions: [] })).toBe(true);
    expect(canViewFvReports({ isSuperAdmin: true, permissions: [] })).toBe(true);
    expect(canViewFvReports({ topRole: 'admin', permissions: [] })).toBe(true);
  });

  it('canViewFvReports: supervisor / viewer with field_verification.reports allowed', () => {
    expect(canViewFvReports({ topRole: 'supervisor', permissions: ['field_verification.reports'] })).toBe(true);
    expect(canViewFvReports({ topRole: 'viewer', permissions: ['field_verification.view', 'field_verification.reports'] })).toBe(true);
    expect(canViewFvReports({ topRole: 'viewer', permissions: ['reports.view'] })).toBe(true);
  });

  it('canViewFvReports: a plain rep (verify only) is NOT a report viewer → keeps own-rows only', () => {
    expect(canViewFvReports({ topRole: 'salesman', permissions: ['field_verification.view', 'field_verification.verify'] })).toBe(false);
  });

  it('verificationPhotoIds: outside + inside, drops blanks/nulls', () => {
    expect(verificationPhotoIds({ outsidePhotoId: 'o1', insidePhotoIds: ['i1', 'i2'] })).toEqual(['o1', 'i1', 'i2']);
    expect(verificationPhotoIds({ outsidePhotoId: null, insidePhotoIds: ['i1'] })).toEqual(['i1']);
    expect(verificationPhotoIds({ outsidePhotoId: 'o1', insidePhotoIds: [] })).toEqual(['o1']);
    expect(verificationPhotoIds({ outsidePhotoId: null, insidePhotoIds: null })).toEqual([]);
    expect(verificationPhotoIds({ outsidePhotoId: '', insidePhotoIds: ['', 'i2'] })).toEqual(['i2']);
  });
});
