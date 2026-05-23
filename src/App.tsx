import { Navigate, Route, Routes } from 'react-router-dom';
import { useEffect } from 'react';
import { Toaster } from '@/components/ui/sonner';
import { SalesDashboardPage } from '@/pages/sales/SalesDashboardPage';
import { NotFoundPage } from '@/pages/NotFoundPage';

function App() {
  useEffect(() => {
    document.documentElement.lang = 'en';
    document.documentElement.dir = 'ltr';
  }, []);

  return (
    <>
      <Routes>
        <Route path="/" element={<Navigate to="/sales-dashboard" replace />} />
        <Route path="/sales-dashboard" element={<SalesDashboardPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
      <Toaster />
    </>
  );
}

export default App;
