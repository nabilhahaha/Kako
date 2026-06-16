import { create } from 'zustand';

export type Role =
  | 'platform_admin'
  | 'business_manager'
  | 'regional_manager'
  | 'area_manager'
  | 'supervisor'
  | 'field_user'
  | 'viewer';

export interface SessionProfile {
  userId: string;
  fullName: string;
  email: string;
  role: Role;
  regionId: string | null;
  areaId: string | null;
  isActive: boolean;
}

interface SessionState {
  profile: SessionProfile | null;
  loading: boolean;
  setProfile: (p: SessionProfile | null) => void;
  setLoading: (v: boolean) => void;
  clear: () => void;
}

export const useSession = create<SessionState>((set) => ({
  profile: null,
  loading: true,
  setProfile: (p) => set({ profile: p, loading: false }),
  setLoading: (v) => set({ loading: v }),
  clear: () => set({ profile: null, loading: false }),
}));
