import { ShieldAlert } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { signOut } from '@/hooks/useAuth';

export function UnauthorizedPage() {
  const navigate = useNavigate();

  async function handleLogout() {
    await signOut();
    navigate('/login', { replace: true });
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="max-w-md space-y-4 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-warning/10 text-warning">
          <ShieldAlert className="h-7 w-7" />
        </div>
        <h1 className="text-h1 text-foreground">لا تملك صلاحية الوصول</h1>
        <p className="text-sm text-muted-foreground">
          حسابك غير مرتبط بأي دور في النظام. تواصل مع المشرف لإضافة الصلاحيات اللازمة.
        </p>
        <Button onClick={handleLogout} variant="outline" className="mt-4">
          تسجيل الخروج
        </Button>
      </div>
    </div>
  );
}
