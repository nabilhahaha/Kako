import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

if (!url || !key) {
  throw new Error('املأ VITE_SUPABASE_URL و VITE_SUPABASE_PUBLISHABLE_KEY في ملف .env');
}

export const supabase = createClient(url, key);

export interface MarketVisit {
  id: string;
  shop_name: string;
  area: string | null;
  visited_at: string;
  had_order: boolean;
  order_value: number;
  notes: string | null;
  created_at: string;
}
