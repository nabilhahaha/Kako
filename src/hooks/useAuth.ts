import { useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import type { AppUser } from '@/lib/types';

async function fetchProfile(userId: string): Promise<AppUser | null> {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('id, email, full_name, user_type, region, supervisor_id, is_active')
      .eq('id', userId)
      .maybeSingle();

    if (error) return null;
    return (data as AppUser) ?? null;
  } catch {
    return null;
  }
}

export function useAuthBootstrap() {
  const { setSession, setProfile, setInitialized, reset } = useAuthStore();

  useEffect(() => {
    let active = true;

    try {
      supabase.auth.getSession().then(async ({ data }) => {
        if (!active) return;
        setSession(data.session);
        if (data.session?.user) {
          const profile = await fetchProfile(data.session.user.id);
          if (active) setProfile(profile);
        }
        if (active) setInitialized(true);
      }).catch(() => {
        if (active) setInitialized(true);
      });
    } catch {
      setInitialized(true);
    }

    let unsub: (() => void) | undefined;
    try {
      const { data: sub } = supabase.auth.onAuthStateChange(async (_event, session) => {
        if (!active) return;
        setSession(session);
        if (!session) {
          reset();
          setInitialized(true);
          return;
        }
        const profile = await fetchProfile(session.user.id);
        if (active) setProfile(profile);
      });
      unsub = () => sub.subscription.unsubscribe();
    } catch {
      if (active) setInitialized(true);
    }

    return () => {
      active = false;
      unsub?.();
    };
  }, [setSession, setProfile, setInitialized, reset]);
}

export function useAuth() {
  return useAuthStore((s) => ({
    session: s.session,
    profile: s.profile,
    initialized: s.initialized,
    loading: s.loading,
  }));
}

export async function signIn(email: string, password: string) {
  return supabase.auth.signInWithPassword({ email, password });
}

export async function signOut() {
  return supabase.auth.signOut();
}
