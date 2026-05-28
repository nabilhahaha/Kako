import { getUserContext, type UserContext } from './auth-context';

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

/** Translate common Postgres errors into friendly Arabic messages. */
export function friendlyDbError(error: { code?: string; message: string }): string {
  if (error.code === '23505') return 'هذا الكود مستخدم بالفعل.';
  if (error.code === '23503') return 'لا يمكن الحذف لارتباط السجل ببيانات أخرى.';
  if (error.code === '42501') return 'ليس لديك صلاحية لهذه العملية.';
  return error.message;
}
