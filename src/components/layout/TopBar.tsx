import { Menu, Bell, Moon, Sun } from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import { useAppStore } from '@/stores/appStore';
import { ROLE_LABELS } from '@/lib/permissions';
import { useLocation } from 'react-router-dom';

const ROUTE_TITLES: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/customers': 'Customers',
  '/visits': 'Visits',
  '/visits/new': 'New Visit',
  '/approvals': 'Approvals',
  '/data-requests': 'Data Requests',
  '/reports': 'Reports',
  '/settings': 'Settings',
  '/audit': 'Audit Log',
};

function getPageTitle(pathname: string): string {
  // Try exact match first
  if (ROUTE_TITLES[pathname]) return ROUTE_TITLES[pathname];
  // Try matching the longest prefix (handles sub-routes like /visits/new)
  const sorted = Object.keys(ROUTE_TITLES).sort((a, b) => b.length - a.length);
  for (const route of sorted) {
    if (pathname.startsWith(route)) return ROUTE_TITLES[route];
  }
  return 'FMCG Field Force Pro';
}

function getUserInitials(fullName: string): string {
  return fullName
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

interface TopBarProps {
  onMenuToggle?: () => void;
}

export default function TopBar({ onMenuToggle }: TopBarProps) {
  const { user } = useAuthStore();
  const { darkMode, toggleDarkMode } = useAppStore();
  const location = useLocation();

  const pageTitle = getPageTitle(location.pathname);

  return (
    <header className="relative flex items-center justify-between h-14 px-4 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 shadow-sm shrink-0">
      {/* Left: Hamburger */}
      <div className="flex items-center gap-3">
        <button
          onClick={onMenuToggle}
          className="lg:hidden p-2 rounded-md text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
          aria-label="Toggle menu"
        >
          <Menu className="w-5 h-5" />
        </button>
        <h1 className="hidden lg:block text-lg font-semibold text-gray-900 dark:text-white tracking-tight">
          {pageTitle}
        </h1>
      </div>

      {/* Center: Page Title (mobile only) */}
      <h1 className="lg:hidden absolute left-1/2 -translate-x-1/2 text-base font-semibold text-gray-900 dark:text-white tracking-tight">
        {pageTitle}
      </h1>

      {/* Right: Notifications, Dark Mode, User */}
      <div className="flex items-center gap-1">
        {/* Notification Bell */}
        <button
          className="relative p-2 rounded-md text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
          aria-label="Notifications"
        >
          <Bell className="w-5 h-5" />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full ring-2 ring-white dark:ring-gray-900" />
        </button>

        {/* Dark Mode Toggle */}
        <button
          onClick={toggleDarkMode}
          className="p-2 rounded-md text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
          aria-label="Toggle dark mode"
        >
          {darkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
        </button>

        {/* User Avatar & Name */}
        {user && (
          <div className="flex items-center gap-2.5 ml-2 pl-3 border-l border-gray-200 dark:border-gray-700">
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold text-white shrink-0"
              style={{ backgroundColor: '#6D28D9' }}
            >
              {getUserInitials(user.fullName)}
            </div>
            <div className="hidden md:block">
              <p className="text-sm font-medium text-gray-900 dark:text-white leading-tight">
                {user.fullName}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 leading-tight">
                {ROLE_LABELS[user.role]}
              </p>
            </div>
          </div>
        )}
      </div>
    </header>
  );
}
