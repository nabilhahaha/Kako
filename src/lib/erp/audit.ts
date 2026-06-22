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
  view: { en: 'View', ar: 'اطّلاع' },
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
  module_setting: { en: 'Module setting', ar: 'إعداد الوحدة' },
  field_config: { en: 'Field configuration', ar: 'إعداد الحقل' },
  field_access: { en: 'Field access', ar: 'صلاحية الحقل' },
  field_section: { en: 'Field section', ar: 'قسم الحقول' },
  subscription: { en: 'Subscription', ar: 'اشتراك' },
  plan: { en: 'Plan', ar: 'خطة' },
  price_override: { en: 'Price override', ar: 'تجاوز السعر' },
};

/** Heuristic set of "destructive / sensitive" actions used by the audit viewer
 *  and the overview anomaly signal. Kept here so both share one source. */
export const AUDIT_DESTRUCTIVE_ACTIONS = new Set([
  'delete', 'revoke', 'disable', 'deactivate', 'grant', 'deny', 'suspend',
]);

export interface AuditEventLike {
  actor_email: string | null;
  action: string;
  entity: string;
  entity_id?: string | null;
  details?: Record<string, unknown> | null;
  company_id?: string | null;
}

/** Pull a human-readable label out of an audit `details` blob, trying the most
 *  common naming keys first. Returns null when nothing useful is present. */
function detailValue(
  details: Record<string, unknown> | null | undefined,
  keys: string[],
): string | null {
  if (!details) return null;
  for (const k of keys) {
    const v = details[k];
    if (v === null || v === undefined) continue;
    if (typeof v === 'object') continue;
    const s = String(v).trim();
    if (s) return s;
  }
  return null;
}

/** Build a readable, bilingual sentence describing an audit event, e.g.
 *  "Admin (a@x.com) granted permission `sales.invoice.create` to role Supervisor".
 *  Falls back gracefully (action label + entity label) for unknown shapes. */
export function describeAuditEvent(
  row: AuditEventLike,
  opts: {
    locale: 'en' | 'ar';
    companyName?: string | null;
  } = { locale: 'en' },
): string {
  const { locale } = opts;
  const ar = locale === 'ar';
  const actor = row.actor_email || (ar ? 'مستخدم النظام' : 'A user');
  const actionLabel = AUDIT_ACTION_LABELS[row.action]?.[locale] ?? row.action;
  const entityLabel = AUDIT_ENTITY_LABELS[row.entity]?.[locale] ?? row.entity;
  const company = opts.companyName?.trim() || null;

  const perm = detailValue(row.details, ['permission', 'flag', 'capability', 'module']);
  const targetRole = detailValue(row.details, ['role', 'role_name', 'role_key', 'to_role']);
  const targetName = detailValue(row.details, ['name', 'name_ar', 'email', 'title', 'label']);
  const target = targetName || row.entity_id || null;

  const inCompany = company ? (ar ? ` في ${company}` : ` in ${company}`) : '';

  // Permission grant / revoke / deny — the most security-relevant phrasing.
  if (perm && (row.action === 'grant' || row.action === 'revoke' || row.action === 'deny')) {
    const verb = ar
      ? row.action === 'grant' ? 'منح' : row.action === 'deny' ? 'منع' : 'سحب'
      : row.action === 'grant' ? 'granted' : row.action === 'deny' ? 'denied' : 'revoked';
    const roleClause = targetRole
      ? (ar ? ` للدور ${targetRole}` : ` to role ${targetRole}`)
      : '';
    return ar
      ? `${actor} ${verb} الصلاحية \`${perm}\`${roleClause}${inCompany}`
      : `${actor} ${verb} permission \`${perm}\`${roleClause}${inCompany}`;
  }

  // Company lifecycle (suspend / activate / create) reads better without "Company entity".
  if (row.entity === 'company' && (company || target)) {
    const subj = company || target;
    return ar
      ? `${actor} — ${actionLabel} الشركة ${subj}`
      : `${actor} — ${actionLabel} company ${subj}`;
  }

  // Generic: "Actor — Action Entity [target] [in Company]".
  const targetClause = target ? ` ${target}` : '';
  return ar
    ? `${actor} — ${actionLabel} ${entityLabel}${targetClause}${inCompany}`
    : `${actor} — ${actionLabel} ${entityLabel}${targetClause}${inCompany}`;
}
