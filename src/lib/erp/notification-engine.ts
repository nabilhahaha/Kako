import type { SupabaseClient } from '@supabase/supabase-js';

/** ── Universal Notification Engine (Platform Foundation #3) ────────────────
 *  Centralized, event-based notifications. Modules fire an event by key; the DB
 *  engine (erp_notify_send → erp_notify) creates the in-app notification and
 *  enqueues per-channel dispatch rows for any channels the template opts into
 *  (default {in_app} → unchanged behaviour). Email/WhatsApp/SMS/Teams/Push are
 *  drained from erp_notification_dispatch by a channel adapter (future). */

export const NOTIFICATION_CHANNELS = ['in_app', 'email', 'whatsapp', 'sms', 'teams', 'push'] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

/** Fire a notification event to a recipient. Caller resolves recipients (e.g.,
 *  the workflow engine resolves requester/approver/owner/route-owner/admin/
 *  escalation), keeping delivery permission- and workflow-aware. */
export async function notify(
  supabase: SupabaseClient,
  args: {
    company: string;
    user: string;
    event: string;
    payload?: Record<string, unknown>;
    link?: string;
    entity?: string;
    recordId?: string;
  },
): Promise<void> {
  await supabase.rpc('erp_notify_send', {
    p_company: args.company,
    p_user: args.user,
    p_event: args.event,
    p_payload: args.payload ?? {},
    p_link: args.link ?? null,
    p_entity: args.entity ?? null,
    p_record_id: args.recordId ?? null,
  });
}
