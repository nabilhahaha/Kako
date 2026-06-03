import { redirect } from 'next/navigation';
import { getUserContext, type UserContext } from './auth-context';
import type { Module } from './navigation';
import type { Permission } from './permissions';

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
 * Action-level (non-redirecting) module check. Use inside server actions so a
 * tenant whose company has a module DISABLED cannot invoke the action directly
 * (the page-only `requireModule` redirects and is never reached by a direct
 * action call). The platform owner and global super admins bypass module gating,
 * mirroring `requireModule`. Module enablement comes from `ctx.modules`, which
 * `getUserContext` resolves as the intersection of the company's enabled modules
 * (erp_company_modules) and the plan's modules (erp_plan_modules).
 */
export function hasModule(ctx: UserContext, module: Module): boolean {
  if (ctx.isPlatformOwner || ctx.isSuperAdmin) return true;
  return ctx.modules.includes(module);
}

/**
 * Action guard: returns an error `ActionResult` when the company does not have
 * `module` enabled, otherwise `null`. Pattern:
 *   const modErr = requireModuleAction(ctx, 'hotel');
 *   if (modErr) return modErr;
 */
export function requireModuleAction(
  ctx: UserContext,
  module: Module,
): ActionResult<never> | null {
  if (hasModule(ctx, module)) return null;
  return { ok: false, error: 'هذه الميزة غير مفعّلة في باقتك.' };
}

/**
 * Page/layout guard: ensure the user holds a permission (super admins hold
 * all). Redirects to the dashboard when the permission is missing.
 */
export async function requirePermission(perm: Permission): Promise<UserContext> {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  if (ctx.isSuperAdmin || ctx.permissions.includes(perm)) return ctx;
  redirect('/dashboard');
}

/**
 * Page/layout guard: ensure the user holds ANY of the given permissions (super
 * admins hold all). Redirects to the dashboard when none are present.
 */
export async function requireAnyPermission(perms: Permission[]): Promise<UserContext> {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  if (ctx.isSuperAdmin || perms.some((p) => ctx.permissions.includes(p))) return ctx;
  redirect('/dashboard');
}

/** Translate common Postgres errors into friendly Arabic messages. */
export function friendlyDbError(error: { code?: string; message: string }): string {
  if (error.code === '23505') return 'هذا الكود مستخدم بالفعل.';
  if (error.code === '23503') return 'لا يمكن الحذف لارتباط السجل ببيانات أخرى.';
  if (error.code === '42501') return 'ليس لديك صلاحية لهذه العملية.';
  return error.message;
}
