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
          <Route path="upload" element={<ErrorBoundary><DataUploadPage /></ErrorBoundary>} />
          <Route path="users" element={<TradeSpendUsersPage />} />
        </Route>

        <Route path="/" element={<Navigate to="/trade-spend/login" replace />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
      <Toaster />
    </>
  );
}

export default App;
