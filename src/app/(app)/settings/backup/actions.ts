'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { requireAuth, canAny, friendlyDbError, type ActionResult } from '@/lib/erp/guards';
import { logAudit } from '@/lib/erp/audit';
import { getT } from '@/lib/i18n/server';

const BACKUP_MANAGE = ['settings.users', 'fashion.manage', 'fashion.reports'];
const CAP = 20000;

async function guard() {
  const { ctx, error } = await requireAuth();
  if (error) return { ctx: null, error };
  const { t } = await getT();
  if (!canAny(ctx!, BACKUP_MANAGE)) return { ctx: null, error: t('settings.backup.errNoPermission') };
  return { ctx, error: null as string | null };
}

/** Manual "Backup Now" — snapshots the store into erp_backups (stored + retained). */
export async function createBackupNow(): Promise<ActionResult> {
  const { error } = await guard();
  if (error) return { ok: false, error };
  const supabase = await createClient();
  const { error: e } = await supabase.rpc('erp_create_backup', { p_kind: 'manual', p_company_id: null });
  if (e) return { ok: false, error: friendlyDbError(e) };
  revalidatePath('/settings/backup');
  return { ok: true };
}

/** Save the automatic-backup schedule + retention. */
export async function updateBackupSchedule(frequency: 'off' | 'daily' | 'weekly', retention: number): Promise<ActionResult> {
  const { ctx, error } = await guard();
  if (error) return { ok: false, error };
  const supabase = await createClient();
  const { error: e } = await supabase
    .from('erp_ops_settings')
    .upsert({ company_id: ctx!.companyId, backup_frequency: ['off', 'daily', 'weekly'].includes(frequency) ? frequency : 'off', backup_retention: Math.max(1, Math.min(60, Math.round(retention) || 7)) }, { onConflict: 'company_id' });
  if (e) return { ok: false, error: friendlyDbError(e) };
  await logAudit(supabase, { action: 'backup.schedule_updated', entity: 'erp_ops_settings', entityId: ctx!.companyId, details: { frequency, retention }, companyId: ctx!.companyId });
  revalidatePath('/settings/backup');
  return { ok: true };
}

/** Download a stored backup's JSON payload. */
export async function downloadStoredBackup(id: string): Promise<ActionResult<{ filename: string; json: string }>> {
  const { error } = await guard();
  if (error) return { ok: false, error };
  const supabase = await createClient();
  const { data, error: e } = await supabase.from('erp_backups').select('payload, created_at').eq('id', id).maybeSingle();
  if (e) return { ok: false, error: friendlyDbError(e) };
  if (!data) return { ok: false, error: 'not found' };
  const stamp = String((data as { created_at: string }).created_at).slice(0, 10);
  return { ok: true, data: { filename: `store-backup-${stamp}.json`, json: JSON.stringify((data as { payload: unknown }).payload, null, 2) } };
}

/**
 * Export a backup of the store's own data as JSON (no platform/admin data — only
 * this company's rows, RLS-scoped). Store-owner friendly: one download they can
 * keep. Audited.
 */
export async function exportBackup(): Promise<ActionResult<{ filename: string; json: string }>> {
  const { ctx, error: authErr } = await requireAuth();
  if (authErr) return { ok: false, error: authErr };
  const { t } = await getT();
  if (!canAny(ctx!, BACKUP_MANAGE)) return { ok: false, error: t('settings.backup.errNoPermission') };

  const supabase = await createClient();
  const grab = async (table: string, cols = '*') =>
    ((await supabase.from(table).select(cols).limit(CAP)).data ?? []) as unknown[];

  const [company, products, customers, suppliers, invoices, invoiceLines, installmentPlans, installmentSchedule, salesReturns, expenses] =
    await Promise.all([
      ctx!.companyId ? supabase.from('erp_companies').select('*').eq('id', ctx!.companyId).maybeSingle().then((r) => r.data) : Promise.resolve(null),
      grab('erp_products_catalog'),
      grab('erp_customers'),
      grab('erp_suppliers'),
      grab('erp_invoices'),
      grab('erp_invoice_lines'),
      grab('erp_installment_plans'),
      grab('erp_installment_schedule'),
      grab('erp_sales_returns'),
      grab('erp_expenses'),
    ]);

  const backup = {
    meta: { exported_at: new Date().toISOString(), company_id: ctx!.companyId, version: 1 },
    company,
    products, customers, suppliers,
    invoices, invoice_lines: invoiceLines,
    installment_plans: installmentPlans, installment_schedule: installmentSchedule,
    sales_returns: salesReturns, expenses,
  };

  await logAudit(supabase, { action: 'store.backup_exported', entity: 'erp_companies', entityId: ctx!.companyId, companyId: ctx!.companyId });
  const stamp = new Date().toISOString().slice(0, 10);
  return { ok: true, data: { filename: `store-backup-${stamp}.json`, json: JSON.stringify(backup, null, 2) } };
}

// ── Backup Restore (A) — full preview + explicit confirm, no blind restore ───
// Preview reports new / existing / conflict / skip per entity group. Apply is
// non-destructive: master data (products/customers/suppliers) + inventory levels
// are upserted (new + existing, conflicts skipped); transactional records
// (invoices/installments) are INSERT-MISSING only — never overwriting history.

type Bag = Record<string, unknown>;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface RGroup {
  backupKey: string;            // key in the backup JSON
  table: string;
  conflictKey?: string;         // field whose change (same id) = a conflict
  mode: 'upsert' | 'insert';    // upsert = master/inventory; insert = transactional history
  fields?: string[];            // restricted field set on upsert (else whole row)
  childKey?: string;            // child array to insert alongside (e.g. invoice_lines)
  childTable?: string;
}
const GROUPS: Record<string, RGroup> = {
  products:     { backupKey: 'products',  table: 'erp_products_catalog', conflictKey: 'code', mode: 'upsert', fields: ['id','code','name','name_ar','barcode','category_id','unit','cost_price','sell_price','min_stock','tax_rate','is_active'] },
  customers:    { backupKey: 'customers', table: 'erp_customers', conflictKey: 'code', mode: 'upsert', fields: ['id','code','name','name_ar','phone','email','address','tax_number','credit_limit','is_active'] },
  suppliers:    { backupKey: 'suppliers', table: 'erp_suppliers', conflictKey: 'code', mode: 'upsert', fields: ['id','code','name','name_ar','phone','email','address','tax_number','is_active'] },
  inventory:    { backupKey: 'inventory', table: 'erp_inventory_stock', mode: 'upsert' },
  invoices:     { backupKey: 'invoices', table: 'erp_invoices', conflictKey: 'invoice_number', mode: 'insert', childKey: 'invoice_lines', childTable: 'erp_invoice_lines' },
  installments: { backupKey: 'installment_plans', table: 'erp_installment_plans', mode: 'insert', childKey: 'installment_schedule', childTable: 'erp_installment_schedule' },
};
const ORDER = ['products', 'customers', 'suppliers', 'inventory', 'invoices', 'installments'];

export interface GroupPreview { new: number; existing: number; conflict: number; skip: number }
export interface RestorePreview { entities: Record<string, GroupPreview>; errors: string[] }

function parseBackup(jsonString: string): { ok: true; data: Bag } | { ok: false; error: string } {
  let data: unknown;
  try { data = JSON.parse(jsonString); } catch { return { ok: false, error: 'invalid_json' }; }
  if (!data || typeof data !== 'object') return { ok: false, error: 'invalid_structure' };
  if (!('meta' in (data as Bag))) return { ok: false, error: 'missing_meta' };
  return { ok: true, data: data as Bag };
}

/** Dry-run preview: per-entity new / existing / conflict / skip. No writes. */
export async function restorePreview(jsonString: string): Promise<ActionResult<RestorePreview>> {
  const { error } = await guard();
  if (error) return { ok: false, error };
  const { t } = await getT();
  const parsed = parseBackup(jsonString);
  if (!parsed.ok) return { ok: false, error: t(`settings.restore.err_${parsed.error}` as 'settings.restore.err_invalid_json') };

  const supabase = await createClient();
  const entities: Record<string, GroupPreview> = {};
  const errors: string[] = [];

  for (const g of ORDER) {
    const spec = GROUPS[g];
    const rows = Array.isArray(parsed.data[spec.backupKey]) ? (parsed.data[spec.backupKey] as Bag[]) : [];
    const valid = rows.filter((r) => typeof r.id === 'string' && UUID_RE.test(r.id as string));
    const skip = rows.length - valid.length;
    const ids = valid.map((r) => r.id as string);
    const existing = new Map<string, Bag>();
    const sel = spec.conflictKey ? `id, ${spec.conflictKey}` : 'id';
    for (let i = 0; i < ids.length; i += 500) {
      const { data } = await supabase.from(spec.table).select(sel).in('id', ids.slice(i, i + 500));
      for (const e of (data ?? []) as unknown as Bag[]) existing.set(e.id as string, e);
    }
    let isNew = 0, isExisting = 0, conflict = 0;
    for (const r of valid) {
      const ex = existing.get(r.id as string);
      if (!ex) isNew++;
      else if (spec.conflictKey && r[spec.conflictKey] !== ex[spec.conflictKey]) conflict++;
      else isExisting++;
    }
    entities[g] = { new: isNew, existing: isExisting, conflict, skip };
    if (skip > 0) errors.push(t('settings.restore.errSkippedEntity', { n: skip, entity: t(`settings.restore.entity_${g}` as 'settings.restore.entity_products') }));
  }
  return { ok: true, data: { entities, errors } };
}

/** Apply the restore (after explicit confirm). Non-destructive; audited. */
export async function restoreApply(jsonString: string): Promise<ActionResult<{ applied: Record<string, number> }>> {
  const { ctx, error } = await guard();
  if (error) return { ok: false, error };
  const { t } = await getT();
  const parsed = parseBackup(jsonString);
  if (!parsed.ok) return { ok: false, error: t(`settings.restore.err_${parsed.error}` as 'settings.restore.err_invalid_json') };

  const supabase = await createClient();
  const applied: Record<string, number> = {};

  const existingIds = async (table: string, ids: string[]) => {
    const set = new Set<string>();
    for (let i = 0; i < ids.length; i += 500) {
      const { data } = await supabase.from(table).select('id').in('id', ids.slice(i, i + 500));
      for (const e of (data ?? []) as { id: string }[]) set.add(e.id);
    }
    return set;
  };
  const insertChunks = async (table: string, rows: Bag[], upsert: boolean) => {
    for (let i = 0; i < rows.length; i += 500) {
      const chunk = rows.slice(i, i + 500);
      const { error: e } = upsert
        ? await supabase.from(table).upsert(chunk, { onConflict: 'id' })
        : await supabase.from(table).insert(chunk);
      if (e) throw new Error(friendlyDbError(e));
    }
  };

  try {
    for (const g of ORDER) {
      const spec = GROUPS[g];
      const rows = (Array.isArray(parsed.data[spec.backupKey]) ? (parsed.data[spec.backupKey] as Bag[]) : [])
        .filter((r) => typeof r.id === 'string' && UUID_RE.test(r.id as string));
      const ids = rows.map((r) => r.id as string);
      const present = await existingIds(spec.table, ids);

      if (spec.mode === 'upsert') {
        // new + existing (skip conflicts); restricted field set, company_id omitted (trigger/RLS)
        const sel = spec.conflictKey ? `id, ${spec.conflictKey}` : 'id';
        const existing = new Map<string, Bag>();
        for (let i = 0; i < ids.length; i += 500) {
          const { data } = await supabase.from(spec.table).select(sel).in('id', ids.slice(i, i + 500));
          for (const e of (data ?? []) as unknown as Bag[]) existing.set(e.id as string, e);
        }
        const toApply = rows.filter((r) => {
          const ex = existing.get(r.id as string);
          return !ex || !spec.conflictKey || r[spec.conflictKey] === ex[spec.conflictKey];
        }).map((r) => {
          if (!spec.fields) return r;
          const o: Bag = {}; for (const f of spec.fields) if (r[f] !== undefined) o[f] = r[f]; return o;
        });
        await insertChunks(spec.table, toApply, true);
        applied[g] = toApply.length;
      } else {
        // insert-missing only (never overwrite history)
        const missing = rows.filter((r) => !present.has(r.id as string));
        await insertChunks(spec.table, missing, false);
        applied[g] = missing.length;
        // children of the inserted parents
        if (spec.childKey && spec.childTable) {
          const parentIds = new Set(missing.map((r) => r.id as string));
          const fk = spec.childKey === 'invoice_lines' ? 'invoice_id' : 'plan_id';
          const children = (Array.isArray(parsed.data[spec.childKey]) ? (parsed.data[spec.childKey] as Bag[]) : [])
            .filter((c) => typeof c.id === 'string' && UUID_RE.test(c.id as string) && parentIds.has(c[fk] as string));
          if (children.length) {
            const childPresent = await existingIds(spec.childTable, children.map((c) => c.id as string));
            await insertChunks(spec.childTable, children.filter((c) => !childPresent.has(c.id as string)), false);
          }
        }
      }
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'restore_failed' };
  }

  await logAudit(supabase, { action: 'backup.restored', entity: 'erp_companies', entityId: ctx!.companyId, details: { applied }, companyId: ctx!.companyId });
  revalidatePath('/products'); revalidatePath('/customers'); revalidatePath('/suppliers'); revalidatePath('/inventory');
  return { ok: true, data: { applied } };
}
