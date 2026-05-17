// All Supabase reads/writes live here. UI code should never touch supabase directly
// for business data — only for auth events.

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
  adminCreateUser: (payload) => callFn('admin-create-user', payload),
  adminUpdateUser: (payload) => callFn('admin-update-user', payload),
  adminDeleteUser: (id) => callFn('admin-delete-user', { id }),
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

  /* ─── Submissions ─── */
  listMySubmissions: async (salesmanId) => {
    const { data, error } = await supabase
      .from('submissions')
      .select('*')
      .eq('salesman_id', salesmanId)
      .order('submitted_at', { ascending: false });
    if (error) throw error;
    return data || [];
  },

  listSubmissionsByStatus: async (status) => {
    const { data, error } = await supabase
      .from('submissions')
      .select('*')
      .eq('status', status)
      .order('submitted_at', { ascending: false });
    if (error) throw error;
    return data || [];
  },

  listAllSubmissions: async () => {
    const { data, error } = await supabase
      .from('submissions')
      .select('*')
      .order('submitted_at', { ascending: false });
    if (error) throw error;
    return data || [];
  },

  createSubmission: async (row) => {
    // .maybeSingle() instead of .single() — RLS can shadow the RETURNING row
    // for the salesman role on certain pg / postgrest versions, which fires a
    // spurious PGRST116. The insert itself still succeeds. The caller should
    // supply `row.id` (a client-generated uuid) if it needs to reference the
    // row before the round-trip returns.
    const { data, error } = await supabase
      .from('submissions')
      .insert(row)
      .select()
      .maybeSingle();
    if (error) throw error;
    return data ?? row;
  },

  updateSubmission: async (id, patch) => {
    const { data, error } = await supabase
      .from('submissions')
      .update(patch)
      .eq('id', id)
      .select()
      .maybeSingle();
    if (error) throw error;
    return data;
  },

  /* ─── Photos ─── */
  uploadPhoto: async (submissionId, kind /* 'expiry' | 'qty' */, dataUrl) => {
    const blob = await dataUrlToBlob(dataUrl);
    const path = `${submissionId}/${kind}.jpg`;
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

  /* ─── Send decision email ─── */
  sendDecisionEmail: ({ submission_id, is_edit, lang }) =>
    callFn('send-decision-email', { submission_id, is_edit, lang }),

  /* ─── Realtime ─── */
  onSubmissionsChange: (callback) => {
    const channel = supabase
      .channel('nex_submissions')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'submissions' },
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
