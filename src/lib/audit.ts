import { supabase } from './supabase';

interface AuditInput {
  actorId: string;
  action: string;
  entity: string;
  entityId?: string | null;
  metadata?: Record<string, unknown>;
}

// Fire-and-forget audit log. Failures are swallowed (logged to console)
// so they never block the user's primary action.
export async function logAudit(input: AuditInput) {
  try {
    const { error } = await supabase.from('audit_logs').insert({
      actor_id: input.actorId,
      action: input.action,
      entity: input.entity,
      entity_id: input.entityId ?? null,
      metadata: input.metadata ?? null,
    });
    if (error) console.warn('audit log failed', error);
  } catch (e) {
    console.warn('audit log threw', e);
  }
}
