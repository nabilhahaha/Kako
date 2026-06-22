/**
 * VANTORA — Module Configuration / Workflow Settings catalog (Phase 1).
 *
 * Every configurable module behaviour is declared here ONCE: key, owning module,
 * value type, safe default, bilingual label/help, and a risk tag. Adding a new
 * setting is a code change here only — no migration (values live generically in
 * `erp_module_settings`). This mirrors the `feature-catalog.ts` precedent.
 *
 * PHASE 1 IS DOCUMENTATION-ONLY: `enforced: false` on every entry. Nothing reads
 * these for business logic yet, so defaults are INERT — they describe today's
 * behaviour but do not change it. Wiring enforcement is a later phase.
 *
 * Pure module (no `server-only`, no React) so both the server resolver and the
 * client display can import it. Labels are inline en/ar (not i18n keys) so the
 * catalog is self-contained and the i18n parity test is unaffected.
 */

export type ModuleKey = 'pos' | 'sales' | 'inventory' | 'route';
export type SettingType = 'boolean' | 'number' | 'enum';
export type RiskLevel = 'normal' | 'sensitive';
export type SettingValue = boolean | number | string;

export interface Bilingual { en: string; ar: string }

export interface ModuleSettingDef {
  /** Unique within its module; also the `setting_key` stored in the DB. */
  key: string;
  module: ModuleKey;
  type: SettingType;
  /** Safe default — reflects today's behaviour (Phase 1 is inert). */
  default: SettingValue;
  /** Allowed values for `type: 'enum'`. */
  options?: readonly string[];
  /** `sensitive` = relaxing it weakens a money/stock safety invariant. */
  risk: RiskLevel;
  label: Bilingual;
  help: Bilingual;
  /** Phase 1: always false (catalog documents the setting; logic ignores it). */
  enforced: boolean;
}

export const MODULE_LABELS: Record<ModuleKey, Bilingual> = {
  pos: { en: 'POS', ar: 'نقطة البيع' },
  sales: { en: 'Sales', ar: 'المبيعات' },
  inventory: { en: 'Inventory', ar: 'المخزون' },
  route: { en: 'Route / Field Sales', ar: 'المسارات والمبيعات الميدانية' },
};

export const MODULE_ORDER: readonly ModuleKey[] = ['pos', 'sales', 'inventory', 'route'];

/** Compact builder — every Phase-1 setting is documentation-only (enforced=false). */
const S = (
  module: ModuleKey,
  key: string,
  type: SettingType,
  def: SettingValue,
  risk: RiskLevel,
  label: Bilingual,
  help: Bilingual,
  options?: readonly string[],
): ModuleSettingDef => ({ key, module, type, default: def, risk, label, help, options, enforced: false });

export const MODULE_SETTINGS: readonly ModuleSettingDef[] = [
  // ── POS ───────────────────────────────────────────────────────────────────
  S('pos', 'require_shift_open', 'boolean', false, 'normal',
    { en: 'Require shift open', ar: 'إلزام فتح وردية' },
    { en: 'Cashier must open a shift before selling.', ar: 'يجب على الكاشير فتح وردية قبل البيع.' }),
  S('pos', 'require_opening_cash', 'boolean', false, 'normal',
    { en: 'Require opening cash', ar: 'إلزام النقد الافتتاحي' },
    { en: 'Capture an opening cash float when the shift opens.', ar: 'تسجيل العهدة النقدية الافتتاحية عند فتح الوردية.' }),
  S('pos', 'require_shift_close', 'boolean', false, 'normal',
    { en: 'Require shift close', ar: 'إلزام إغلاق الوردية' },
    { en: 'Cashier must close the shift at end of session.', ar: 'يجب على الكاشير إغلاق الوردية في نهاية الجلسة.' }),
  S('pos', 'require_cash_settlement', 'boolean', false, 'normal',
    { en: 'Require cash settlement', ar: 'إلزام تسوية النقدية' },
    { en: 'Reconcile counted cash against expected at close.', ar: 'مطابقة النقد المعدود مع المتوقع عند الإغلاق.' }),
  S('pos', 'allow_sale_without_shift', 'boolean', true, 'sensitive',
    { en: 'Allow sale without an open shift', ar: 'السماح بالبيع دون وردية مفتوحة' },
    { en: 'Permit a sale when no shift is open.', ar: 'السماح بإتمام البيع بدون وردية مفتوحة.' }),
  S('pos', 'auto_print_invoice', 'boolean', false, 'normal',
    { en: 'Auto-print invoice', ar: 'طباعة الفاتورة تلقائياً' },
    { en: 'Print the receipt automatically after checkout.', ar: 'طباعة الإيصال تلقائياً بعد إتمام البيع.' }),
  S('pos', 'refund_requires_approval', 'boolean', true, 'sensitive',
    { en: 'Refund requires approval', ar: 'الاسترداد يتطلب موافقة' },
    { en: 'A refund must be approved before it is posted.', ar: 'يجب اعتماد الاسترداد قبل ترحيله.' }),
  S('pos', 'max_discount_without_approval', 'number', 0, 'sensitive',
    { en: 'Max discount without approval (%)', ar: 'أقصى خصم بدون موافقة (%)' },
    { en: 'Discount above this percentage needs approval. 0 = none allowed.', ar: 'الخصم فوق هذه النسبة يتطلب موافقة. 0 = غير مسموح.' }),

  // ── Sales ─────────────────────────────────────────────────────────────────
  S('sales', 'enforce_credit_limit', 'boolean', true, 'sensitive',
    { en: 'Enforce credit limit', ar: 'فرض حد الائتمان' },
    { en: 'Block sales that would exceed the customer credit limit.', ar: 'منع المبيعات التي تتجاوز حد ائتمان العميل.' }),
  S('sales', 'block_overdue_customers', 'boolean', false, 'sensitive',
    { en: 'Block overdue customers', ar: 'حظر العملاء المتأخرين' },
    { en: 'Block sales to customers with overdue balances.', ar: 'منع البيع للعملاء ذوي الأرصدة المتأخرة.' }),
  S('sales', 'cash_only_if_credit_limit_zero', 'boolean', false, 'normal',
    { en: 'Cash only when credit limit is zero', ar: 'نقدي فقط عند حد ائتمان صفر' },
    { en: 'Force cash payment when the customer has no credit limit.', ar: 'إلزام الدفع النقدي عندما لا يملك العميل حد ائتمان.' }),
  S('sales', 'allow_admin_override', 'boolean', true, 'sensitive',
    { en: 'Allow admin override', ar: 'السماح بتجاوز المدير' },
    { en: 'Let an admin override a blocked sale.', ar: 'السماح للمدير بتجاوز عملية بيع محظورة.' }),
  S('sales', 'discount_approval_threshold', 'number', 0, 'sensitive',
    { en: 'Discount approval threshold (%)', ar: 'حد موافقة الخصم (%)' },
    { en: 'Discount above this percentage needs approval. 0 = none allowed.', ar: 'الخصم فوق هذه النسبة يتطلب موافقة. 0 = غير مسموح.' }),
  S('sales', 'return_approval_required', 'boolean', true, 'sensitive',
    { en: 'Return approval required', ar: 'مرتجع يتطلب موافقة' },
    { en: 'A sales return must be approved before restock / AR posting.', ar: 'يجب اعتماد مرتجع المبيعات قبل إعادة المخزون والترحيل.' }),

  // ── Inventory ─────────────────────────────────────────────────────────────
  S('inventory', 'allow_negative_stock', 'boolean', false, 'sensitive',
    { en: 'Allow negative stock', ar: 'السماح بالمخزون السالب' },
    { en: 'Permit issuing stock below zero on hand.', ar: 'السماح بصرف مخزون أقل من الرصيد المتاح.' }),
  S('inventory', 'require_transfer_approval', 'boolean', true, 'normal',
    { en: 'Require transfer approval', ar: 'إلزام موافقة التحويل' },
    { en: 'Stock transfers between locations must be approved.', ar: 'يجب اعتماد تحويلات المخزون بين المواقع.' }),
  S('inventory', 'batch_tracking_enabled', 'boolean', false, 'normal',
    { en: 'Batch / lot tracking', ar: 'تتبّع الدفعات' },
    { en: 'Track batch / lot numbers on stock movements.', ar: 'تتبّع أرقام الدفعات في حركات المخزون.' }),
  S('inventory', 'expiry_tracking_enabled', 'boolean', false, 'normal',
    { en: 'Expiry tracking', ar: 'تتبّع الصلاحية' },
    { en: 'Track product expiry dates.', ar: 'تتبّع تواريخ صلاحية المنتجات.' }),
  S('inventory', 'FEFO_enabled', 'boolean', false, 'normal',
    { en: 'FEFO picking', ar: 'صرف الأقرب انتهاءً (FEFO)' },
    { en: 'Pick first-expiry-first-out.', ar: 'الصرف وفق الأقرب انتهاءً أولاً.' }),

  // ── Route / Field Sales ───────────────────────────────────────────────────
  S('route', 'require_gps_checkin', 'boolean', false, 'normal',
    { en: 'Require GPS check-in', ar: 'إلزام تسجيل الوصول GPS' },
    { en: 'Field rep must GPS check-in at the customer.', ar: 'يجب على المندوب تسجيل الوصول GPS عند العميل.' }),
  S('route', 'allow_off_route_visit', 'boolean', true, 'normal',
    { en: 'Allow off-route visits', ar: 'السماح بزيارات خارج المسار' },
    { en: 'Permit visiting customers not on the planned route.', ar: 'السماح بزيارة عملاء خارج المسار المخطط.' }),
  S('route', 'require_visit_result', 'boolean', true, 'normal',
    { en: 'Require visit result', ar: 'إلزام نتيجة الزيارة' },
    { en: 'Every visit must record an outcome.', ar: 'يجب تسجيل نتيجة لكل زيارة.' }),
  S('route', 'require_no_sales_reason', 'boolean', true, 'normal',
    { en: 'Require no-sale reason', ar: 'إلزام سبب عدم البيع' },
    { en: 'A no-sale visit must record a reason.', ar: 'يجب تسجيل سبب عند الزيارة دون بيع.' }),
  S('route', 'require_photo', 'boolean', false, 'normal',
    { en: 'Require photo evidence', ar: 'إلزام إثبات بالصورة' },
    { en: 'A photo must be attached to the visit.', ar: 'يجب إرفاق صورة بالزيارة.' }),
  S('route', 'daily_visit_target', 'number', 0, 'normal',
    { en: 'Daily visit target', ar: 'هدف الزيارات اليومي' },
    { en: 'Target number of visits per rep per day. 0 = none.', ar: 'عدد الزيارات المستهدف لكل مندوب يومياً. 0 = لا يوجد.' }),
] as const;

/** A catalog setting plus its effective value for one company (resolver output).
 *  Lives here (pure module) so the client display can import it without pulling
 *  in the server-only resolver. */
export interface ResolvedSetting {
  def: ModuleSettingDef;
  value: SettingValue;
  /** Where the effective value came from. */
  source: 'default' | 'company';
}

/** Lookup a setting definition by module + key. */
export function findSetting(module: string, key: string): ModuleSettingDef | undefined {
  return MODULE_SETTINGS.find((s) => s.module === module && s.key === key);
}

/**
 * Coerce a stored JSONB value to the setting's declared type, falling back to the
 * catalog default for anything malformed. Keeps the resolver total + safe.
 */
export function coerceSettingValue(def: ModuleSettingDef, raw: unknown): SettingValue {
  switch (def.type) {
    case 'boolean':
      return typeof raw === 'boolean' ? raw : Boolean(def.default);
    case 'number':
      return typeof raw === 'number' && Number.isFinite(raw) ? raw : Number(def.default);
    case 'enum': {
      const ok = typeof raw === 'string' && (def.options?.includes(raw) ?? false);
      return ok ? (raw as string) : String(def.default);
    }
  }
}
