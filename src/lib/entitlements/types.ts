// Module & Feature Entitlement Engine — typed model. The catalog (modules,
// features) + entitlements + overrides are DB-canonical; these wrap them.

export type ModuleCategory = 'core' | 'engine' | 'vertical' | 'pack';
export type GrantType = 'grant' | 'deny';

export interface ModuleDef {
  moduleKey: string;
  labelEn: string;
  labelAr: string | null;
  category: ModuleCategory;
  parentModuleKey: string | null;
  platformFlag: string | null;
  managePermission: string | null;
  sort: number;
  isActive: boolean;
}

export interface FeatureDef {
  moduleKey: string;
  featureKey: string;
  labelEn: string;
  labelAr: string | null;
  permission: string | null;
  settingsRef: string | null;
  isActive: boolean;
}

export interface CompanyEntitlement {
  companyId: string;
  moduleKey: string;
  featureKey: string | null;   // null = module-level
  isEnabled: boolean;
  limitValue: number | null;
  limitPeriod: string | null;
  expiresAt: string | null;
}

export interface UserPermissionOverride {
  companyId: string;
  userId: string;
  permission: string;
  grantType: GrantType;
  effectiveFrom: string;
  effectiveTo: string | null;
  isActive: boolean;
}

export interface CompanyEntitlementRow {
  company_id: string;
  module_key: string;
  feature_key: string | null;
  is_enabled: boolean | null;
  limit_value: number | null;
  limit_period: string | null;
  expires_at: string | null;
}
