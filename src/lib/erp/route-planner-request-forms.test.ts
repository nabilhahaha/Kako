import { describe, it, expect } from 'vitest';
import { REQUEST_FORMS, validateRequest, buildDetails, primaryGps, fieldFilled } from './route-planner-request-forms';
import { RP_TICKET_TYPES } from './route-planner-backend';

describe('REQUEST_FORMS', () => {
  it('has a form for every ticket type, each with at least one required field', () => {
    for (const ty of RP_TICKET_TYPES) {
      const form = REQUEST_FORMS[ty];
      expect(form, ty).toBeDefined();
      expect(form.fields.some((f) => f.required), ty).toBe(true);
    }
  });
  it('new_customer covers the required business fields', () => {
    const keys = REQUEST_FORMS.new_customer.fields.map((f) => f.key);
    for (const k of ['name', 'channel', 'city', 'area', 'address', 'gps', 'contact', 'mobile', 'reason']) {
      expect(keys, k).toContain(k);
    }
  });
});

describe('validateRequest', () => {
  it('flags every empty required field', () => {
    const missing = validateRequest(REQUEST_FORMS.new_customer, {});
    // 9 required fields on new_customer (name, channel, city, area, address, gps, contact, mobile, reason)
    expect(missing).toHaveLength(9);
  });
  it('passes once required fields are filled (gps needs both lat+lng)', () => {
    const v = {
      name: 'Al Noor', channel: 'retail', city: 'Riyadh', area: 'Olaya', address: '123 St',
      gps_lat: '24.7', gps_lng: '46.6', contact: 'Sami', mobile: '0500000000', reason: 'new outlet',
    };
    expect(validateRequest(REQUEST_FORMS.new_customer, v)).toEqual([]);
  });
  it('treats a half-filled GPS as missing', () => {
    const f = REQUEST_FORMS.new_customer.fields.find((x) => x.key === 'gps')!;
    expect(fieldFilled(f, { gps_lat: '24.7' })).toBe(false);
    expect(fieldFilled(f, { gps_lat: '24.7', gps_lng: '46.6' })).toBe(true);
  });
});

describe('buildDetails + primaryGps', () => {
  it('builds a details payload, folding gps into lat/lng and coercing numbers', () => {
    const v = { name: 'X', creditLimit: '5000', gps_lat: '24.7', gps_lng: '46.6', code: '' };
    const d = buildDetails(REQUEST_FORMS.new_customer, v);
    expect(d.name).toBe('X');
    expect(d.creditLimit).toBe(5000);
    expect(d.gps).toEqual({ lat: 24.7, lng: 46.6 });
    expect(d).not.toHaveProperty('code'); // empty skipped
  });
  it('extracts the primary gps for the gps_lat/gps_lng columns', () => {
    expect(primaryGps(REQUEST_FORMS.new_customer, { gps_lat: '24.7', gps_lng: '46.6' })).toEqual({ lat: 24.7, lng: 46.6 });
    expect(primaryGps(REQUEST_FORMS.location_fix, { newGps_lat: '1', newGps_lng: '2' })).toEqual({ lat: 1, lng: 2 });
    expect(primaryGps(REQUEST_FORMS.update, {})).toBeNull();
  });
});
