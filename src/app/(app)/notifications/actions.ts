'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { requireAuth, type ActionResult } from '@/lib/erp/guards';

/** In-app notification center — mark read (RLS lets a user update only their own). */
export async function markNotificationRead(id: string): Promise<ActionResult> {
  const { ctx, error } = await requireAuth();
  if (!ctx) return { ok: false, error };
  const supabase = await createClient();
  const { error: e } = await supabase.from('erp_notifications').update({ is_read: true }).eq('id', id);
  if (e) return { ok: false, error: e.message };
  revalidatePath('/notifications');
  return { ok: true };
}

export async function markAllNotificationsRead(): Promise<ActionResult> {
  const { ctx, error } = await requireAuth();
  if (!ctx) return { ok: false, error };
  const supabase = await createClient();
  const { error: e } = await supabase
    .from('erp_notifications').update({ is_read: true }).eq('user_id', ctx.userId).eq('is_read', false);
  if (e) return { ok: false, error: e.message };
  revalidatePath('/notifications');
  return { ok: true };
}
