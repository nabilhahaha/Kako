import { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Loader2, Users, ChevronDown } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { homeForRole, ROLE_LABELS_AR } from '@/lib/permissions';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import type { AppUser, UserRole } from '@/lib/types';
import type { Session } from '@supabase/supabase-js';

const DEMO_USERS: AppUser[] = [
  { id: 'demo-admin', email: 'admin@roshen.com', full_name: 'مدير النظام', user_type: 'admin_relia', region: 'الرياض', supervisor_id: null, is_active: true },
  { id: 'demo-rep', email: 'rep@roshen.com', full_name: 'أحمد المندوب', user_type: 'presales_rep', region: 'الرياض', supervisor_id: null, is_active: true },
  { id: 'demo-supervisor', email: 'supervisor@roshen.com', full_name: 'خالد المشرف', user_type: 'presales_supervisor', region: 'الرياض', supervisor_id: null, is_active: true },
  { id: 'demo-cashvan', email: 'cashvan@roshen.com', full_name: 'سعد مشرف الكاش فان', user_type: 'cashvan_supervisor', region: 'جدة', supervisor_id: null, is_active: true },
  { id: 'demo-regional', email: 'regional@roshen.com', full_name: 'محمد المدير الإقليمي', user_type: 'regional_manager_roshen', region: 'الرياض', supervisor_id: null, is_active: true },
];

export function LoginForm() {
  const navigate = useNavigate();
  const location = useLocation();
  const { setSession, setProfile, setInitialized } = useAuthStore();
  const [users, setUsers] = useState<AppUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const from = (location.state as { from?: { pathname: string } } | null)?.from?.pathname;

  useEffect(() => {
    async function fetchUsers() {
      const { data, error } = await supabase
        .from('users')
        .select('id, email, full_name, user_type, region, supervisor_id, is_active')
        .eq('is_active', true)
        .order('user_type')
        .order('full_name');
      if (error || !data || data.length === 0) {
        if (error) console.warn('failed to fetch users, using demo list', error);
        setUsers(DEMO_USERS);
      } else {
        setUsers(data as AppUser[]);
      }
      setLoading(false);
    }
    fetchUsers();
  }, []);

  const selectedUser = users.find((u) => u.id === selectedId);

  async function handleLogin() {
    if (!selectedUser) {
      toast.error('اختر مستخدماً أولاً');
      return;
    }
    setSubmitting(true);

    const mockSession = {
      access_token: 'demo-token',
      refresh_token: 'demo-refresh',
      expires_in: 999999,
      token_type: 'bearer',
      user: {
        id: selectedUser.id,
        email: selectedUser.email,
        aud: 'authenticated',
        role: 'authenticated',
        app_metadata: {},
        user_metadata: {},
        created_at: new Date().toISOString(),
      },
    } as unknown as Session;

    setSession(mockSession);
    setProfile(selectedUser);
    setInitialized(true);

    toast.success(`مرحباً ${selectedUser.full_name || selectedUser.email}`);
    const target = from && from !== '/login' ? from : homeForRole(selectedUser.user_type);
    navigate(target, { replace: true });
    setSubmitting(false);
  }

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <Label>اختر المستخدم</Label>
        {loading ? (
          <div className="flex items-center justify-center gap-2 rounded-lg border border-border p-4">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            <span className="text-sm text-muted-foreground">جاري تحميل المستخدمين...</span>
          </div>
        ) : users.length === 0 ? (
          <div className="rounded-lg border border-border p-4 text-center text-sm text-muted-foreground">
            لا يوجد مستخدمون في النظام
          </div>
        ) : (
          <div className="relative">
            <Users className="pointer-events-none absolute end-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <ChevronDown className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <select
              value={selectedId}
              onChange={(e) => setSelectedId(e.target.value)}
              disabled={submitting}
              className="w-full appearance-none rounded-lg border border-border bg-background px-10 py-3 text-sm text-foreground transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            >
              <option value="">— اختر مستخدماً —</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.full_name || u.email} — {ROLE_LABELS_AR[u.user_type as UserRole] ?? u.user_type}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {selectedUser && (
        <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-sm">
          <p className="font-medium text-foreground">
            {selectedUser.full_name || selectedUser.email}
          </p>
          <p className="text-xs text-muted-foreground">
            {ROLE_LABELS_AR[selectedUser.user_type as UserRole] ?? selectedUser.user_type}
            {selectedUser.region && ` · ${selectedUser.region}`}
          </p>
        </div>
      )}

      <Button
        size="lg"
        className="w-full"
        disabled={!selectedId || submitting}
        onClick={handleLogin}
      >
        {submitting ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            جاري الدخول...
          </>
        ) : (
          'دخول'
        )}
      </Button>
    </div>
  );
}
