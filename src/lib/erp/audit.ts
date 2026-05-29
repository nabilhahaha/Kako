import type { SupabaseClient } from '@supabase/supabase-js';

// Best-effort audit logging. Writes go through the erp_log_audit() RPC, which
// stamps the actor from the session — never let a logging failure break the
// underlying action.

export interface AuditEntry {
  action: string; // e.g. 'create', 'update', 'delete', 'enable', 'disable'
  entity: string; // e.g. 'company', 'user', 'role_permission', 'plan'
  entityId?: string | null;
  details?: Record<string, unknown> | null;
  companyId?: string | null;
}

export async function logAudit(
  supabase: SupabaseClient,
  entry: AuditEntry,
): Promise<void> {
  try {
    await supabase.rpc('erp_log_audit', {
      p_action: entry.action,
      p_entity: entry.entity,
      p_entity_id: entry.entityId ?? null,
      p_details: entry.details ?? null,
      p_company_id: entry.companyId ?? null,
    });
  } catch {
    // swallow — auditing must never block the operation
  }
}

// Arabic labels for the audit viewer.
export const AUDIT_ACTION_LABELS: Record<string, string> = {
  create: 'إنشاء',
  update: 'تعديل',
  delete: 'حذف',
  enable: 'تفعيل',
  disable: 'تعطيل',
  grant: 'منح صلاحية',
  revoke: 'سحب صلاحية',
  activate: 'تفعيل',
  deactivate: 'إيقاف',
  renew: 'تجديد اشتراك',
  plan_change: 'تغيير الخطة',
};

export const AUDIT_ENTITY_LABELS: Record<string, string> = {
  company: 'شركة',
  branch: 'فرع',
  user: 'مستخدم',
  user_flags: 'صلاحيات مستخدم',
  assignment: 'ربط مستخدم بفرع',
  role: 'دور',
  role_permission: 'صلاحية دور (عام)',
  company_role: 'دور شركة',
  company_role_permission: 'صلاحية دور (شركة)',
  subscription: 'اشتراك',
  plan: 'خطة',
};
