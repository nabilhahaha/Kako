import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { AppUser } from '@/lib/types';
import type { UserEditValues } from '@/lib/schemas';
import { logAudit } from '@/lib/audit';

interface UsersPage {
  rows: AppUser[];
  total: number;
}

export function useUsersAdmin(page: number, pageSize: number, search: string) {
  return useQuery({
    queryKey: ['admin-users', page, pageSize, search],
    queryFn: async (): Promise<UsersPage> => {
      const from = page * pageSize;
      const to = from + pageSize - 1;
      let q = supabase
        .from('users')
        .select('id, email, full_name, role, region, supervisor_id, is_active', {
          count: 'exact',
        })
        .order('created_at', { ascending: false })
        .range(from, to);
      if (search.trim()) {
        const term = `%${search.trim()}%`;
        q = q.or(`email.ilike.${term},full_name.ilike.${term}`);
      }
      const { data, count, error } = await q;
      if (error) throw error;
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
      const { error } = await supabase
        .from('users')
        .update({
          full_name: values.fullName,
          role: values.role,
          region: values.region || null,
          supervisor_id: values.supervisorId,
          is_active: values.isActive,
        })
        .eq('id', userId);
      if (error) throw error;
      await logAudit({
        actorId,
        action: 'update',
        entity: 'user',
        entityId: userId,
        metadata: { role: values.role, is_active: values.isActive },
      });
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
      const { error } = await supabase
        .from('users')
        .update({ is_active: false })
        .eq('id', userId);
      if (error) throw error;
      await logAudit({
        actorId,
        action: 'deactivate',
        entity: 'user',
        entityId: userId,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-users'] });
    },
  });
}
