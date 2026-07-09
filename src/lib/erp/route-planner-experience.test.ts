import { describe, it, expect } from 'vitest';
import { isRoutePlannerExperience } from './route-planner-experience';
import { isRoutePlannerAdminAccount, ROUTE_PLANNER_ADMIN_EMAIL } from './route-planner-admin';

describe('isRoutePlannerExperience — RP company detection', () => {
  it('(1) business_type=route_planner + plan_key=free → recognised', () => {
    expect(isRoutePlannerExperience({ businessType: 'route_planner', companyPlanKey: 'free', modules: ['field_verification', 'route_management'] })).toBe(true);
  });

  it('(2) route_management module enabled (RP-centric tenant) → recognised', () => {
    expect(isRoutePlannerExperience({ companyPlanKey: 'free', businessType: null, modules: ['route_management'] })).toBe(true);
    expect(isRoutePlannerExperience({ companyPlanKey: 'standard', businessType: 'general', modules: ['route_management', 'field_verification'] })).toBe(true);
  });

  it('(3) plan_key starts with route_planner → recognised', () => {
    expect(isRoutePlannerExperience({ companyPlanKey: 'route_planner_monthly' })).toBe(true);
    expect(isRoutePlannerExperience({ companyPlanKey: 'route_planner_trial' })).toBe(true);
  });

  it('a FULL-ERP/FMCG company that merely also has route_management is NOT pulled into RP', () => {
    // The 2 FMCG tenants on staging carry route_management among 20 ERP modules — they must keep
    // their normal ERP, never the chrome-free RP experience.
    expect(isRoutePlannerExperience({
      businessType: 'fmcg', companyPlanKey: 'standard',
      modules: ['accounting', 'sales', 'inventory', 'distribution', 'pos', 'route_management', 'purchasing'],
    })).toBe(false);
  });

  it('an ordinary company with no RP signal is not RP', () => {
    expect(isRoutePlannerExperience({ businessType: 'fast_food', companyPlanKey: 'standard', modules: ['restaurant', 'pos', 'sales'] })).toBe(false);
    expect(isRoutePlannerExperience({ businessType: 'general', companyPlanKey: 'free', modules: ['sales', 'inventory'] })).toBe(false);
  });
});

describe('isRoutePlannerAdminAccount — VENDOR console only', () => {
  it('(5) the dedicated vendor account (email) is the Route Planner Admin', () => {
    expect(isRoutePlannerAdminAccount({ email: ROUTE_PLANNER_ADMIN_EMAIL })).toBe(true);
    expect(isRoutePlannerAdminAccount({ email: ROUTE_PLANNER_ADMIN_EMAIL.toUpperCase() })).toBe(true);
  });

  it('a COMPANY admin holding the route_planner.admin permission is NOT the vendor admin', () => {
    // This is the noor regression: a tenant admin must NOT be bounced to /planner-admin.
    expect(isRoutePlannerAdminAccount({ email: 'admin@noor.com', topRole: 'admin', permissions: ['route_planner.admin'] })).toBe(false);
  });

  it('an unrelated user is not the vendor admin', () => {
    expect(isRoutePlannerAdminAccount({ email: 'someone@example.com', permissions: [] })).toBe(false);
  });
});
