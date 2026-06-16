import { create } from 'zustand';

export type Role =
  | 'platform_admin'
  | 'business_manager'
  | 'regional_manager'
  | 'area_manager'
  | 'supervisor'
  | 'field_user'
  | 'viewer';

interface SessionState {
  userId: string | null;
  fullName: string | null;
  role: Role | null;
  setSession: (s: { userId: string; fullName: string; role: Role }) => void;
  clear: () => void;
}

export const useSession = create<SessionState>((set) => ({
  userId: null,
  fullName: null,
  role: null,
  setSession: (s) => set({ userId: s.userId, fullName: s.fullName, role: s.role }),
  clear: () => set({ userId: null, fullName: null, role: null }),
}));
