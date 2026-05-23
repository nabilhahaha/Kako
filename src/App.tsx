import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { homeForRole, canAccessModule } from '@/lib/permissions';
import AppShell from '@/components/layout/AppShell';
import { Toaster } from '@/components/ui/sonner';
import { LoginPage } from '@/pages/auth/LoginPage';
import { DashboardPage } from '@/pages/dashboard/DashboardPage';
import { CustomerListPage } from '@/pages/customers/CustomerListPage';
import { VisitRegistrationPage } from '@/pages/visits/VisitRegistrationPage';
import { VisitHistoryPage } from '@/pages/visits/VisitHistoryPage';
import { ApprovalsPage } from '@/pages/approvals/ApprovalsPage';
import { DataRequestPage } from '@/pages/data-requests/DataRequestPage';
import { ReportsPage } from '@/pages/reports/ReportsPage';
import { SettingsPage } from '@/pages/settings/SettingsPage';
import { AuditLogPage } from '@/pages/audit/AuditLogPage';

function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user } = useAuthStore();
  const location = useLocation();
  if (!user) return <Navigate to="/login" replace state={{ from: location }} />;
  return <>{children}</>;
}

function RoleGuard({ module, children }: { module: string; children: React.ReactNode }) {
  const { user } = useAuthStore();
  if (!user || !canAccessModule(user.role, module)) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="mb-4 text-6xl text-gray-300">403</div>
        <h2 className="mb-2 text-xl font-bold text-gray-900 dark:text-white">Access Denied</h2>
        <p className="text-gray-500 dark:text-gray-400">You don&apos;t have permission to access this page.</p>
      </div>
    );
  }
  return <>{children}</>;
}

function RootRedirect() {
  const { user } = useAuthStore();
  if (!user) return <Navigate to="/login" replace />;
  return <Navigate to={homeForRole(user.role)} replace />;
}

function NotFoundPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 p-4 dark:bg-gray-950">
      <div className="text-8xl font-bold text-gray-200 dark:text-gray-800">404</div>
      <h1 className="mt-4 text-xl font-bold text-gray-900 dark:text-white">Page Not Found</h1>
      <p className="mt-2 text-gray-500">The page you&apos;re looking for doesn&apos;t exist.</p>
      <a href="/" className="mt-6 rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700">
        Go Home
      </a>
    </div>
  );
}

function App() {
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
          <Route path="/dashboard" element={<RoleGuard module="dashboard"><DashboardPage /></RoleGuard>} />
          <Route path="/customers" element={<RoleGuard module="customers"><CustomerListPage /></RoleGuard>} />
          <Route path="/visits" element={<RoleGuard module="visits"><VisitHistoryPage /></RoleGuard>} />
          <Route path="/visits/new" element={<RoleGuard module="visits"><VisitRegistrationPage /></RoleGuard>} />
          <Route path="/approvals" element={<RoleGuard module="approvals"><ApprovalsPage /></RoleGuard>} />
          <Route path="/data-requests" element={<RoleGuard module="data-requests"><DataRequestPage /></RoleGuard>} />
          <Route path="/reports" element={<RoleGuard module="reports"><ReportsPage /></RoleGuard>} />
          <Route path="/settings" element={<RoleGuard module="settings"><SettingsPage /></RoleGuard>} />
          <Route path="/audit" element={<RoleGuard module="audit"><AuditLogPage /></RoleGuard>} />
        </Route>

        <Route path="/" element={<RootRedirect />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
      <Toaster />
    </>
  );
}

export default App;
