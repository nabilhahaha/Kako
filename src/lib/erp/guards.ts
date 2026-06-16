import { redirect } from 'next/navigation';
import { getUserContext, type UserContext } from './auth-context';
import type { Module } from './navigation';
import { hasPermission, type Permission } from './permissions';
import { can as canCapability, canAny as canAnyCapability } from './capabilities';

// ─── Authorization Phase 2 — granular capability resolver (runtime wiring) ────
//
// Re-export the pure, client-usable capability resolver from `capabilities.ts`
// so call sites can import a single granular API from `guards`. These resolve a
// GRANULAR (`module.resource.action`) or legacy flat key through the alias layer
// (`expandAliases`), so a granular check passes for any role whose stored flat
// perms alias-expand to it. Super admins hold everything. This is additive and
// fully interoperable with `hasPermission`/`requirePermission` (which stay).
export { can, canAny } from './capabilities';
export type { CapabilityContext } from './capabilities';

export interface ActionResult<T = unknown> {
  ok: boolean;
  error?: string;
  data?: T;
}

/** Ensure there is an authenticated user; returns context or an error result. */
export async function requireAuth(): Promise<
  { ctx: UserContext; error: null } | { ctx: null; error: string }
> {
  const ctx = await getUserContext();
  if (!ctx) return { ctx: null, error: 'غير مصرح. سجّل الدخول.' };
  return { ctx, error: null };
}

/** Stable not-authorized message for server actions (shown to the user; mirrors
 *  the English guard-message style of the van-sales actions). */
export const ACTION_NOT_AUTHORIZED = 'You do not have permission to perform this action.';

/**
 * Action-layer authorization — ALWAYS ON (not flag-gated). Ensures an
 * authenticated user holds `perm` and returns the same `{ ctx, error }` shape as
 * `requireAuth` so a server action can fail fast with a friendly ActionResult.
 *
 * Unlike `requireActionPerm` (in action-authz-core), which is a no-op until
 * `platform.action_authz_enforcement` is enabled, this gate is UNCONDITIONAL. It
 * is the baseline permission check for sensitive paths (e.g. the van-sales money
 * paths: sell / collect / return) so server-side enforcement never depends on a
 * feature flag. `hasPermission` already grants super-admins / platform owners.
 */
export async function requireActionPermission(perm: Permission): Promise<
  { ctx: UserContext; error: null } | { ctx: null; error: string }
> {
  const { ctx, error } = await requireAuth();
  if (error || !ctx) return { ctx: null, error: error ?? 'غير مصرح. سجّل الدخول.' };
  if (!hasPermission(ctx, perm)) return { ctx: null, error: ACTION_NOT_AUTHORIZED };
  return { ctx, error: null };
}

/** Ensure the user is a super admin. */
export async function requireSuperAdmin(): Promise<
  { ctx: UserContext; error: null } | { ctx: null; error: string }
> {
  const { ctx, error } = await requireAuth();
  if (error || !ctx) return { ctx: null, error: error ?? 'غير مصرح' };
  if (!ctx.isSuperAdmin)
    return { ctx: null, error: 'هذه العملية متاحة لمدير النظام فقط.' };
  return { ctx, error: null };
}

/**
 * Page/layout guard: ensure the signed-in user may access a feature module
 * (unlocked by the company's plan). The platform owner and global super admins
 * bypass module gating. Redirects instead of returning when access is denied.
 */
export async function requireModule(module: Module): Promise<UserContext> {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  if (ctx.isPlatformOwner || ctx.isSuperAdmin) return ctx;
  if (!ctx.modules.includes(module)) redirect(`/upgrade?module=${module}`);
  return ctx;
}

/**
 * Page/layout guard: ensure the user holds a permission. The platform owner (the
 * vendor) and global super admins hold everything — consistent with
 * `requireModule` — so a permission gate never blocks the apex tiers. Redirects
 * to the dashboard when the permission is missing.
 */
export async function requirePermission(perm: Permission): Promise<UserContext> {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  if (ctx.isSuperAdmin || ctx.isPlatformOwner || ctx.permissions.includes(perm)) return ctx;
  redirect('/dashboard');
}

/**
 * Page/layout guard: ensure the user holds ANY of the given permissions. The
 * platform owner and super admins hold all. Redirects to the dashboard when none
 * are present.
 */
export async function requireAnyPermission(perms: Permission[]): Promise<UserContext> {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  if (ctx.isSuperAdmin || ctx.isPlatformOwner || perms.some((p) => ctx.permissions.includes(p))) return ctx;
  redirect('/dashboard');
}

/**
 * Page/layout guard: ensure the user holds a GRANULAR (or legacy flat)
 * capability, resolved through the alias layer (`expandAliases`). Super admins
 * hold all. Redirects to the dashboard when the capability is missing. This is
 * the granular-aware companion to `requirePermission`; cutover-safe because any
 * role whose flat perms alias-expand to `capability` still passes.
 */
export async function requireCapability(capability: string): Promise<UserContext> {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  if (canCapability(ctx, capability)) return ctx;
  redirect('/dashboard');
}

/**
 * Page/layout guard: ensure the user holds ANY of the given granular (or legacy
 * flat) capabilities, resolved through the alias layer. Super admins hold all.
 * Redirects to the dashboard when none are present.
 */
export async function requireAnyCapability(capabilities: string[]): Promise<UserContext> {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  if (canAnyCapability(ctx, capabilities)) return ctx;
  redirect('/dashboard');
}

/** Translate common Postgres errors into friendly Arabic messages. */
export function friendlyDbError(error: { code?: string; message: string }): string {
  if (error.code === '23505') return 'هذا الكود مستخدم بالفعل.';
  if (error.code === '23503') return 'لا يمكن الحذف لارتباط السجل ببيانات أخرى.';
  if (error.code === '42501') return 'ليس لديك صلاحية لهذه العملية.';
  return error.message;
}
