// Field Insights environment — intentionally namespaced VITE_FI_* so it can
// never collide with VANTORA's VITE_SUPABASE_* variables.
export const env = {
  appName: import.meta.env.VITE_FI_APP_NAME ?? 'Field Insights',
  supabaseUrl: import.meta.env.VITE_FI_SUPABASE_URL ?? '',
  supabaseKey: import.meta.env.VITE_FI_SUPABASE_PUBLISHABLE_KEY ?? '',
};

export const isSupabaseConfigured = Boolean(env.supabaseUrl && env.supabaseKey);
