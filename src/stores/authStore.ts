import { create } from 'zustand';
import type { AppUser } from '@/lib/types';

interface AuthState {
  user: AppUser | null;
  initialized: boolean;
  setUser: (user: AppUser | null) => void;
  setInitialized: (v: boolean) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  initialized: false,
  setUser: (user) => set({ user, initialized: true }),
  setInitialized: (initialized) => set({ initialized }),
  logout: () => set({ user: null }),
}));
