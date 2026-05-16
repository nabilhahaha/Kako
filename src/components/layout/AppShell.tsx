import { Outlet } from 'react-router-dom';
import { TopBar } from './TopBar';
import { Sidebar } from './Sidebar';
import { BottomNav } from './BottomNav';
import { useAuthStore } from '@/stores/authStore';

export function AppShell() {
  const role = useAuthStore((s) => s.profile?.user_type ?? null);

  return (
    <div className="min-h-screen bg-background">
      <TopBar />
      <div className="flex">
        <Sidebar role={role} />
        <main
          className="flex-1 px-4 pb-24 pt-6 lg:px-8 lg:pb-8"
          style={{ minHeight: 'calc(100vh - 4rem)' }}
        >
          <div className="mx-auto w-full max-w-[1280px] animate-fade-in">
            <Outlet />
          </div>
        </main>
      </div>
      <BottomNav role={role} />
    </div>
  );
}
