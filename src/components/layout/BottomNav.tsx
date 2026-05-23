import { Link, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Users,
  MapPin,
  CheckSquare,
  FileEdit,
  BarChart3,
  Settings,
  Shield,
} from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import { canAccessModule } from '@/lib/permissions';
import type { UserRole } from '@/lib/types';

interface BottomNavItem {
  module: string;
  label: string;
  path: string;
  icon: React.ComponentType<{ className?: string }>;
}

const allNavItems: BottomNavItem[] = [
  { module: 'dashboard', label: 'Dashboard', path: '/dashboard', icon: LayoutDashboard },
  { module: 'customers', label: 'Customers', path: '/customers', icon: Users },
  { module: 'visits', label: 'Visits', path: '/visits', icon: MapPin },
  { module: 'approvals', label: 'Approvals', path: '/approvals', icon: CheckSquare },
  { module: 'data-requests', label: 'Requests', path: '/data-requests', icon: FileEdit },
  { module: 'reports', label: 'Reports', path: '/reports', icon: BarChart3 },
  { module: 'settings', label: 'Settings', path: '/settings', icon: Settings },
  { module: 'audit', label: 'Audit', path: '/audit', icon: Shield },
];

const roleBottomModules: Record<string, string[]> = {
  merchandiser: ['dashboard', 'customers', 'visits', 'data-requests'],
  supervisor: ['dashboard', 'customers', 'visits', 'approvals', 'reports'],
  default: ['dashboard', 'customers', 'approvals', 'reports', 'settings'],
};

function getBottomItems(role: UserRole): BottomNavItem[] {
  const preferredModules = roleBottomModules[role] ?? roleBottomModules.default;

  return preferredModules
    .filter((mod) => canAccessModule(role, mod))
    .map((mod) => allNavItems.find((item) => item.module === mod)!)
    .filter(Boolean)
    .slice(0, 5);
}

export default function BottomNav() {
  const location = useLocation();
  const { user } = useAuthStore();

  if (!user) return null;

  const items = getBottomItems(user.role);

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800 lg:hidden">
      <div className="flex items-center justify-around h-16 px-2">
        {items.map((item) => {
          const Icon = item.icon;
          const isActive = location.pathname === item.path || location.pathname.startsWith(item.path + '/');

          return (
            <Link
              key={item.module}
              to={item.path}
              className={`flex flex-col items-center justify-center flex-1 h-full gap-1 text-xs font-medium transition-colors ${
                isActive
                  ? 'text-blue-600 dark:text-blue-400'
                  : 'text-gray-500 dark:text-gray-400'
              }`}
            >
              <Icon className={`w-5 h-5 ${isActive ? 'text-blue-600 dark:text-blue-400' : ''}`} />
              <span className="truncate max-w-[64px]">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
