import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { qk } from '@/lib/queryKeys';
import type { ActionPlan, ActionPriority, ActionStatus } from '@/lib/types';

/* ------------------------------------------------------------------ */
/*  List action plans with optional filters                           */
/* ------------------------------------------------------------------ */

interface ActionPlanFilters {
  status?: string;
  priority?: string;
  userId?: string;
}

export interface ActionPlanRow extends ActionPlan {
  customer_name?: string | null;
}

export function useActionPlans(filters?: ActionPlanFilters) {
  const filterKey = JSON.stringify(filters ?? {});

  return useQuery({
    queryKey: qk.actionPlans(filterKey),
    queryFn: async (): Promise<ActionPlanRow[]> => {
      let query = supabase
        .from('action_plans')
        .select('*, customers(customer_name)')
        .order('due_date', { ascending: true })
        .order('priority', { ascending: true });

      if (filters?.status) {
        query = query.eq('status', filters.status);
      }
      if (filters?.priority) {
        query = query.eq('priority', filters.priority);
      }
      if (filters?.userId) {
        query = query.eq('responsible_user_id', filters.userId);
      }

      const { data, error } = await query;
      if (error) throw error;

      return (data ?? []).map((row: Record<string, unknown>) => {
        const customers = row.customers as { customer_name: string | null } | null;
        const { customers: _, ...rest } = row;
        return {
          ...rest,
          customer_name: customers?.customer_name ?? null,
        } as unknown as ActionPlanRow;
      });
    },
  });
}

/* ------------------------------------------------------------------ */
/*  Action plans for a specific customer                              */
/* ------------------------------------------------------------------ */

export function useCustomerActionPlans(customerId: string | undefined) {
  return useQuery({
    enabled: !!customerId,
    queryKey: qk.customerActions(customerId ?? ''),
    queryFn: async (): Promise<ActionPlan[]> => {
      const { data, error } = await supabase
        .from('action_plans')
        .select('*')
        .eq('customer_id', customerId)
        .order('due_date', { ascending: true });
      if (error) throw error;
      return (data ?? []) as ActionPlan[];
    },
  });
}

/* ------------------------------------------------------------------ */
/*  Create action plan                                                */
/* ------------------------------------------------------------------ */

interface CreateActionPlanInput {
  customer_id: string;
  visit_id?: string;
  action_description: string;
  responsible_person?: string;
  responsible_user_id?: string;
  due_date?: string;
  priority: ActionPriority;
}

export function useCreateActionPlan() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateActionPlanInput) => {
      const { data, error } = await supabase
        .from('action_plans')
        .insert({
          customer_id: input.customer_id,
          visit_id: input.visit_id ?? null,
          action_description: input.action_description,
          responsible_person: input.responsible_person ?? null,
          responsible_user_id: input.responsible_user_id ?? null,
          due_date: input.due_date ?? null,
          priority: input.priority,
          status: 'open' as ActionStatus,
        })
        .select('id')
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['action-plans'] });
      qc.invalidateQueries({ queryKey: ['customer-actions'] });
    },
  });
}

/* ------------------------------------------------------------------ */
/*  Update action plan                                                */
/* ------------------------------------------------------------------ */

interface UpdateActionPlanInput {
  id: string;
  action_description?: string;
  responsible_person?: string;
  responsible_user_id?: string;
  due_date?: string;
  priority?: ActionPriority;
  status?: ActionStatus;
}

export function useUpdateActionPlan() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...fields }: UpdateActionPlanInput) => {
      const { error } = await supabase
        .from('action_plans')
        .update({ ...fields, updated_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['action-plans'] });
      qc.invalidateQueries({ queryKey: ['customer-actions'] });
    },
  });
}

/* ------------------------------------------------------------------ */
/*  Complete action plan                                              */
/* ------------------------------------------------------------------ */

export function useCompleteActionPlan() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('action_plans')
        .update({
          status: 'completed' as ActionStatus,
          completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['action-plans'] });
      qc.invalidateQueries({ queryKey: ['customer-actions'] });
    },
  });
}
