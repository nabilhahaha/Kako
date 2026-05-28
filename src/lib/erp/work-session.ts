import { createClient } from '@/lib/supabase/server';
import type { UserContext } from './auth-context';

/** Today's date as YYYY-MM-DD. */
export function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Returns an error message if a field rep is blocked from making movements
 * (day not started, or already ended), otherwise null. Only salesmen are
 * gated — office roles (admin/manager/cashier/...) are never blocked.
 */
export async function repDayBlocked(ctx: UserContext): Promise<string | null> {
  if (ctx.isSuperAdmin) return null;
  if (ctx.topRole !== 'salesman') return null;

  const supabase = await createClient();
  const { data } = await supabase
    .from('erp_work_sessions')
    .select('status')
    .eq('salesman_id', ctx.userId)
    .eq('work_date', today())
    .maybeSingle();

  if (!data) return 'ابدأ يومك أولاً قبل تسجيل أي حركة.';
  if (data.status === 'closed')
    return 'تم إنهاء يوم العمل — لا يمكن إجراء حركات (عدا طلب التحميل) إلا بموافقة المدير.';
  return null;
}
