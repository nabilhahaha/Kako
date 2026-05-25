import { supabase } from '@/lib/supabase';
import type {
  TradeSpendCustomer,
  TradeSpendItem,
  SalesTransaction,
  Campaign,
  TradeSpendUser,
  Distributor,
} from './types';

/* -------------------------------------------------------------------------- */
/*  Connection guard                                                          */
/* -------------------------------------------------------------------------- */

/** Cached result so we don't re-probe on every call. */
let supabaseAvailable: boolean | null = null;

export async function isSupabaseReady(): Promise<boolean> {
  if (supabaseAvailable !== null) return supabaseAvailable;
  try {
    const { error } = await supabase.from('ts_distributors').select('id').limit(1);
    supabaseAvailable = !error;
  } catch {
    supabaseAvailable = false;
  }
  return supabaseAvailable;
}

/* -------------------------------------------------------------------------- */
/*  Distributors                                                              */
/* -------------------------------------------------------------------------- */

export async function fetchDistributors(): Promise<Distributor[] | null> {
  if (!await isSupabaseReady()) return null;
  const { data, error } = await supabase.from('ts_distributors').select('*').order('name');
  if (error) { console.warn('fetchDistributors error:', error); return null; }
  return data as Distributor[];
}

export async function upsertDistributor(d: Distributor): Promise<void> {
  if (!await isSupabaseReady()) return;
  await supabase.from('ts_distributors').upsert({
    id: d.id,
    name: d.name,
    code: d.code,
    active: d.active,
  });
}

/* -------------------------------------------------------------------------- */
/*  Customers (scoped by distributor)                                         */
/* -------------------------------------------------------------------------- */

export async function fetchCustomers(distId: string): Promise<TradeSpendCustomer[] | null> {
  if (!await isSupabaseReady()) return null;
  const { data, error } = await supabase
    .from('ts_customers')
    .select('*')
    .eq('distributor_id', distId);
  if (error) return null;
  return (data || []).map((r) => ({
    account: r.account,
    name: r.name,
    class: r.class,
    channel: r.channel,
    classification: r.classification,
    created_at: r.created_at,
  }));
}

export async function upsertCustomers(distId: string, customers: TradeSpendCustomer[]): Promise<void> {
  if (!await isSupabaseReady()) return;
  const rows = customers.map((c) => ({
    distributor_id: distId,
    account: c.account,
    name: c.name,
    class: c.class,
    channel: c.channel,
    classification: c.classification,
  }));
  for (let i = 0; i < rows.length; i += 500) {
    await supabase.from('ts_customers').upsert(rows.slice(i, i + 500), {
      onConflict: 'distributor_id,account',
    });
  }
}

/* -------------------------------------------------------------------------- */
/*  Items                                                                     */
/* -------------------------------------------------------------------------- */

export async function fetchItems(distId: string): Promise<TradeSpendItem[] | null> {
  if (!await isSupabaseReady()) return null;
  const { data, error } = await supabase
    .from('ts_items')
    .select('*')
    .eq('distributor_id', distId);
  if (error) return null;
  return (data || []).map((r) => ({
    id: r.item_code,
    description: r.description,
  }));
}

export async function upsertItems(distId: string, items: TradeSpendItem[]): Promise<void> {
  if (!await isSupabaseReady()) return;
  const rows = items.map((item) => ({
    distributor_id: distId,
    item_code: item.id,
    description: item.description,
  }));
  for (let i = 0; i < rows.length; i += 500) {
    await supabase.from('ts_items').upsert(rows.slice(i, i + 500), {
      onConflict: 'distributor_id,item_code',
    });
  }
}

/* -------------------------------------------------------------------------- */
/*  Transactions                                                              */
/* -------------------------------------------------------------------------- */

export async function fetchTransactions(distId: string): Promise<SalesTransaction[] | null> {
  if (!await isSupabaseReady()) return null;

  // Check row count first to avoid loading huge datasets
  const { count, error: countError } = await supabase
    .from('ts_sales_transactions')
    .select('*', { count: 'exact', head: true })
    .eq('distributor_id', distId);
  if (countError) return null;

  if ((count || 0) > 50000) {
    console.warn(`[Supabase] ${count} transactions — too many to load all at once`);
  }

  const { data, error } = await supabase
    .from('ts_sales_transactions')
    .select('*')
    .eq('distributor_id', distId);
  if (error) return null;
  return (data || []).map((r) => ({
    id: r.id,
    account: r.account,
    item_id: r.item_id,
    date: r.date,
    value_ex_vat: Number(r.value_ex_vat),
    cases: Number(r.cases),
  }));
}

export async function insertTransactions(distId: string, txns: SalesTransaction[]): Promise<void> {
  if (!await isSupabaseReady()) return;
  const rows = txns.map((t) => ({
    distributor_id: distId,
    account: t.account,
    item_id: t.item_id,
    date: t.date,
    value_ex_vat: t.value_ex_vat,
    cases: t.cases,
  }));
  for (let i = 0; i < rows.length; i += 500) {
    await supabase.from('ts_sales_transactions').insert(rows.slice(i, i + 500));
  }
}

/* -------------------------------------------------------------------------- */
/*  Campaigns                                                                 */
/* -------------------------------------------------------------------------- */

export async function fetchCampaigns(distId: string): Promise<Campaign[] | null> {
  if (!await isSupabaseReady()) return null;
  const { data, error } = await supabase
    .from('ts_campaigns')
    .select('*')
    .eq('distributor_id', distId);
  if (error) return null;

  // Fetch branches for all campaigns in this distributor
  const { data: branches } = await supabase
    .from('ts_campaign_branches')
    .select('*')
    .eq('distributor_id', distId);
  const branchMap = new Map<string, { id: string; campaign_id: string; branch_name: string; photo_url?: string }[]>();
  for (const b of (branches || [])) {
    const list = branchMap.get(b.campaign_id) || [];
    list.push({
      id: b.id,
      campaign_id: b.campaign_id,
      branch_name: b.branch_name,
      photo_url: b.photo_url,
    });
    branchMap.set(b.campaign_id, list);
  }

  return (data || []).map((r) => ({
    id: r.id,
    account: r.account,
    classification: r.classification,
    spend_type: r.spend_type,
    duration_key: r.duration_key,
    duration_months: r.duration_months,
    item_ids: r.item_ids || [],
    spend_amount: Number(r.spend_amount),
    start_date: r.start_date,
    roshen_pct: Number(r.roshen_pct),
    period_mode: r.period_mode,
    custom_days: r.custom_days,
    before_start: r.before_start,
    before_end: r.before_end,
    after_start: r.after_start,
    after_end: r.after_end,
    branch_count: r.branch_count,
    branches: branchMap.get(r.id) || [],
    status: r.status,
    created_by: r.created_by,
    created_at: r.created_at,
    submitted_at: r.submitted_at,
    approved_distributor_at: r.approved_distributor_at,
    approved_roshen_at: r.approved_roshen_at,
    photos_submitted_at: r.photos_submitted_at,
    final_approved_at: r.final_approved_at,
    rejected_at: r.rejected_at,
  }));
}

/* -------------------------------------------------------------------------- */
/*  Users                                                                     */
/* -------------------------------------------------------------------------- */

export async function fetchUsers(distId: string): Promise<TradeSpendUser[] | null> {
  if (!await isSupabaseReady()) return null;
  const { data, error } = await supabase
    .from('ts_users')
    .select('*')
    .eq('distributor_id', distId);
  if (error) return null;
  return (data || []).map((r) => ({
    id: r.id,
    email: r.email,
    display_name: r.display_name,
    roles: r.roles,
    active: r.active,
    password: r.password,
    created_at: r.created_at,
  }));
}

/* -------------------------------------------------------------------------- */
/*  Bulk sync (used after data import)                                        */
/* -------------------------------------------------------------------------- */

export async function syncDistributorToSupabase(
  distId: string,
  data: {
    customers: TradeSpendCustomer[];
    items: TradeSpendItem[];
    transactions: SalesTransaction[];
  },
): Promise<boolean> {
  if (!await isSupabaseReady()) return false;
  try {
    await upsertCustomers(distId, data.customers);
    await upsertItems(distId, data.items);
    await insertTransactions(distId, data.transactions);
    return true;
  } catch (err) {
    console.error('[Supabase sync] Error:', err);
    return false;
  }
}
