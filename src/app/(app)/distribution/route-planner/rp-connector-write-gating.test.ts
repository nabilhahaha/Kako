import { describe, it, expect } from 'vitest';
import { rpCanManageConnectors } from '@/lib/erp/route-planner-access';
import { sheetCsvUrl } from '@/lib/erp/route-planner-connectors';

/**
 * D3 — connector admin (no-secret) gating + public-URL restriction. Management is gated to
 * admin / route_planner_admin / manager; the only remote source allowed is a PUBLIC Google
 * Sheet (sheetCsvUrl restricts to docs.google.com → no arbitrary SSRF, no token). The
 * actions never write config.token; api_erp / secret connectors are rejected.
 */
describe('D3 connector-manage gating', () => {
  it('admin / route_planner_admin / manager → may manage', () => {
    expect(rpCanManageConnectors(null, true)).toBe(true);
    expect(rpCanManageConnectors('route_planner_admin', false)).toBe(true);
    expect(rpCanManageConnectors('manager', false)).toBe(true);
  });
  it('supervisor / field_user / no role → denied', () => {
    expect(rpCanManageConnectors('supervisor', false)).toBe(false);
    expect(rpCanManageConnectors('field_user', false)).toBe(false);
    expect(rpCanManageConnectors(null, false)).toBe(false);
  });
});

describe('D3 public-sheet URL restriction (no SSRF, no secrets)', () => {
  it('accepts a Google Sheets URL and produces a public CSV export URL', () => {
    const csv = sheetCsvUrl('https://docs.google.com/spreadsheets/d/ABC123/edit#gid=0');
    expect(csv).toContain('docs.google.com/spreadsheets/d/ABC123/export');
    expect(csv).toContain('format=csv');
  });
  it('rejects non-Google / arbitrary URLs (blocks SSRF to other hosts)', () => {
    expect(sheetCsvUrl('https://evil.example.com/x.csv')).toBeNull();
    expect(sheetCsvUrl('http://169.254.169.254/latest/meta-data')).toBeNull();
    expect(sheetCsvUrl('')).toBeNull();
  });
});
