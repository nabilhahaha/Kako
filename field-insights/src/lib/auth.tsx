import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { supabase } from './supabase';
import { useSession, type Role } from '@/stores/session';

interface AuthContextValue {
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  configured: boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

async function loadProfile(userId: string) {
  if (!supabase) return;
  const { data } = await supabase
    .from('profiles')
    .select('id, full_name, email, role, region_id, area_id, is_active')
    .eq('id', userId)
    .maybeSingle();
  const set = useSession.getState().setProfile;
  if (!data) {
    set(null);
    return;
  }
  set({
    userId: data.id,
    fullName: data.full_name,
    email: data.email,
    role: data.role as Role,
    regionId: data.region_id,
    areaId: data.area_id,
    isActive: data.is_active,
  });
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [configured] = useState(() => supabase !== null);

  useEffect(() => {
    if (!supabase) {
      useSession.getState().setLoading(false);
      return;
    }
    supabase.auth.getSession().then(({ data }) => {
      if (data.session?.user) {
        void loadProfile(data.session.user.id);
      } else {
        useSession.getState().setProfile(null);
      }
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        void loadProfile(session.user.id);
      } else {
        useSession.getState().clear();
      }
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      configured,
      signIn: async (email, password) => {
        if (!supabase) return { error: 'Backend not configured' };
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        return { error: error?.message ?? null };
      },
      signOut: async () => {
        await supabase?.auth.signOut();
        useSession.getState().clear();
      },
    }),
    [configured],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
