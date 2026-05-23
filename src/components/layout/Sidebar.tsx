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
  Crown,
  X,
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
  mobile?: boolean;
  onClose?: () => void;
  collapsed?: boolean;
  onCollapse?: () => void;
}

export default function Sidebar({ mobile = false, onClose, collapsed = false, onCollapse }: SidebarProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuthStore();
  const { darkMode, toggleDarkMode } = useAppStore();
  const [isCollapsed, setIsCollapsed] = useState(collapsed);

  const role = user?.role as UserRole | undefined;

  const visibleItems = role
    ? navItems.filter((item) => canAccessModule(role, item.module))
    : [];

  const effectiveCollapsed = isCollapsed && !mobile;

  const handleCollapse = () => {
    const next = !isCollapsed;
    setIsCollapsed(next);
    onCollapse?.();
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

  const userInitials = user
    ? user.fullName
        .split(' ')
        .map((n) => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2)
    : '';

  return (
    <aside
      className={`flex flex-col h-full transition-all duration-300 relative ${
        effectiveCollapsed ? 'w-20' : 'w-64'
      }`}
      style={{
        background: 'linear-gradient(180deg, #2D1B69 0%, #1E1145 100%)',
      }}
    >
      {/* Mobile close button */}
      {mobile && (
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1 rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition-colors z-10"
          aria-label="Close sidebar"
        >
          <X className="w-5 h-5" />
        </button>
      )}

      {/* Logo Section */}
      <div
        className={`flex items-center shrink-0 border-b border-white/10 ${
          effectiveCollapsed ? 'justify-center px-2 h-16' : 'gap-3 px-5 h-16'
        }`}
      >
        <div className="flex items-center justify-center w-9 h-9 shrink-0">
          <Crown className="w-7 h-7 text-amber-400" strokeWidth={2} />
        </div>
        {!effectiveCollapsed && (
          <div className="flex flex-col leading-tight min-w-0">
            <span className="text-white font-bold text-base tracking-wide">FMCG</span>
            <span className="text-white/60 text-[10px] font-medium tracking-widest uppercase">
              Field Force Pro
            </span>
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-1">
        {visibleItems.map((item) => {
          const Icon = item.icon;
          const isActive =
            location.pathname === item.path ||
            location.pathname.startsWith(item.path + '/');

          return (
            <Link
              key={item.module}
              to={item.path}
              onClick={handleNavClick}
              className={`group flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                isActive
                  ? 'bg-white text-[#2D1B69] shadow-md border-l-[3px] border-amber-400'
                  : 'text-white/80 hover:bg-white/10 hover:text-white border-l-[3px] border-transparent'
              } ${effectiveCollapsed ? 'justify-center px-2' : ''}`}
              title={effectiveCollapsed ? item.label : undefined}
            >
              <Icon
                className={`w-5 h-5 shrink-0 transition-colors ${
                  isActive ? 'text-[#2D1B69]' : 'text-white/70 group-hover:text-white'
                }`}
              />
              {!effectiveCollapsed && (
                <span className={isActive ? 'font-semibold' : ''}>{item.label}</span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Bottom Section */}
      <div className="border-t border-white/10 p-3 space-y-2 shrink-0">
        {/* Dark Mode Toggle */}
        <button
          onClick={toggleDarkMode}
          className={`flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm font-medium text-white/80 hover:bg-white/10 hover:text-white transition-colors ${
            effectiveCollapsed ? 'justify-center px-2' : ''
          }`}
          title={effectiveCollapsed ? (darkMode ? 'Light Mode' : 'Dark Mode') : undefined}
        >
          {darkMode ? (
            <Sun className="w-5 h-5 shrink-0 text-amber-400" />
          ) : (
            <Moon className="w-5 h-5 shrink-0 text-white/70" />
          )}
          {!effectiveCollapsed && (
            <span>{darkMode ? 'Light Mode' : 'Dark Mode'}</span>
          )}
        </button>

        {/* User Info */}
        {user && (
          <div
            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg ${
              effectiveCollapsed ? 'justify-center' : ''
            }`}
          >
            <div className="w-9 h-9 rounded-full bg-amber-400/20 border-2 border-amber-400/50 text-amber-300 flex items-center justify-center text-xs font-bold shrink-0">
              {userInitials}
            </div>
            {!effectiveCollapsed && (
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-white truncate">
                  {user.fullName}
                </p>
                <p className="text-[11px] text-white/50 truncate">
                  {ROLE_LABELS[user.role]}
                </p>
              </div>
            )}
          </div>
        )}

        {/* Logout */}
        <button
          onClick={handleLogout}
          className={`flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm font-medium text-red-300/80 hover:bg-red-500/20 hover:text-red-200 transition-colors ${
            effectiveCollapsed ? 'justify-center px-2' : ''
          }`}
          title={effectiveCollapsed ? 'Logout' : undefined}
        >
          <LogOut className="w-5 h-5 shrink-0" />
          {!effectiveCollapsed && <span>Logout</span>}
        </button>

        {/* Collapse Toggle (desktop only) */}
        {!mobile && (
          <button
            onClick={handleCollapse}
            className="flex items-center justify-center w-full px-3 py-2 rounded-lg text-sm text-white/40 hover:bg-white/10 hover:text-white/70 transition-colors"
            aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {isCollapsed ? (
              <ChevronRight className="w-5 h-5" />
            ) : (
              <ChevronLeft className="w-5 h-5" />
            )}
          </button>
        )}
      </div>
    </aside>
  );
}
