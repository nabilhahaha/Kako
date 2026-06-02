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

// Bilingual labels for the audit viewer.
export const AUDIT_ACTION_LABELS: Record<string, { en: string; ar: string }> = {
  create: { en: 'Create', ar: 'إنشاء' },
  update: { en: 'Update', ar: 'تعديل' },
  delete: { en: 'Delete', ar: 'حذف' },
  enable: { en: 'Enable', ar: 'تفعيل' },
  disable: { en: 'Disable', ar: 'تعطيل' },
  grant: { en: 'Grant permission', ar: 'منح صلاحية' },
  revoke: { en: 'Revoke permission', ar: 'سحب صلاحية' },
  activate: { en: 'Activate', ar: 'تفعيل' },
  deactivate: { en: 'Deactivate', ar: 'إيقاف' },
  renew: { en: 'Renew subscription', ar: 'تجديد اشتراك' },
  plan_change: { en: 'Change plan', ar: 'تغيير الخطة' },
  override: { en: 'Manual price override', ar: 'تجاوز سعر يدوي' },
};

export const AUDIT_ENTITY_LABELS: Record<string, { en: string; ar: string }> = {
  company: { en: 'Company', ar: 'شركة' },
  branch: { en: 'Branch', ar: 'فرع' },
  user: { en: 'User', ar: 'مستخدم' },
  user_flags: { en: 'User permissions', ar: 'صلاحيات مستخدم' },
  assignment: { en: 'User-branch assignment', ar: 'ربط مستخدم بفرع' },
  role: { en: 'Role', ar: 'دور' },
  role_permission: { en: 'Role permission (global)', ar: 'صلاحية دور (عام)' },
  company_role: { en: 'Company role', ar: 'دور شركة' },
  company_role_permission: { en: 'Company role permission', ar: 'صلاحية دور (شركة)' },
  customer_status: { en: 'Customer status', ar: 'حالة العميل' },
  subscription: { en: 'Subscription', ar: 'اشتراك' },
  plan: { en: 'Plan', ar: 'خطة' },
  price_override: { en: 'Price override', ar: 'تجاوز السعر' },
};
