import { LogOut } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { signOut } from '@/hooks/useAuth';
import { ROLE_LABELS_AR } from '@/lib/permissions';
import { initialsFromEmail } from '@/lib/utils';
import { useAuthStore } from '@/stores/authStore';

export function TopBar() {
  const navigate = useNavigate();
  const profile = useAuthStore((s) => s.profile);
  const session = useAuthStore((s) => s.session);

  const email = profile?.email ?? session?.user?.email ?? '';
  const fullName = profile?.full_name ?? email;
  const roleLabel = profile?.user_type ? ROLE_LABELS_AR[profile.user_type] : 'مستخدم';

  async function handleLogout() {
    await signOut();
    toast.success('تم تسجيل الخروج');
    navigate('/login', { replace: true });
  }

  return (
    <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-border bg-card/95 px-4 backdrop-blur lg:px-6">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <span className="text-sm font-bold">FS</span>
        </div>
        <div className="hidden sm:block">
          <p className="text-h3 leading-tight text-foreground">FieldSync</p>
          <p className="text-caption">Roshen × Relia</p>
        </div>
      </div>

      <div className="flex items-center gap-2 sm:gap-3">
        <div className="hidden text-end sm:block">
          <p className="text-sm font-medium text-foreground leading-tight">{fullName}</p>
          <Badge variant="secondary" className="mt-1 font-normal">
            {roleLabel}
          </Badge>
        </div>
        <Avatar className="h-9 w-9 border border-border">
          <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
            {initialsFromEmail(email)}
          </AvatarFallback>
        </Avatar>
        <Button variant="ghost" size="icon" onClick={handleLogout} aria-label="تسجيل الخروج">
          <LogOut className="h-4 w-4" />
        </Button>
      </div>
    </header>
  );
}
