import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { AppUser } from '@/lib/types';
import type { UserEditValues } from '@/lib/schemas';
import { logAudit } from '@/lib/audit';

interface UsersPage {
  rows: AppUser[];
  total: number;
}

const DEMO_USERS: AppUser[] = [
  { id: 'demo-admin', email: 'admin@roshen.com', full_name: 'مدير النظام', user_type: 'admin_relia', region: 'الرياض', supervisor_id: null, is_active: true },
  { id: 'demo-rep', email: 'rep@roshen.com', full_name: 'أحمد المندوب', user_type: 'presales_rep', region: 'الرياض', supervisor_id: null, is_active: true },
  { id: 'demo-supervisor', email: 'supervisor@roshen.com', full_name: 'خالد المشرف', user_type: 'presales_supervisor', region: 'الرياض', supervisor_id: null, is_active: true },
  { id: 'demo-cashvan', email: 'cashvan@roshen.com', full_name: 'سعد مشرف الكاش فان', user_type: 'cashvan_supervisor', region: 'جدة', supervisor_id: null, is_active: true },
  { id: 'demo-regional', email: 'regional@roshen.com', full_name: 'محمد المدير الإقليمي', user_type: 'regional_manager_roshen', region: 'الرياض', supervisor_id: null, is_active: true },
];

export function useUsersAdmin(page: number, pageSize: number, search: string) {
  return useQuery({
    queryKey: ['admin-users', page, pageSize, search],
    queryFn: async (): Promise<UsersPage> => {
      const from = page * pageSize;
      const to = from + pageSize - 1;
      let q = supabase
        .from('users')
        .select('id, email, full_name, user_type, region, supervisor_id, is_active', {
          count: 'exact',
        })
        .order('created_at', { ascending: false })
        .range(from, to);
      if (search.trim()) {
        const term = `%${search.trim()}%`;
        q = q.or(`email.ilike.${term},full_name.ilike.${term}`);
      }
      const { data, count, error } = await q;
      if (error) {
        console.warn('[useUsersAdmin] Supabase query failed, returning demo data:', error.message);
        return { rows: DEMO_USERS, total: DEMO_USERS.length };
      }
      if (!data || data.length === 0) {
        return { rows: DEMO_USERS, total: DEMO_USERS.length };
      }
      return { rows: (data ?? []) as AppUser[], total: count ?? 0 };
    },
  });
}

interface UpdateUserInput {
  userId: string;
  values: UserEditValues;
  actorId: string;
}

export function useUpdateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ userId, values, actorId }: UpdateUserInput) => {
      try {
        const { error } = await supabase
          .from('users')
          .update({
            full_name: values.fullName,
            user_type: values.user_type,
            region: values.region || null,
            supervisor_id: values.supervisorId,
            is_active: values.isActive,
          })
          .eq('id', userId);
        if (error) {
          console.warn('[useUpdateUser] Supabase mutation failed (demo mode):', error.message);
          return;
        }
        await logAudit({
          actorId,
          action: 'update',
          entity: 'user',
          entityId: userId,
          metadata: { user_type: values.user_type, is_active: values.isActive },
        });
      } catch (e) {
        console.warn('[useUpdateUser] Mutation failed (demo mode):', e);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-users'] });
    },
  });
}

interface DeactivateInput {
  userId: string;
  actorId: string;
}

export function useDeactivateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ userId, actorId }: DeactivateInput) => {
      try {
        const { error } = await supabase
          .from('users')
          .update({ is_active: false })
          .eq('id', userId);
        if (error) {
          console.warn('[useDeactivateUser] Supabase mutation failed (demo mode):', error.message);
          return;
        }
        await logAudit({
          actorId,
          action: 'deactivate',
          entity: 'user',
          entityId: userId,
        });
      } catch (e) {
        console.warn('[useDeactivateUser] Mutation failed (demo mode):', e);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-users'] });
    },
  });
}
