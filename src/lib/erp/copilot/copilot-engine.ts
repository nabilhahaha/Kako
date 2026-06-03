/**
 * VANTORA Help Copilot — deterministic engine (V1, NO external AI).
 *
 * Pure functions over the CALLER'S OWN authorization context. They never read
 * other users' or tenants' data: a block explanation is computed only from the
 * caller's permissions/modules/role/scope plus facts the server already
 * authorized for them. Fully unit-testable.
 */

import type { Permission } from '../permissions';
import { PERMISSION_LABELS, ROLE_PERMISSIONS } from '../permissions';
import type { Module } from '../navigation';
import { MODULE_LABELS } from '../navigation';
import type { BranchRole } from '../types';
import { BRANCH_ROLES } from '../constants';
import { isScopedRole } from '../scope';
import {
  ACTION_REQUIREMENTS, BLOCK_REASONS, SCREENS, TRAINING_GUIDES,
  type Bi, type BlockCode,
} from './copilot-kb';

/** The minimal, already-authorized snapshot the engine reasons over. */
export interface CopilotContext {
  permissions: string[];
  modules: string[];
  roles: BranchRole[];
  topRole: BranchRole;
  isSuperAdmin: boolean;
  isPlatformOwner: boolean;
  companyActive: boolean;
}

const pick = (b: Bi, locale: 'en' | 'ar') => (locale === 'ar' ? b.ar : b.en);

function holdsAny(ctx: CopilotContext, perms?: Permission[]): boolean {
  if (ctx.isSuperAdmin || ctx.isPlatformOwner) return true;
  if (!perms || perms.length === 0) return true;
  return perms.some((p) => ctx.permissions.includes(p));
}

export interface BlockReason {
  code: BlockCode;
  title: string;
  remedy: string;
  detail?: string;
}
export interface BlockAnalysis {
  actionKey: string;
  actionLabel: string;
  allowed: boolean;
  reasons: BlockReason[];
}

/** Live facts the server may pass for data-dependent blocks (already scoped to
 *  the caller). All optional — omitted facts are simply not evaluated. */
export interface ActionFacts {
  gpsViolation?: boolean;
  distanceM?: number;
  radiusM?: number;
  outOfRoute?: boolean;
  coveragePct?: number;
  minCoveragePct?: number;
  limitExceeded?: boolean;
  limitMax?: number | null;
  amount?: number;
  workflowPending?: boolean;
  workflowApprover?: string;
  sectionHidden?: boolean;
}

/** Feature 2 / 9 — "Why can't I …?" Deterministic, no data leakage. */
export function analyzeAction(
  actionKey: string,
  ctx: CopilotContext,
  locale: 'en' | 'ar' = 'en',
  facts: ActionFacts = {},
): BlockAnalysis {
  const req = ACTION_REQUIREMENTS[actionKey];
  const reasons: BlockReason[] = [];
  const reason = (code: BlockCode, detail?: string): BlockReason => ({
    code, title: pick(BLOCK_REASONS[code].title, locale), remedy: pick(BLOCK_REASONS[code].remedy, locale), detail,
  });

  if (!ctx.companyActive) reasons.push(reason('subscription_inactive'));

  if (req) {
    if (req.module && !(ctx.isSuperAdmin || ctx.isPlatformOwner) && !ctx.modules.includes(req.module)) {
      reasons.push(reason('module_not_enabled', pick(MODULE_LABELS[req.module as Module] as Bi, locale)));
    }
    if (!holdsAny(ctx, req.anyPermission)) {
      const labels = (req.anyPermission ?? []).map((p) => pick(PERMISSION_LABELS[p] as Bi, locale)).join(' / ');
      reasons.push(reason('permission_missing', labels));
    }
    if (req.scopeSensitive && isScopedRole(ctx.topRole)) {
      reasons.push(reason('scope_restricted', pick(BRANCH_ROLES[ctx.topRole], locale)));
    }
  }

  // Data-dependent facts (server pre-authorized for this caller).
  if (facts.gpsViolation) reasons.push(reason('gps_violation', facts.distanceM != null && facts.radiusM != null ? `${facts.distanceM}m > ${facts.radiusM}m` : undefined));
  if (facts.outOfRoute) reasons.push(reason('out_of_route'));
  if (facts.coveragePct != null && facts.minCoveragePct != null && facts.coveragePct < facts.minCoveragePct)
    reasons.push(reason('low_coverage', `${facts.coveragePct}% < ${facts.minCoveragePct}%`));
  if (facts.limitExceeded) reasons.push(reason('limit_exceeded', facts.limitMax != null ? String(facts.limitMax) : undefined));
  if (facts.workflowPending) reasons.push(reason('workflow_pending', facts.workflowApprover));
  if (facts.sectionHidden) reasons.push(reason('section_hidden'));

  return {
    actionKey,
    actionLabel: req ? pick(req.label, locale) : actionKey,
    allowed: reasons.length === 0,
    reasons,
  };
}

// ── Feature 1 / 14 — screen help + suggested questions ───────────────────────
export interface ScreenExplanation {
  title: string;
  purpose: string;
  actions: string[];
  questions: string[];
}

function matchScreen(href: string) {
  // longest matching prefix wins
  return SCREENS.filter((s) => href.startsWith(s.match)).sort((a, b) => b.match.length - a.match.length)[0] ?? null;
}

export function explainScreen(href: string, locale: 'en' | 'ar' = 'en'): ScreenExplanation | null {
  const s = matchScreen(href);
  if (!s) return null;
  return {
    title: pick(s.title, locale),
    purpose: pick(s.purpose, locale),
    actions: s.actions.map((a) => pick(a, locale)),
    questions: s.questions.map((q) => pick(q, locale)),
  };
}

export function suggestedQuestions(href: string, locale: 'en' | 'ar' = 'en'): string[] {
  return matchScreen(href)?.questions.map((q) => pick(q, locale)) ?? [];
}

// ── Feature 4 — permission / role explainer ───────────────────────────────────
export function explainPermission(perm: Permission, locale: 'en' | 'ar' = 'en'): { label: string; group: string; defaultRoles: string[] } | null {
  const l = PERMISSION_LABELS[perm];
  if (!l) return null;
  const defaultRoles = (Object.keys(ROLE_PERMISSIONS) as BranchRole[]).filter((r) => {
    const set = ROLE_PERMISSIONS[r];
    return set === '*' || (Array.isArray(set) && set.includes(perm));
  }).map((r) => pick(BRANCH_ROLES[r], locale));
  return { label: pick(l as Bi, locale), group: l.group, defaultRoles };
}

// ── Feature 5 — role-aware training ──────────────────────────────────────────
export interface TrainingResult { title: string; steps: string[]; permitted: boolean }
export function trainingGuide(key: string, ctx: CopilotContext, locale: 'en' | 'ar' = 'en'): TrainingResult | null {
  const g = TRAINING_GUIDES[key];
  if (!g) return null;
  const permitted = !g.perm || holdsAny(ctx, [g.perm]);
  return { title: pick(g.title, locale), steps: g.steps.map((s) => pick(s, locale)), permitted };
}

export function trainingTopics(locale: 'en' | 'ar' = 'en'): { key: string; title: string }[] {
  return Object.values(TRAINING_GUIDES).map((g) => ({ key: g.key, title: pick(g.title, locale) }));
}

// ── Dynamic (live) capability resolution ─────────────────────────────────────
// These take the CURRENT runtime permission/module set (resolved live from
// erp_company_role_permissions / erp_company_modules by copilot-live-context.ts),
// so answers update automatically when a company changes a role's grants, adds a
// new role, or disables a module — no hardcoded role assumptions.

/** Human-readable summary of what a permission set can do, grouped. Pass a ROLE's
 *  live permissions to describe a (possibly brand-new) company role, or a USER's
 *  effective permissions. Unknown keys (e.g. granular caps not in the flat label
 *  map) are passed through verbatim so nothing is hidden. */
export function roleCapabilities(
  livePermissions: string[],
  locale: 'en' | 'ar' = 'en',
): { group: string; items: string[] }[] {
  const byGroup = new Map<string, string[]>();
  for (const p of livePermissions) {
    const l = PERMISSION_LABELS[p as Permission] as Bi & { group?: string } | undefined;
    const group = l?.group ?? 'other';
    const label = l ? pick(l, locale) : p;
    const arr = byGroup.get(group) ?? [];
    arr.push(label);
    byGroup.set(group, arr);
  }
  return [...byGroup.entries()]
    .map(([group, items]) => ({ group, items: items.sort() }))
    .sort((a, b) => a.group.localeCompare(b.group));
}

/** Can a subject with this LIVE permission/module set perform an action? Pure +
 *  deterministic — reused for "this role can/can't do X" from current config. */
export function canDoAction(
  actionKey: string,
  livePermissions: string[],
  liveModules: string[],
  privileged = false,
): boolean {
  const req = ACTION_REQUIREMENTS[actionKey];
  if (!req) return true;
  if (privileged) return true;
  if (req.module && !liveModules.includes(req.module)) return false;
  if (req.anyPermission && req.anyPermission.length > 0) {
    return req.anyPermission.some((p) => livePermissions.includes(p));
  }
  return true;
}

/** A company rule phrased with its LIVE value (e.g. GPS radius, min coverage),
 *  so the answer reflects current company configuration, not a hardcoded default. */
export function describeCompanyRule(
  rule: 'gps_radius' | 'min_coverage' | 'van_auto_approve',
  value: number | null,
  locale: 'en' | 'ar' = 'en',
): string {
  const v = value == null ? (locale === 'ar' ? 'غير محدد' : 'not set') : String(value);
  const t: Record<typeof rule, Bi> = {
    gps_radius: { en: `Check-ins must be within ${v} m of the customer.`, ar: `يجب أن يكون تسجيل الوصول ضمن ${v} متر من العميل.` },
    min_coverage: { en: `You can close the day at ${v}% coverage or above.`, ar: `يمكنك إغلاق اليوم عند تغطية ${v}% أو أعلى.` },
    van_auto_approve: { en: `Van transfers under ${v} are auto-approved.`, ar: `تحويلات العربة تحت ${v} تُعتمد تلقائيًا.` },
  };
  return pick(t[rule], locale);
}
