import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { qk } from '@/lib/queryKeys';
import type { DynamicFormField, DynamicFormResponse, DynamicFieldType } from '@/lib/types';

/* ───────────── Queries ───────────── */

/** Fetch active fields for a form_key, ordered by sort_order */
export function useDynamicFields(formKey: string) {
  return useQuery({
    enabled: !!formKey,
    queryKey: qk.dynamicFields(formKey),
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<DynamicFormField[]> => {
      const { data, error } = await supabase
        .from('dynamic_form_fields')
        .select('*')
        .eq('form_key', formKey)
        .eq('is_active', true)
        .order('sort_order', { ascending: true });
      if (error) throw error;
      return (data ?? []) as DynamicFormField[];
    },
  });
}

/** Fetch ALL fields (including inactive) for admin view */
export function useAllDynamicFields(formKey: string) {
  return useQuery({
    enabled: !!formKey,
    queryKey: [...qk.dynamicFields(formKey), 'all'],
    queryFn: async (): Promise<DynamicFormField[]> => {
      const { data, error } = await supabase
        .from('dynamic_form_fields')
        .select('*')
        .eq('form_key', formKey)
        .order('sort_order', { ascending: true });
      if (error) throw error;
      return (data ?? []) as DynamicFormField[];
    },
  });
}

/** Fetch responses for a specific entity, returned as flat Record */
export function useDynamicFormResponses(formKey: string, entityId: string | undefined) {
  return useQuery({
    enabled: !!formKey && !!entityId,
    queryKey: qk.formResponses(formKey, entityId ?? ''),
    queryFn: async (): Promise<Record<string, unknown>> => {
      const { data, error } = await supabase
        .from('dynamic_form_responses')
        .select('*')
        .eq('form_key', formKey)
        .eq('entity_id', entityId);
      if (error) throw error;

      const flat: Record<string, unknown> = {};
      for (const row of (data ?? []) as DynamicFormResponse[]) {
        if (row.value_json !== null && row.value_json !== undefined) {
          flat[row.field_key] = row.value_json;
        } else if (row.value_number !== null) {
          flat[row.field_key] = row.value_number;
        } else {
          flat[row.field_key] = row.value_text;
        }
      }
      return flat;
    },
  });
}

/* ───────────── Mutations ───────────── */

interface CreateFieldInput {
  form_key: string;
  field_key: string;
  field_type: DynamicFieldType;
  label: string;
  label_ar?: string | null;
  section?: string | null;
  options?: { value: string; label: string; label_ar?: string }[] | null;
  is_required?: boolean;
  sort_order?: number;
}

export function useCreateDynamicField() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateFieldInput) => {
      const { data, error } = await supabase
        .from('dynamic_form_fields')
        .insert({
          form_key: input.form_key,
          field_key: input.field_key,
          field_type: input.field_type,
          label: input.label,
          label_ar: input.label_ar ?? null,
          section: input.section ?? null,
          options: input.options ?? null,
          is_required: input.is_required ?? false,
          sort_order: input.sort_order ?? 0,
          is_active: true,
        })
        .select('id')
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: qk.dynamicFields(vars.form_key) });
    },
  });
}

interface UpdateFieldInput {
  id: string;
  form_key: string;
  updates: Partial<Omit<DynamicFormField, 'id' | 'created_at' | 'created_by'>>;
}

export function useUpdateDynamicField() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, updates }: UpdateFieldInput) => {
      const { error } = await supabase
        .from('dynamic_form_fields')
        .update(updates)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: qk.dynamicFields(vars.form_key) });
    },
  });
}

/** Soft-delete: set is_active = false */
export function useDeleteDynamicField() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id }: { id: string; form_key: string }) => {
      const { error } = await supabase
        .from('dynamic_form_fields')
        .update({ is_active: false })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: qk.dynamicFields(vars.form_key) });
    },
  });
}

/** Batch update sort_order for multiple fields */
export function useReorderDynamicFields() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      fields,
    }: {
      form_key: string;
      fields: { id: string; sort_order: number }[];
    }) => {
      const updates = fields.map(({ id, sort_order }) =>
        supabase
          .from('dynamic_form_fields')
          .update({ sort_order })
          .eq('id', id),
      );
      const results = await Promise.all(updates);
      const failed = results.find((r) => r.error);
      if (failed?.error) throw failed.error;
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: qk.dynamicFields(vars.form_key) });
    },
  });
}

interface SaveResponsesInput {
  form_key: string;
  entity_id: string;
  responses: Record<string, unknown>;
}

/** Upsert form responses: delete existing, then insert new */
export function useSaveDynamicFormResponses() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ form_key, entity_id, responses }: SaveResponsesInput) => {
      // Delete existing responses for this entity + form
      const { error: delErr } = await supabase
        .from('dynamic_form_responses')
        .delete()
        .eq('form_key', form_key)
        .eq('entity_id', entity_id);
      if (delErr) throw delErr;

      // Build rows
      const rows = Object.entries(responses)
        .filter(([, v]) => v !== undefined && v !== null && v !== '')
        .map(([field_key, value]) => {
          let value_text: string | null = null;
          let value_number: number | null = null;
          let value_json: unknown | null = null;

          if (typeof value === 'number') {
            value_number = value;
          } else if (typeof value === 'string') {
            value_text = value;
          } else {
            // arrays, objects, booleans → store as JSON
            value_json = value;
          }

          return {
            form_key,
            entity_id,
            field_key,
            value_text,
            value_number,
            value_json,
          };
        });

      if (rows.length) {
        const { error: insErr } = await supabase
          .from('dynamic_form_responses')
          .insert(rows);
        if (insErr) throw insErr;
      }
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({
        queryKey: qk.formResponses(vars.form_key, vars.entity_id),
      });
    },
  });
}
