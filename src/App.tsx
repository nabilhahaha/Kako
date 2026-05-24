import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useEffect } from 'react';
import { useAuthBootstrap } from '@/hooks/useAuth';
import { useAuthStore } from '@/stores/authStore';
import { AuthGuard } from '@/components/auth/AuthGuard';
import { AppShell } from '@/components/layout/AppShell';
import { Toaster } from '@/components/ui/sonner';
import { LoginPage } from '@/pages/auth/LoginPage';
import { NotFoundPage } from '@/pages/NotFoundPage';
import { AdminDashboard } from '@/pages/admin/AdminDashboard';
import { UsersPage } from '@/pages/admin/UsersPage';
import { SettingsPage } from '@/pages/admin/SettingsPage';
import { CustomerUploadPage } from '@/pages/admin/CustomerUploadPage';
import { AuditLogsPage } from '@/pages/admin/AuditLogsPage';

function RootRedirect() {
  const { initialized, session } = useAuthStore();
  const location = useLocation();

  useEffect(() => {
    document.documentElement.lang = 'ar';
    document.documentElement.dir = 'rtl';
  }, []);

  if (!initialized) return null;
  if (!session) return <Navigate to="/login" replace state={{ from: location }} />;
  return <Navigate to="/admin" replace />;
}

function App() {
  useAuthBootstrap();

  return (
    <>
      <Routes>
        <Route path="/login" element={<LoginPage />} />

        <Route
          element={
            <AuthGuard>
              <AppShell />
            </AuthGuard>
          }
        >
          <Route path="/admin" element={<AdminDashboard />} />
          <Route path="/admin/users" element={<UsersPage />} />
          <Route path="/admin/settings" element={<SettingsPage />} />
          <Route path="/admin/customers-upload" element={<CustomerUploadPage />} />
          <Route path="/admin/audit" element={<AuditLogsPage />} />
        </Route>

        <Route path="/" element={<RootRedirect />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
      <Toaster />
    </>
  );
}

export default App;
