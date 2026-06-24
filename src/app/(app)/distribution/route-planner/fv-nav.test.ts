import { describe, it, expect } from 'vitest';
import { canNavigate } from './fv-nav';
import { buildNavUrl } from './fv-map-helpers';

describe('fv-nav', () => {
  it('canNavigate: only for valid coordinates', () => {
    expect(canNavigate(24.7, 46.7)).toBe(true);
    expect(canNavigate(null, 46.7)).toBe(false);
    expect(canNavigate(24.7, undefined)).toBe(false);
    expect(canNavigate(0, 0)).toBe(false);
    expect(canNavigate(NaN, 1)).toBe(false);
  });

  it('Navigate uses the Google Maps directions URL only (no Apple Maps)', () => {
    const url = buildNavUrl(24.7, 46.7, 'google');
    expect(url).toBe('https://www.google.com/maps/dir/?api=1&destination=24.7,46.7');
    expect(url.toLowerCase()).not.toContain('apple');
  });
});
