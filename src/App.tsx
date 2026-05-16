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
import { PlaceholderPage } from '@/pages/PlaceholderPage';

function RootRedirect() {
  const { initialized, session, profile } = useAuthStore();
  const location = useLocation();

  useEffect(() => {
    document.documentElement.lang = 'ar';
    document.documentElement.dir = 'rtl';
  }, []);

  if (!initialized) return null;
  if (!session) return <Navigate to="/login" replace state={{ from: location }} />;
  return <Navigate to={homeForRole(profile?.role)} replace />;
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
          <Route
            path="/salesman/*"
            element={
              <RoleGuard allow={['presales_rep']}>
                <PlaceholderPage
                  title="لوحة تحكم المندوب"
                  description="المؤشرات الشخصية، العملاء، الزيارات"
                  phase={2}
                />
              </RoleGuard>
            }
          />
          <Route
            path="/supervisor/*"
            element={
              <RoleGuard allow={['presales_supervisor', 'cashvan_supervisor']}>
                <PlaceholderPage
                  title="لوحة المشرف"
                  description="فريقك، الموافقات، الخريطة المباشرة"
                  phase={3}
                />
              </RoleGuard>
            }
          />
          <Route
            path="/regional/*"
            element={
              <RoleGuard allow={['regional_manager_roshen']}>
                <PlaceholderPage
                  title="لوحة المدير الإقليمي"
                  description="أداء الإقليم وتغطية العملاء"
                  phase={4}
                />
              </RoleGuard>
            }
          />
          <Route
            path="/trade-marketing/*"
            element={
              <RoleGuard allow={['trade_marketing_manager']}>
                <PlaceholderPage
                  title="التسويق التجاري"
                  description="العروض، التحليلات، ROI"
                  phase={4}
                />
              </RoleGuard>
            }
          />
          <Route
            path="/executive/*"
            element={
              <RoleGuard allow={['top_management_relia', 'top_management_roshen']}>
                <PlaceholderPage
                  title="لوحة التنفيذيين"
                  description="مؤشرات استراتيجية وتنبيهات ذكية"
                  phase={5}
                />
              </RoleGuard>
            }
          />
          <Route
            path="/admin/*"
            element={
              <RoleGuard allow={['admin_relia']}>
                <PlaceholderPage
                  title="إدارة النظام"
                  description="المستخدمون، البيانات الخام، الإعدادات"
                  phase={5}
                />
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
