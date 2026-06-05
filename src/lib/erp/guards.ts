import { redirect } from 'next/navigation';
import { getUserContext, type UserContext } from './auth-context';
import type { Module } from './navigation';
import type { Permission } from './permissions';
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
