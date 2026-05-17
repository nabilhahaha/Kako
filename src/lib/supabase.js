import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!url || !key) {
  // eslint-disable-next-line no-console
  console.error(
    'Missing Supabase env vars. Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY in .env.local'
  );
}

export const supabase = createClient(url, key, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

export const callFn = async (name, body) => {
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (error) {
    const detail = data?.error || error.message || 'Edge function failed';
    throw new Error(detail);
  }
  if (data?.error) throw new Error(data.error);
  return data;
};
