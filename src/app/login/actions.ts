'use server';

// Post-login resolver + diagnostics. Returns the explicit home route to navigate
// to after a successful sign-in, or a structured failure that the login form
// surfaces ON SCREEN — so "login succeeded but didn't reach the dashboard" is
// never silent again. Server-side, so it sees exactly what middleware/SSR see.
import { createClient } from '@/lib/supabase/server';
import { getUserContext } from '@/lib/erp/auth-context';
import { resolveHomePath } from '@/lib/erp/home';

export interface PostLoginTarget {
  ok: boolean;
  home?: string;
  stage?: 'getUser-error' | 'no-session' | 'no-context';
  detail?: string;
}

export async function postLoginTarget(): Promise<PostLoginTarget> {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();

  if (error) {
    return { ok: false, stage: 'getUser-error', detail: error.message };
  }
  if (!user) {
    // The browser set the session but the server received no auth cookie — the
    // classic WKWebView/http "Secure cookie dropped" symptom.
    return { ok: false, stage: 'no-session', detail: 'server saw no authenticated user (auth cookie not received)' };
  }

  const ctx = await getUserContext();
  if (!ctx) {
    return { ok: false, stage: 'no-context', detail: `authenticated as ${user.email ?? user.id} but no profile/company/membership loaded` };
  }

  return { ok: true, home: resolveHomePath(ctx) };
}
