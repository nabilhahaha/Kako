import { describe, it, expect } from 'vitest';
import { tabToSection, SECTION_ORDER } from './company-360-section';

// Regression guard: tabToSection must live in a non-'use client' module so the
// server page can call it (mapping ?tab= → section) without the RSC error
// "Attempted to call tabToSection() from the server but it is on the client."
describe('company-360-section · tabToSection', () => {
  it('maps legacy ?tab= values to anchor sections', () => {
    expect(tabToSection('overview')).toBe('summary');
    expect(tabToSection('permissions')).toBe('roles');
    expect(tabToSection('roles')).toBe('roles');
    expect(tabToSection('subscription')).toBe('subscription');
    expect(tabToSection('integrations')).toBe('integrations');
    expect(tabToSection('audit')).toBe('audit');
  });
  it('falls back to summary for unknown / undefined tabs', () => {
    expect(tabToSection(undefined)).toBe('summary');
    expect(tabToSection('nope')).toBe('summary');
  });
  it('every mapped section is a known section in SECTION_ORDER', () => {
    for (const tab of ['overview', 'subscription', 'users', 'roles', 'permissions', 'modules', 'packs', 'integrations', 'audit', undefined]) {
      expect(SECTION_ORDER).toContain(tabToSection(tab));
    }
  });
});
