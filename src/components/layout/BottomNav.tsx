import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  Users,
  MapPin,
  CheckSquare,
  BarChart3,
  FileEdit,
  Plus,
} from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import { canAccessModule } from '@/lib/permissions';
import type { UserRole } from '@/lib/types';

interface NavItem {
  module: string;
  label: string;
  path: string;
  icon: React.ComponentType<{ className?: string }>;
}

// Items available for bottom nav slots (excluding the center FAB)
const navItemMap: Record<string, NavItem> = {
  dashboard: { module: 'dashboard', label: 'Dashboard', path: '/dashboard', icon: LayoutDashboard },
  visits: { module: 'visits', label: 'Visits', path: '/visits', icon: MapPin },
  customers: { module: 'customers', label: 'Customers', path: '/customers', icon: Users },
  approvals: { module: 'approvals', label: 'Approvals', path: '/approvals', icon: CheckSquare },
  reports: { module: 'reports', label: 'Reports', path: '/reports', icon: BarChart3 },
  'data-requests': { module: 'data-requests', label: 'More', path: '/data-requests', icon: FileEdit },
};

/**
 * Returns the 4 side nav items (2 left, 2 right of FAB) based on user role.
 *
 * Merchandiser:  Dashboard, Visits, [+], Customers, More (data-requests)
 * Supervisor:    Dashboard, Visits, [+], Approvals, Reports
 * Others:        Dashboard, Customers, [+], Approvals, Reports
 */
function getSideItems(role: UserRole): [NavItem[], NavItem[]] {
  let leftKeys: string[];
  let rightKeys: string[];

  if (role === 'merchandiser') {
    leftKeys = ['dashboard', 'visits'];
    rightKeys = ['customers', 'data-requests'];
  } else if (role === 'supervisor') {
    leftKeys = ['dashboard', 'visits'];
    rightKeys = ['approvals', 'reports'];
  } else {
    // admin, manager, data_team
    leftKeys = ['dashboard', 'customers'];
    rightKeys = ['approvals', 'reports'];
  }

  const toItems = (keys: string[]) =>
    keys
      .filter((key) => canAccessModule(role, key))
      .map((key) => navItemMap[key])
      .filter(Boolean);

  return [toItems(leftKeys), toItems(rightKeys)];
}

export default function BottomNav() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuthStore();

  if (!user) return null;

  const [leftItems, rightItems] = getSideItems(user.role);

  const isActive = (path: string) =>
    location.pathname === path || location.pathname.startsWith(path + '/');

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-gray-200 shadow-lg lg:hidden">
      <div className="flex items-center justify-around h-16 px-2 pb-[env(safe-area-inset-bottom)]">
        {/* ---- Left side items ---- */}
        {leftItems.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.path);
          return (
            <Link
              key={item.module}
              to={item.path}
              className={`flex flex-col items-center justify-center flex-1 h-full gap-0.5 transition-all duration-200 ${
                active ? 'scale-105' : ''
              }`}
            >
              <Icon
                className={`w-5 h-5 transition-colors ${
                  active ? 'text-[#6D28D9]' : 'text-gray-400'
                }`}
              />
              <span
                className={`text-[10px] font-medium leading-tight transition-colors ${
                  active ? 'text-[#6D28D9]' : 'text-gray-400'
                }`}
              >
                {item.label}
              </span>
            </Link>
          );
        })}

        {/* ---- Center FAB ---- */}
        <div className="flex flex-col items-center justify-center flex-1">
          <button
            onClick={() => navigate('/visits/new')}
            className="relative -mt-8 flex items-center justify-center w-14 h-14 rounded-full shadow-lg active:scale-95 transition-transform duration-150"
            style={{
              background: 'linear-gradient(135deg, #6D28D9 0%, #4C1D95 100%)',
            }}
            aria-label="New Visit"
          >
            <Plus className="w-7 h-7 text-white" strokeWidth={2.5} />
          </button>
        </div>

        {/* ---- Right side items ---- */}
        {rightItems.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.path);
          return (
            <Link
              key={item.module}
              to={item.path}
              className={`flex flex-col items-center justify-center flex-1 h-full gap-0.5 transition-all duration-200 ${
                active ? 'scale-105' : ''
              }`}
            >
              <Icon
                className={`w-5 h-5 transition-colors ${
                  active ? 'text-[#6D28D9]' : 'text-gray-400'
                }`}
              />
              <span
                className={`text-[10px] font-medium leading-tight transition-colors ${
                  active ? 'text-[#6D28D9]' : 'text-gray-400'
                }`}
              >
                {item.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
