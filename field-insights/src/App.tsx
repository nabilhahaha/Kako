import { Routes, Route } from 'react-router-dom';
import { AppShell } from '@/components/layout/AppShell';
import { LoginPage } from '@/pages/LoginPage';
import { HomePage } from '@/pages/HomePage';
import { VisitsPage } from '@/pages/VisitsPage';
import { MapPage } from '@/pages/MapPage';
import { DashboardsPage } from '@/pages/DashboardsPage';
import { MorePage } from '@/pages/MorePage';
import { CustomersPage } from '@/pages/CustomersPage';
import { useSession } from '@/stores/session';

export default function App() {
  const { profile, loading } = useSession();

  if (loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center text-sm text-muted-foreground">
        Loading…
      </div>
    );
  }

  if (!profile) {
    return <LoginPage />;
  }

  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/visits" element={<VisitsPage />} />
        <Route path="/map" element={<MapPage />} />
        <Route path="/dashboards" element={<DashboardsPage />} />
        <Route path="/more" element={<MorePage />} />
        <Route path="/customers" element={<CustomersPage />} />
      </Routes>
    </AppShell>
  );
}
