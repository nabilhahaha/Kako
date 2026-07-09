/** Route tree for the Supply Chain Validation module, mounted at /supply-chain. */
import { Route, Routes } from 'react-router-dom';
import { SupplyChainShell } from './components/SupplyChainShell';
import { OverviewPage } from './pages/OverviewPage';
import { PiDetailPage } from './pages/PiDetailPage';
import { DeliveryNotesPage } from './pages/DeliveryNotesPage';
import { InvoicesPage } from './pages/InvoicesPage';
import { InvoiceValidationPage } from './pages/InvoiceValidationPage';
import { ExceptionsPage } from './pages/ExceptionsPage';
import { AuditLogPage } from './pages/AuditLogPage';
import { SettingsPage } from './pages/SettingsPage';

export function SupplyChainApp() {
  return (
    <Routes>
      <Route element={<SupplyChainShell />}>
        <Route index element={<OverviewPage />} />
        <Route path="pi/:id" element={<PiDetailPage />} />
        <Route path="delivery-notes" element={<DeliveryNotesPage />} />
        <Route path="invoices" element={<InvoicesPage />} />
        <Route path="invoice-validation" element={<InvoiceValidationPage />} />
        <Route path="exceptions" element={<ExceptionsPage />} />
        <Route path="audit" element={<AuditLogPage />} />
        <Route path="settings" element={<SettingsPage />} />
      </Route>
    </Routes>
  );
}
