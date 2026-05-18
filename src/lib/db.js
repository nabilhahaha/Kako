// All Supabase reads/writes live here. UI code should never touch supabase
// directly for business data — only for auth events.

import { supabase, callFn } from './supabase.js';

const PHOTO_BUCKET = 'submission-photos';

const dataUrlToBlob = async (dataUrl) => {
  const res = await fetch(dataUrl);
  return await res.blob();
};

export const db = {
  /* ─── Profiles ─── */
  getProfile: async (userId) => {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();
    if (error) throw error;
    return data;
  },

  listProfiles: async () => {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
  },

  /* ─── Admin operations (Edge Functions) ─── */
  adminCreateUser:    (payload) => callFn('admin-create-user', payload),
  adminUpdateUser:    (payload) => callFn('admin-update-user', payload),
  adminDeleteUser:    (id)      => callFn('admin-delete-user', { id }),
  adminResetPassword: (id, new_password) =>
    callFn('admin-reset-password', { id, new_password }),

  /* ─── Aggregated Excel data ─── */
  getLatestAggregated: async () => {
    const { data, error } = await supabase
      .from('aggregated_data')
      .select('*')
      .order('uploaded_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return data;
  },

  uploadAggregated: async ({ data: aggData, salesmen, customers, items, filename }) => {
    const { data, error } = await supabase
      .from('aggregated_data')
      .insert({
        data: aggData,
        salesmen_count: salesmen,
        customers_count: customers,
        items_count: items,
        source_filename: filename || null,
      })
      .select()
      .maybeSingle();
    if (error) throw error;
    return data;
  },

  /* ─── Visits ─── */
  listMyVisits: async (salesmanId) => {
    const { data, error } = await supabase
      .from('visits')
      .select('*')
      .eq('salesman_id', salesmanId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
  },

  listAllVisits: async () => {
    const { data, error } = await supabase
      .from('visits')
      .select('*')
      .neq('status', 'draft')
      .order('submitted_at', { ascending: false });
    if (error) throw error;
    return data || [];
  },

  getVisit: async (id) => {
    const { data, error } = await supabase
      .from('visits')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    return data;
  },

  createVisit: async (row) => {
    const { data, error } = await supabase
      .from('visits')
      .insert(row)
      .select()
      .maybeSingle();
    if (error) throw error;
    return data ?? row;
  },

  updateVisit: async (id, patch) => {
    const { data, error } = await supabase
      .from('visits')
      .update(patch)
      .eq('id', id)
      .select()
      .maybeSingle();
    if (error) throw error;
    return data;
  },

  deleteVisit: async (id) => {
    const { error } = await supabase.from('visits').delete().eq('id', id);
    if (error) throw error;
  },

  submitVisit: async (id) => {
    const { data, error } = await supabase
      .from('visits')
      .update({ status: 'pending_tm', submitted_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .maybeSingle();
    if (error) throw error;
    return data;
  },

  /* ─── Visit items ─── */
  listVisitItems: async (visitId) => {
    const { data, error } = await supabase
      .from('visit_items')
      .select('*')
      .eq('visit_id', visitId)
      .order('created_at', { ascending: true });
    if (error) throw error;
    return data || [];
  },

  createVisitItem: async (row) => {
    const { data, error } = await supabase
      .from('visit_items')
      .insert(row)
      .select()
      .maybeSingle();
    if (error) throw error;
    return data ?? row;
  },

  updateVisitItem: async (id, patch) => {
    const { data, error } = await supabase
      .from('visit_items')
      .update(patch)
      .eq('id', id)
      .select()
      .maybeSingle();
    if (error) throw error;
    return data;
  },

  deleteVisitItem: async (id) => {
    const { error } = await supabase.from('visit_items').delete().eq('id', id);
    if (error) throw error;
  },

  /* ─── Photos ─── */
  // Path convention: `{visitId}/{itemId}/{kind}.jpg`
  uploadItemPhoto: async (visitId, itemId, kind, dataUrl) => {
    const blob = await dataUrlToBlob(dataUrl);
    const path = `${visitId}/${itemId}/${kind}.jpg`;
    const { error } = await supabase
      .storage
      .from(PHOTO_BUCKET)
      .upload(path, blob, { upsert: true, contentType: 'image/jpeg' });
    if (error) throw error;
    return path;
  },

  getPhotoUrl: async (path) => {
    if (!path) return null;
    const { data, error } = await supabase
      .storage
      .from(PHOTO_BUCKET)
      .createSignedUrl(path, 3600);
    if (error) return null;
    return data?.signedUrl || null;
  },

  /* ─── Van stock ─── */
  getLatestVanUpload: async () => {
    const { data, error } = await supabase
      .from('van_stock_uploads')
      .select('*')
      .order('uploaded_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return data;
  },

  listMyVanStock: async (warehouseCode) => {
    if (!warehouseCode) return [];
    const latest = await db.getLatestVanUpload();
    if (!latest) return [];
    const { data, error } = await supabase
      .from('van_stock')
      .select('*')
      .eq('warehouse_code', warehouseCode)
      .eq('upload_id', latest.id)
      .order('expiry_date', { ascending: true });
    if (error) throw error;
    return data || [];
  },

  listSalesmanWarehouses: async () => {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, full_name, warehouse_code')
      .eq('role', 'salesman')
      .eq('is_active', true);
    if (error) throw error;
    return data || [];
  },

  uploadVanStock: async ({ rows, stats, filename }) => {
    // 1. Insert the upload header (prune trigger fires on this insert).
    const { data: header, error } = await supabase
      .from('van_stock_uploads')
      .insert({ source_filename: filename || null, stats })
      .select()
      .maybeSingle();
    if (error) throw error;
    if (!header?.id) throw new Error('Upload header not returned');

    // 2. Chunked insert of the stock rows.
    const CHUNK = 500;
    for (let i = 0; i < rows.length; i += CHUNK) {
      const chunk = rows.slice(i, i + CHUNK).map((r) => ({
        ...r,
        upload_id: header.id,
      }));
      const { error: e2 } = await supabase.from('van_stock').insert(chunk);
      if (e2) throw e2;
    }
    return header;
  },

  onVanStockChange: (callback) => {
    const channel = supabase
      .channel('nex_van_stock')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'van_stock_uploads' },
        () => callback(),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'van_stock' },
        () => callback(),
      )
      .subscribe();
    return () => supabase.removeChannel(channel);
  },

  /* ─── Realtime ─── */
  onVisitsChange: (callback) => {
    const channel = supabase
      .channel('nex_visits')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'visits' },
        () => callback()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'visit_items' },
        () => callback()
      )
      .subscribe();
    return () => supabase.removeChannel(channel);
  },

  onAggregatedChange: (callback) => {
    const channel = supabase
      .channel('nex_aggregated')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'aggregated_data' },
        () => callback()
      )
      .subscribe();
    return () => supabase.removeChannel(channel);
  },
};
