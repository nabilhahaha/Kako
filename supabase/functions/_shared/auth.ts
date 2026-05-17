// Shared helpers to (a) verify the caller is a logged-in Roshen Manager and
// (b) return a service_role admin client.

import { createClient, SupabaseClient } from 'jsr:@supabase/supabase-js@2';

export const adminClient = (): SupabaseClient =>
  createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

export const userClientFromRequest = (req: Request): SupabaseClient => {
  const authHeader = req.headers.get('Authorization') ?? '';
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  );
};

export type CallerProfile = {
  id: string;
  email: string;
  full_name: string;
  role: 'salesman' | 'trade_marketing' | 'roshen_manager';
};

export const requireRoshenManager = async (
  req: Request,
): Promise<CallerProfile> => {
  const client = userClientFromRequest(req);
  const { data: { user }, error } = await client.auth.getUser();
  if (error || !user) throw new Response('Unauthorized', { status: 401 });

  const { data: profile } = await client
    .from('profiles')
    .select('id, email, full_name, role')
    .eq('id', user.id)
    .single();

  if (!profile || profile.role !== 'roshen_manager') {
    throw new Response('Forbidden — Roshen Manager only', { status: 403 });
  }
  return profile as CallerProfile;
};

export const requireAuthed = async (req: Request) => {
  const client = userClientFromRequest(req);
  const { data: { user }, error } = await client.auth.getUser();
  if (error || !user) throw new Response('Unauthorized', { status: 401 });
  return { user, client };
};
