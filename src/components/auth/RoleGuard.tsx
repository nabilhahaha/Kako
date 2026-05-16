import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { hasRole } from '@/lib/permissions';
import type { UserRole } from '@/lib/types';

interface RoleGuardProps {
  allow: UserRole[];
  children: ReactNode;
}

export function RoleGuard({ allow, children }: RoleGuardProps) {
  const profile = useAuthStore((s) => s.profile);

  if (!hasRole(profile?.user_type, allow)) {
    return <Navigate to="/unauthorized" replace />;
  }

  return <>{children}</>;
}
