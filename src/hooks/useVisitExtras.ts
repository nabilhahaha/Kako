import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { qk } from '@/lib/queryKeys';
import type {
  VisitProductCheck,
  VisitIssue,
  StockLevel,
  IssueType,
  IssueSeverity,
} from '@/lib/types';

/* ------------------------------------------------------------------ */
/*  Visit Product Checks                                              */
/* ------------------------------------------------------------------ */

export function useVisitProductChecks(visitId: string | undefined) {
  return useQuery({
    enabled: !!visitId,
    queryKey: qk.productChecks(visitId ?? ''),
    queryFn: async (): Promise<VisitProductCheck[]> => {
      const { data, error } = await supabase
        .from('visit_product_checks')
        .select('*')
        .eq('visit_id', visitId)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data ?? []) as VisitProductCheck[];
    },
  });
}

/* ------------------------------------------------------------------ */
/*  Batch save product checks (delete existing + insert new)          */
/* ------------------------------------------------------------------ */

interface ProductCheckInput {
  product_id: string;
  is_available: boolean;
  stock_level: StockLevel;
  shelf_share_percent?: number;
  notes?: string;
}

interface SaveProductChecksInput {
  visit_id: string;
  checks: ProductCheckInput[];
}

export function useSaveProductChecks() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ visit_id, checks }: SaveProductChecksInput) => {
      // Delete existing checks for this visit
      const { error: delErr } = await supabase
        .from('visit_product_checks')
        .delete()
        .eq('visit_id', visit_id);
      if (delErr) throw delErr;

      // Insert new checks
      if (checks.length > 0) {
        const rows = checks.map((c) => ({
          visit_id,
          product_id: c.product_id,
          is_available: c.is_available,
          stock_level: c.stock_level,
          shelf_share_percent: c.shelf_share_percent ?? null,
          notes: c.notes ?? null,
        }));
        const { error: insErr } = await supabase
          .from('visit_product_checks')
          .insert(rows);
        if (insErr) throw insErr;
      }

      return { count: checks.length };
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: qk.productChecks(vars.visit_id) });
    },
  });
}

/* ------------------------------------------------------------------ */
/*  Visit Issues                                                      */
/* ------------------------------------------------------------------ */

export function useVisitIssues(visitId: string | undefined) {
  return useQuery({
    enabled: !!visitId,
    queryKey: qk.visitIssues(visitId ?? ''),
    queryFn: async (): Promise<VisitIssue[]> => {
      const { data, error } = await supabase
        .from('visit_issues')
        .select('*')
        .eq('visit_id', visitId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as VisitIssue[];
    },
  });
}

/* ------------------------------------------------------------------ */
/*  Create visit issue (with optional photo upload)                   */
/* ------------------------------------------------------------------ */

interface CreateVisitIssueInput {
  visit_id: string;
  issue_type: IssueType;
  description: string;
  severity: IssueSeverity;
  photo?: File;
}

export function useCreateVisitIssue() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateVisitIssueInput) => {
      let photoUrl: string | null = null;

      // Upload photo if provided
      if (input.photo) {
        const ext = input.photo.name.split('.').pop() ?? 'jpg';
        const path = `${input.visit_id}/${crypto.randomUUID()}.${ext}`;
        const { error: uploadErr } = await supabase.storage
          .from('visit-photos')
          .upload(path, input.photo, { contentType: input.photo.type, upsert: false });
        if (uploadErr) {
          console.warn('issue photo upload failed', uploadErr);
        } else {
          const { data: pub } = supabase.storage
            .from('visit-photos')
            .getPublicUrl(path);
          photoUrl = pub.publicUrl;
        }
      }

      const { data, error } = await supabase
        .from('visit_issues')
        .insert({
          visit_id: input.visit_id,
          issue_type: input.issue_type,
          description: input.description,
          severity: input.severity,
          photo_url: photoUrl,
        })
        .select('id')
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: qk.visitIssues(vars.visit_id) });
    },
  });
}

/* ------------------------------------------------------------------ */
/*  Delete visit issue                                                */
/* ------------------------------------------------------------------ */

export function useDeleteVisitIssue() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('visit_issues')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['visit-issues'] });
    },
  });
}
