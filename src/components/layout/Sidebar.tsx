import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  Users,
  MapPin,
  CheckSquare,
  FileEdit,
  BarChart3,
  Settings,
  Shield,
  LogOut,
  Moon,
  Sun,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import { useAppStore } from '@/stores/appStore';
import { canAccessModule, ROLE_LABELS } from '@/lib/permissions';
import type { UserRole } from '@/lib/types';
import { useState } from 'react';

interface NavItem {
  module: string;
  label: string;
  path: string;
  icon: React.ComponentType<{ className?: string }>;
}

const navItems: NavItem[] = [
  { module: 'dashboard', label: 'Dashboard', path: '/dashboard', icon: LayoutDashboard },
  { module: 'customers', label: 'Customers', path: '/customers', icon: Users },
  { module: 'visits', label: 'Visits', path: '/visits', icon: MapPin },
  { module: 'approvals', label: 'Approvals', path: '/approvals', icon: CheckSquare },
  { module: 'data-requests', label: 'Data Requests', path: '/data-requests', icon: FileEdit },
  { module: 'reports', label: 'Reports', path: '/reports', icon: BarChart3 },
  { module: 'settings', label: 'Settings', path: '/settings', icon: Settings },
  { module: 'audit', label: 'Audit Log', path: '/audit', icon: Shield },
];

interface SidebarProps {
  collapsed?: boolean;
  onCollapse?: (collapsed: boolean) => void;
  mobile?: boolean;
  onClose?: () => void;
}

export default function Sidebar({ collapsed = false, onCollapse, mobile = false, onClose }: SidebarProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuthStore();
  const { darkMode, toggleDarkMode } = useAppStore();
  const [isCollapsed, setIsCollapsed] = useState(collapsed);

  const role = user?.role as UserRole | undefined;

  const visibleItems = role
    ? navItems.filter((item) => canAccessModule(role, item.module))
    : [];

  const handleCollapse = () => {
    const next = !isCollapsed;
    setIsCollapsed(next);
    onCollapse?.(next);
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const handleNavClick = () => {
    if (mobile) {
      onClose?.();
    }
  };

  return (
    <aside
      className={`flex flex-col h-full bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800 transition-all duration-300 ${
        isCollapsed && !mobile ? 'w-20' : 'w-64'
      }`}
    >
      {/* Logo Section */}
      <div className="flex items-center gap-3 px-4 h-16 border-b border-gray-200 dark:border-gray-800 shrink-0">
        <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-blue-600 text-white font-bold text-lg shrink-0">
          FF
        </div>
        {(!isCollapsed || mobile) && (
          <span className="font-semibold text-gray-900 dark:text-white text-sm leading-tight truncate">
            FMCG Field Force Pro
          </span>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-1">
        {visibleItems.map((item) => {
          const Icon = item.icon;
          const isActive = location.pathname === item.path || location.pathname.startsWith(item.path + '/');

          return (
            <Link
              key={item.module}
              to={item.path}
              onClick={handleNavClick}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400'
                  : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
              } ${isCollapsed && !mobile ? 'justify-center' : ''}`}
              title={isCollapsed && !mobile ? item.label : undefined}
            >
              <Icon className={`w-5 h-5 shrink-0 ${isActive ? 'text-blue-600 dark:text-blue-400' : ''}`} />
              {(!isCollapsed || mobile) && <span>{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      {/* Bottom Section */}
      <div className="border-t border-gray-200 dark:border-gray-800 p-3 space-y-2 shrink-0">
        {/* Dark Mode Toggle */}
        <button
          onClick={toggleDarkMode}
          className={`flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors ${
            isCollapsed && !mobile ? 'justify-center' : ''
          }`}
          title={isCollapsed && !mobile ? (darkMode ? 'Light Mode' : 'Dark Mode') : undefined}
        >
          {darkMode ? <Sun className="w-5 h-5 shrink-0" /> : <Moon className="w-5 h-5 shrink-0" />}
          {(!isCollapsed || mobile) && <span>{darkMode ? 'Light Mode' : 'Dark Mode'}</span>}
        </button>

        {/* User Info */}
        {user && (
          <div
            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg ${
              isCollapsed && !mobile ? 'justify-center' : ''
            }`}
          >
            <div className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center text-xs font-semibold shrink-0">
              {user.fullName
                .split(' ')
                .map((n) => n[0])
                .join('')
                .toUpperCase()
                .slice(0, 2)}
            </div>
            {(!isCollapsed || mobile) && (
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                  {user.fullName}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                  {ROLE_LABELS[user.role]}
                </p>
              </div>
            )}
          </div>
        )}

        {/* Logout */}
        <button
          onClick={handleLogout}
          className={`flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors ${
            isCollapsed && !mobile ? 'justify-center' : ''
          }`}
          title={isCollapsed && !mobile ? 'Logout' : undefined}
        >
          <LogOut className="w-5 h-5 shrink-0" />
          {(!isCollapsed || mobile) && <span>Logout</span>}
        </button>

        {/* Collapse Toggle (desktop only) */}
        {!mobile && (
          <button
            onClick={handleCollapse}
            className="flex items-center justify-center w-full px-3 py-2 rounded-lg text-sm text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            {isCollapsed ? <ChevronRight className="w-5 h-5" /> : <ChevronLeft className="w-5 h-5" />}
          </button>
        )}
      </div>
    </aside>
  );
}
