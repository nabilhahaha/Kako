import { Routes, Route } from 'react-router-dom';
import { AppShell } from '@/components/layout/AppShell';
import { HomePage } from '@/pages/HomePage';
import { VisitsPage } from '@/pages/VisitsPage';
import { MapPage } from '@/pages/MapPage';
import { DashboardsPage } from '@/pages/DashboardsPage';
import { MorePage } from '@/pages/MorePage';

export default function App() {
  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/visits" element={<VisitsPage />} />
        <Route path="/map" element={<MapPage />} />
        <Route path="/dashboards" element={<DashboardsPage />} />
        <Route path="/more" element={<MorePage />} />
      </Routes>
    </AppShell>
  );
}
