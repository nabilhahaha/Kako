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
import { SalesmanShell } from '@/components/salesman/SalesmanShell';
import { MyDayPage } from '@/pages/salesman/MyDayPage';
import { JourneyPlanPage } from '@/pages/salesman/JourneyPlanPage';
import { CustomerVisitPage } from '@/pages/salesman/CustomerVisitPage';
import { NewSalePage } from '@/pages/salesman/NewSalePage';
import { ReturnPage } from '@/pages/salesman/ReturnPage';
import { CollectionPage } from '@/pages/salesman/CollectionPage';
import { InvoiceConfirmationPage } from '@/pages/salesman/InvoiceConfirmationPage';
import { InvoicesPage } from '@/pages/salesman/InvoicesPage';
import { VanStockPage } from '@/pages/salesman/VanStockPage';
import { EndDayPage } from '@/pages/salesman/EndDayPage';

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
          <Route path="settings" element={<SettingsPage />} />
          <Route path="change-password" element={<ChangePasswordPage />} />
        </Route>

        {/* VANTORA Salesman (van-sales) workflow — staging */}
        <Route path="/salesman" element={<SalesmanShell />}>
          <Route index element={<Navigate to="/salesman/my-day" replace />} />
          <Route path="my-day" element={<MyDayPage />} />
          <Route path="route" element={<JourneyPlanPage />} />
          <Route path="customer/:customerId" element={<CustomerVisitPage />} />
          <Route path="customer/:customerId/new-sale" element={<NewSalePage />} />
          <Route path="customer/:customerId/return" element={<ReturnPage />} />
          <Route path="customer/:customerId/collection" element={<CollectionPage />} />
          <Route path="invoice/:invoiceId" element={<InvoiceConfirmationPage />} />
          <Route path="invoices" element={<InvoicesPage />} />
          <Route path="van-stock" element={<VanStockPage />} />
          <Route path="end-day" element={<EndDayPage />} />
        </Route>

        <Route path="/" element={<Navigate to="/trade-spend/login" replace />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
      <Toaster />
    </>
  );
}

export default App;
