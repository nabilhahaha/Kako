import { Suspense, lazy } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { Toaster } from '@/components/ui/sonner';
import { NotFoundPage } from '@/pages/NotFoundPage';
import { TradeSpendShell } from '@/components/trade-spend/TradeSpendShell';
import { DashboardPage } from '@/pages/trade-spend/DashboardPage';
import { NewRequestPage } from '@/pages/trade-spend/NewRequestPage';
import { RequestsPage } from '@/pages/trade-spend/RequestsPage';
import { CustomerSummaryPage } from '@/pages/trade-spend/CustomerSummaryPage';
import { CustomerDetailPage } from '@/pages/trade-spend/CustomerDetailPage';
import { DataUploadPage } from '@/pages/trade-spend/DataUploadPage';
import { TradeSpendLoginPage } from '@/pages/trade-spend/TradeSpendLoginPage';
import { UsersPage as TradeSpendUsersPage } from '@/pages/trade-spend/UsersPage';
import { ApprovalsPage } from '@/pages/trade-spend/ApprovalsPage';
import { ErrorBoundary } from '@/components/trade-spend/ErrorBoundary';
import { SettingsPage } from '@/pages/trade-spend/SettingsPage';
import { ChangePasswordPage } from '@/pages/trade-spend/ChangePasswordPage';

// Lazy: the Promotions module carries the frozen engines + audited data
// bundles (~1 MB) in their own chunk, loaded only when the module is opened.
const PromotionsPage = lazy(() => import('@/pages/trade-spend/PromotionsPage'));

function App() {
  return (
    <>
      <Routes>
        {/* Trade Spend Platform */}
        <Route path="/trade-spend/login" element={<TradeSpendLoginPage />} />
        <Route path="/trade-spend" element={<TradeSpendShell />}>
          <Route index element={<DashboardPage />} />
          <Route path="new-request" element={<NewRequestPage />} />
          <Route path="requests" element={<RequestsPage />} />
          <Route path="approvals" element={<ApprovalsPage />} />
          <Route path="customers" element={<CustomerSummaryPage />} />
          <Route path="customers/:account" element={<CustomerDetailPage />} />
          <Route
            path="promotions"
            element={
              <ErrorBoundary>
                <Suspense fallback={<div className="p-6 text-sm text-muted-foreground">Loading…</div>}>
                  <PromotionsPage />
                </Suspense>
              </ErrorBoundary>
            }
          />
          <Route path="upload" element={<ErrorBoundary><DataUploadPage /></ErrorBoundary>} />
          <Route path="users" element={<TradeSpendUsersPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="change-password" element={<ChangePasswordPage />} />
        </Route>

        <Route path="/" element={<Navigate to="/trade-spend/login" replace />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
      <Toaster />
    </>
  );
}

export default App;
