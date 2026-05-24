import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useEffect } from 'react';
import { useAuthBootstrap } from '@/hooks/useAuth';
import { useAuthStore } from '@/stores/authStore';
import { homeForRole } from '@/lib/permissions';
import { AuthGuard } from '@/components/auth/AuthGuard';
import { RoleGuard } from '@/components/auth/RoleGuard';
import { AppShell } from '@/components/layout/AppShell';
import { Toaster } from '@/components/ui/sonner';
import { LoginPage } from '@/pages/auth/LoginPage';
import { UnauthorizedPage } from '@/pages/UnauthorizedPage';
import { NotFoundPage } from '@/pages/NotFoundPage';
import { SalesmanDashboard } from '@/pages/salesman/SalesmanDashboard';
import { CustomersListPage } from '@/pages/salesman/CustomersListPage';
import { Customer360Page } from '@/pages/salesman/Customer360Page';
import { VisitsHistoryPage } from '@/pages/salesman/VisitsHistoryPage';
import { NearExpiryPage } from '@/pages/salesman/NearExpiryPage';
import { TeamDashboard } from '@/pages/supervisor/TeamDashboard';
import { VisitApprovalsPage } from '@/pages/supervisor/VisitApprovalsPage';
import { NearExpiryApprovalsPage } from '@/pages/supervisor/NearExpiryApprovalsPage';
import { FinancialRequestsPage } from '@/pages/supervisor/FinancialRequestsPage';
import { RegionalDashboard } from '@/pages/regional/RegionalDashboard';
import { DistributorPerformancePage } from '@/pages/regional/DistributorPerformancePage';
import { CoverageMapPage } from '@/pages/regional/CoverageMapPage';
import { ApprovalQueuePage } from '@/pages/regional/ApprovalQueuePage';
import { AdminDashboard } from '@/pages/admin/AdminDashboard';
import { UsersPage } from '@/pages/admin/UsersPage';
import { RawDataUploadPage } from '@/pages/admin/RawDataUploadPage';
import { SettingsPage } from '@/pages/admin/SettingsPage';
import { AuditLogsPage } from '@/pages/admin/AuditLogsPage';
import { FormBuilderPage } from '@/pages/admin/FormBuilderPage';
import { ActionPlansPage } from '@/pages/admin/ActionPlansPage';
import { CustomerUploadPage } from '@/pages/admin/CustomerUploadPage';
import { EnhancedVisitWizardPage } from '@/pages/salesman/EnhancedVisitWizardPage';

function RootRedirect() {
  const { initialized, session, profile } = useAuthStore();
  const location = useLocation();

  useEffect(() => {
    document.documentElement.lang = 'ar';
    document.documentElement.dir = 'rtl';
  }, []);

  if (!initialized) return null;
  if (!session) return <Navigate to="/login" replace state={{ from: location }} />;
  return <Navigate to={homeForRole(profile?.user_type)} replace />;
}

function App() {
  useAuthBootstrap();

  return (
    <>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/unauthorized" element={<UnauthorizedPage />} />

        <Route
          element={
            <AuthGuard>
              <AppShell />
            </AuthGuard>
          }
        >
          {/* المندوب: تسجيل قارب على الانتهاء فقط */}
          <Route
            path="/salesman"
            element={
              <RoleGuard allow={['presales_rep']}>
                <SalesmanDashboard />
              </RoleGuard>
            }
          />
          <Route
            path="/salesman/near-expiry"
            element={
              <RoleGuard allow={['presales_rep']}>
                <NearExpiryPage />
              </RoleGuard>
            }
          />

          {/* المشرف: تسجيل الزيارات + إدارة الفريق */}
          <Route
            path="/supervisor"
            element={
              <RoleGuard allow={['presales_supervisor', 'cashvan_supervisor']}>
                <TeamDashboard />
              </RoleGuard>
            }
          />
          <Route
            path="/supervisor/customers"
            element={
              <RoleGuard allow={['presales_supervisor', 'cashvan_supervisor']}>
                <CustomersListPage />
              </RoleGuard>
            }
          />
          <Route
            path="/supervisor/customers/:customerId"
            element={
              <RoleGuard allow={['presales_supervisor', 'cashvan_supervisor']}>
                <Customer360Page />
              </RoleGuard>
            }
          />
          <Route
            path="/supervisor/visits"
            element={
              <RoleGuard allow={['presales_supervisor', 'cashvan_supervisor']}>
                <VisitsHistoryPage />
              </RoleGuard>
            }
          />
          <Route
            path="/supervisor/visits/new"
            element={
              <RoleGuard allow={['presales_supervisor', 'cashvan_supervisor']}>
                <EnhancedVisitWizardPage />
              </RoleGuard>
            }
          />
          <Route
            path="/supervisor/approvals/visits"
            element={
              <RoleGuard allow={['presales_supervisor', 'cashvan_supervisor']}>
                <VisitApprovalsPage />
              </RoleGuard>
            }
          />
          <Route
            path="/supervisor/approvals/near-expiry"
            element={
              <RoleGuard allow={['presales_supervisor', 'cashvan_supervisor']}>
                <NearExpiryApprovalsPage />
              </RoleGuard>
            }
          />
          <Route
            path="/supervisor/financial-requests"
            element={
              <RoleGuard allow={['presales_supervisor', 'cashvan_supervisor']}>
                <FinancialRequestsPage />
              </RoleGuard>
            }
          />
          <Route
            path="/regional"
            element={
              <RoleGuard allow={['regional_manager_roshen']}>
                <RegionalDashboard />
              </RoleGuard>
            }
          />
          <Route
            path="/regional/distributor"
            element={
              <RoleGuard allow={['regional_manager_roshen']}>
                <DistributorPerformancePage />
              </RoleGuard>
            }
          />
          <Route
            path="/regional/coverage"
            element={
              <RoleGuard allow={['regional_manager_roshen']}>
                <CoverageMapPage />
              </RoleGuard>
            }
          />
          <Route
            path="/regional/approvals"
            element={
              <RoleGuard allow={['regional_manager_roshen']}>
                <ApprovalQueuePage />
              </RoleGuard>
            }
          />
          <Route
            path="/admin"
            element={
              <RoleGuard allow={['admin_relia']}>
                <AdminDashboard />
              </RoleGuard>
            }
          />
          <Route
            path="/admin/users"
            element={
              <RoleGuard allow={['admin_relia']}>
                <UsersPage />
              </RoleGuard>
            }
          />
          <Route
            path="/admin/raw-data"
            element={
              <RoleGuard allow={['admin_relia']}>
                <RawDataUploadPage />
              </RoleGuard>
            }
          />
          <Route
            path="/admin/settings"
            element={
              <RoleGuard allow={['admin_relia']}>
                <SettingsPage />
              </RoleGuard>
            }
          />
          <Route
            path="/admin/audit"
            element={
              <RoleGuard allow={['admin_relia']}>
                <AuditLogsPage />
              </RoleGuard>
            }
          />
          <Route
            path="/admin/forms"
            element={
              <RoleGuard allow={['admin_relia']}>
                <FormBuilderPage />
              </RoleGuard>
            }
          />
          <Route
            path="/admin/action-plans"
            element={
              <RoleGuard allow={['admin_relia', 'presales_supervisor', 'cashvan_supervisor', 'regional_manager_roshen']}>
                <ActionPlansPage />
              </RoleGuard>
            }
          />
          <Route
            path="/admin/customers-upload"
            element={
              <RoleGuard allow={['admin_relia']}>
                <CustomerUploadPage />
              </RoleGuard>
            }
          />
        </Route>

        <Route path="/" element={<RootRedirect />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
      <Toaster />
    </>
  );
}

export default App;
