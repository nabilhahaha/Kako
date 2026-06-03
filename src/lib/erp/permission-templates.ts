import type { BranchRole } from './types';
import type { ScopeDimension } from './scope';
import { DENY_ALL_CAPABILITIES, type DenyAllCapability } from './granular-capabilities';
import type { IndustryPack } from './industry-packs';
import { resolveHierarchy, type HierarchyEdge } from './org-structure';

/**
 * Company Onboarding — PERMISSION TEMPLATES (the "how locked down" layer).
 *
 * A permission template is DECOUPLED from the industry pack. Given the role set +
 * sensitive sections an industry pack provides, a template decides the security /
 * approval model: which finer capabilities each role is granted, the approval
 * limits, the recommended data scope, and how aggressively sensitive sections are
 * hidden. So the SAME FMCG pack can be onboarded Standard, Enterprise, Restricted
 * or Custom. Templates are a starting point — everything stays editable in the
 * Full Authz Console after creation.
 */

export type PermissionTemplateId = 'standard' | 'enterprise' | 'restricted' | 'custom';

export interface PermissionTemplateMeta {
  id: PermissionTemplateId;
  labelEn: string;
  labelAr: string;
  descriptionEn: string;
  descriptionAr: string;
}

export const PERMISSION_TEMPLATES: Record<PermissionTemplateId, PermissionTemplateMeta> = {
  standard: {
    id: 'standard',
    labelEn: 'Standard',
    labelAr: 'قياسي',
    descriptionEn: 'Balanced, least-privilege defaults. Functional roles own their actions; sensitive data hidden from junior roles.',
    descriptionAr: 'إعداد متوازن بأقل صلاحية. كل دور يملك مهامه؛ تُخفى البيانات الحساسة عن الأدوار المبتدئة.',
  },
  enterprise: {
    id: 'enterprise',
    labelEn: 'Enterprise',
    labelAr: 'مؤسسي',
    descriptionEn: 'Tight approval thresholds and broad data hiding. Most amounts route through approval; sensitive data limited to finance & admin.',
    descriptionAr: 'حدود اعتماد صارمة وإخفاء واسع للبيانات. تمر معظم المبالغ عبر الاعتماد؛ البيانات الحساسة للمالية والإدارة فقط.',
  },
  restricted: {
    id: 'restricted',
    labelEn: 'Restricted',
    labelAr: 'مقيّد',
    descriptionEn: 'Lockdown. Only the Company Admin holds elevated capabilities; sensitive data hidden from everyone else.',
    descriptionAr: 'إغلاق كامل. مدير الشركة وحده يملك الصلاحيات المتقدمة؛ تُخفى البيانات الحساسة عن الجميع.',
  },
  custom: {
    id: 'custom',
    labelEn: 'Custom',
    labelAr: 'مخصص',
    descriptionEn: 'Blank slate. Grant nothing extra; configure every capability, limit and scope in the Authz Console.',
    descriptionAr: 'بداية فارغة. بدون منح إضافي؛ اضبط كل صلاحية وحد ونطاق من وحدة الصلاحيات.',
  },
};

export const PERMISSION_TEMPLATE_IDS = Object.keys(PERMISSION_TEMPLATES) as PermissionTemplateId[];

export function getPermissionTemplate(id: string): PermissionTemplateMeta | null {
  return (PERMISSION_TEMPLATES as Record<string, PermissionTemplateMeta>)[id] ?? null;
}

// ── Role classes (for section-access strictness) ─────────────────────────────
const ADMIN_ROLES: BranchRole[] = ['admin'];
const FINANCE_VISIBLE: BranchRole[] = ['admin', 'accountant', 'manager'];
const JUNIOR_ROLES: BranchRole[] = [
  'salesman', 'cashier', 'receptionist', 'staff', 'viewer', 'driver',
  'warehouse_keeper', 'technician', 'stylist', 'housekeeping',
];

/** Recommended data-scope dimension per role (org structure, shared by the
 *  non-custom templates). Applied to the created admin; surfaced as guidance for
 *  the rest (scope is per-user, assigned in the Authz Console as users are added). */
const RECOMMENDED_SCOPE: Partial<Record<BranchRole, ScopeDimension>> = {
  salesman: 'own_customers',   // sees only their own customers/visits/orders
  supervisor: 'own_team',      // sees only their team
  manager: 'own_team',         // sees assigned direct/indirect users
  branch_manager: 'branch',
  area_manager: 'area',
  regional_manager: 'region',
};
function recommendedScopes(roles: BranchRole[]): Record<string, ScopeDimension> {
  const out: Record<string, ScopeDimension> = {};
  for (const r of roles) out[r] = RECOMMENDED_SCOPE[r] ?? 'company';
  return out;
}

// ── Capability grants per template ───────────────────────────────────────────
// Functional-ownership grants reused by Standard + Enterprise (least-privilege).
const FUNCTIONAL_GRANTS: Partial<Record<BranchRole, DenyAllCapability[]>> = {
  admin: [...DENY_ALL_CAPABILITIES],
  accountant: ['sales.payment.writeoff', 'sales.invoice.cancel', 'accounting.voucher.approve'],
  branch_manager: ['sales.order.cancel', 'purchasing.po.approve'],
  warehouse_keeper: ['inventory.adjustment.approve'],
  sales_director: ['sales.price.override'],
  regional_manager: ['sales.price.override'],
  trade_marketing_manager: ['sales.price.override'],
};

function capabilitiesFor(templateId: PermissionTemplateId, roles: BranchRole[]): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  if (templateId === 'custom') return out; // grant nothing
  if (templateId === 'restricted') {
    // only the admin (owner) holds elevated capabilities
    if (roles.includes('admin')) out['admin'] = [...DENY_ALL_CAPABILITIES];
    return out;
  }
  // standard + enterprise: functional ownership, filtered to available roles
  for (const r of roles) {
    const caps = FUNCTIONAL_GRANTS[r];
    if (caps && caps.length) out[r] = [...caps];
  }
  // Enterprise narrows price-override authority to the sales director only.
  if (templateId === 'enterprise') {
    if (out['regional_manager']) out['regional_manager'] = out['regional_manager'].filter((c) => c !== 'sales.price.override');
    if (out['trade_marketing_manager']) out['trade_marketing_manager'] = out['trade_marketing_manager'].filter((c) => c !== 'sales.price.override');
    for (const k of Object.keys(out)) if (out[k].length === 0) delete out[k];
  }
  return out;
}

// ── Approval limits per template ─────────────────────────────────────────────
interface LimitRow { role_key: string; action: string; max_amount: number | null; max_percent: number | null }

function limitsFor(templateId: PermissionTemplateId, roles: BranchRole[]): LimitRow[] {
  if (templateId === 'custom') return [];
  const has = (r: BranchRole) => roles.includes(r);
  const rows: LimitRow[] = [];
  const amount = (role_key: string, action: string, max_amount: number) => rows.push({ role_key, action, max_amount, max_percent: null });
  const percent = (role_key: string, action: string, max_percent: number) => rows.push({ role_key, action, max_amount: null, max_percent });

  if (templateId === 'standard') {
    if (has('branch_manager')) amount('branch_manager', 'purchasing.po.approve', 100000);
    if (has('accountant')) { amount('accountant', 'sales.payment.writeoff', 50000); amount('accountant', 'accounting.voucher.approve', 100000); }
    if (has('supervisor')) percent('supervisor', 'sales.order.discount', 5);
    if (has('salesman')) percent('salesman', 'sales.order.discount', 10);
  } else if (templateId === 'enterprise') {
    if (has('branch_manager')) amount('branch_manager', 'purchasing.po.approve', 50000);
    if (has('accountant')) { amount('accountant', 'sales.payment.writeoff', 20000); amount('accountant', 'accounting.voucher.approve', 50000); }
    if (has('supervisor')) percent('supervisor', 'sales.order.discount', 2);
    if (has('salesman')) percent('salesman', 'sales.order.discount', 2);
  } else if (templateId === 'restricted') {
    // discretionary discounts disabled for the field; admin handles exceptions
    if (has('supervisor')) percent('supervisor', 'sales.order.discount', 0);
    if (has('salesman')) percent('salesman', 'sales.order.discount', 0);
  }
  return rows;
}

// ── Section access per template (uses the pack's sensitive sections) ─────────
interface SectionRow { entity: string; section_key: string; subject_type: 'role'; subject_key: string; access: 'hidden' | 'view' }

function sectionAccessFor(
  templateId: PermissionTemplateId,
  roles: BranchRole[],
  sensitive: IndustryPack['sensitiveSections'],
): SectionRow[] {
  if (templateId === 'custom') return [];
  // Which roles are HIDDEN from each sensitive section?
  let hiddenRoles: BranchRole[];
  if (templateId === 'standard') hiddenRoles = roles.filter((r) => JUNIOR_ROLES.includes(r));
  else if (templateId === 'enterprise') hiddenRoles = roles.filter((r) => !FINANCE_VISIBLE.includes(r));
  else hiddenRoles = roles.filter((r) => !ADMIN_ROLES.includes(r)); // restricted

  const rows: SectionRow[] = [];
  for (const s of sensitive) {
    for (const r of hiddenRoles) {
      rows.push({ entity: s.entity, section_key: s.sectionKey, subject_type: 'role', subject_key: r, access: 'hidden' });
    }
  }
  return rows;
}

// ── The composer: industry pack × permission template → apply payload ────────
interface HierarchyRow { role_key: string; reports_to_role_key: string | null }

export interface OnboardingTemplatePayload {
  modules: string[];
  roles: string[];
  capabilities: Record<string, string[]>;
  limits: LimitRow[];
  section_access: SectionRow[];
  hierarchy: HierarchyRow[];
}

export interface ComposedOnboarding {
  /** Exactly the jsonb shape erp_apply_company_template(company_id, payload) expects. */
  payload: OnboardingTemplatePayload;
  /** Recommended per-role scope (applied to admin; guidance for the rest). */
  recommendedScopes: Record<string, ScopeDimension>;
  /** The resolved reporting hierarchy (also surfaced for review). */
  hierarchy: HierarchyEdge[];
  summary: { modules: number; roles: number; capabilities: number; limits: number; sectionAccess: number; hierarchy: number };
}

/**
 * Compose a pack + template into the resolved payload for the apply RPC. Pure —
 * the single source of truth for "what gets applied". The two inputs are
 * independent (no hard coupling). `selectedRoles` lets the operator narrow the
 * pack's suggested roles (optional roles per company); everything is filtered to
 * the chosen set, and the reporting hierarchy is derived from it.
 */
export function composeOnboarding(
  pack: IndustryPack,
  templateId: PermissionTemplateId,
  selectedRoles?: readonly BranchRole[],
): ComposedOnboarding {
  // The template SUGGESTS the pack's roles; the operator may narrow them. Keep the
  // intersection (and always admin) so we never apply a role outside the pack.
  const chosen = (selectedRoles && selectedRoles.length
    ? pack.roles.filter((r) => selectedRoles.includes(r))
    : [...pack.roles]) as BranchRole[];
  const roles = chosen.includes('admin') ? chosen : (['admin', ...chosen] as BranchRole[]);

  const capabilities = capabilitiesFor(templateId, roles);
  const limits = limitsFor(templateId, roles);
  const section_access = sectionAccessFor(templateId, roles, pack.sensitiveSections);
  const hierarchy = resolveHierarchy(roles);
  const capCount = Object.values(capabilities).reduce((n, a) => n + a.length, 0);
  return {
    payload: {
      modules: pack.modules.map(String),
      roles: roles.map(String),
      capabilities,
      limits,
      section_access,
      hierarchy: hierarchy.map((e) => ({ role_key: e.roleKey, reports_to_role_key: e.reportsToRoleKey })),
    },
    recommendedScopes: templateId === 'custom' ? {} : recommendedScopes(roles),
    hierarchy,
    summary: {
      modules: pack.modules.length,
      roles: roles.length,
      capabilities: capCount,
      limits: limits.length,
      sectionAccess: section_access.length,
      hierarchy: hierarchy.length,
    },
  };
}
