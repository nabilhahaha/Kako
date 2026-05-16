import { create } from 'zustand';
import type { Session } from '@supabase/supabase-js';
import type { AppUser } from '@/lib/types';

interface AuthState {
  session: Session | null;
  profile: AppUser | null;
  initialized: boolean;
  loading: boolean;
  setSession: (session: Session | null) => void;
  setProfile: (profile: AppUser | null) => void;
  setInitialized: (initialized: boolean) => void;
  setLoading: (loading: boolean) => void;
  reset: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  session: null,
  profile: null,
  initialized: false,
  loading: false,
  setSession: (session) => set({ session }),
  setProfile: (profile) => set({ profile }),
  setInitialized: (initialized) => set({ initialized }),
  setLoading: (loading) => set({ loading }),
  reset: () => set({ session: null, profile: null, loading: false }),
}));
