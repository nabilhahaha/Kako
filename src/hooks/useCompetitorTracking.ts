import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { qk } from '@/lib/queryKeys';
import type { CompetitorReport } from '@/lib/types';

/* ------------------------------------------------------------------ */
/*  Fetch competitor reports for a visit (including photos)           */
/* ------------------------------------------------------------------ */

export function useCompetitorReports(visitId: string | undefined) {
  return useQuery({
    enabled: !!visitId,
    queryKey: qk.competitorReports(visitId ?? ''),
    queryFn: async (): Promise<CompetitorReport[]> => {
      const { data, error } = await supabase
        .from('competitor_reports')
        .select('*, competitor_photos(*)')
        .eq('visit_id', visitId)
        .order('created_at', { ascending: false });
      if (error) throw error;

      return (data ?? []).map((row: Record<string, unknown>) => {
        const { competitor_photos, ...rest } = row;
        return {
          ...rest,
          photos: (competitor_photos as unknown[]) ?? [],
        } as unknown as CompetitorReport;
      });
    },
  });
}

/* ------------------------------------------------------------------ */
/*  Create competitor report with photo upload                        */
/* ------------------------------------------------------------------ */

interface CreateCompetitorReportInput {
  visit_id: string;
  competitor_name: string;
  competitor_products?: string;
  competitor_promotions?: string;
  competitor_pricing?: string;
  notes?: string;
  photos: File[];
}

export function useCreateCompetitorReport() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateCompetitorReportInput) => {
      // 1. Insert competitor report
      const { data: report, error: reportErr } = await supabase
        .from('competitor_reports')
        .insert({
          visit_id: input.visit_id,
          competitor_name: input.competitor_name,
          competitor_products: input.competitor_products ?? null,
          competitor_promotions: input.competitor_promotions ?? null,
          competitor_pricing: input.competitor_pricing ?? null,
          notes: input.notes ?? null,
        })
        .select('id')
        .single();

      if (reportErr || !report) throw reportErr ?? new Error('فشل إنشاء تقرير المنافس');

      const reportId = report.id as string;

      // 2. Upload photos to storage and insert photo records
      const uploadedUrls: string[] = [];
      for (const photo of input.photos) {
        const ext = photo.name.split('.').pop() ?? 'jpg';
        const path = `${input.visit_id}/${crypto.randomUUID()}.${ext}`;
        const { error: uploadErr } = await supabase.storage
          .from('competitor-photos')
          .upload(path, photo, { contentType: photo.type, upsert: false });
        if (uploadErr) {
          console.warn('competitor photo upload failed', uploadErr);
          continue;
        }
        const { data: pub } = supabase.storage
          .from('competitor-photos')
          .getPublicUrl(path);
        uploadedUrls.push(pub.publicUrl);
      }

      if (uploadedUrls.length) {
        const { error: photosErr } = await supabase.from('competitor_photos').insert(
          uploadedUrls.map((photo_url) => ({
            competitor_report_id: reportId,
            photo_url,
          })),
        );
        if (photosErr) console.warn('competitor_photos insert failed', photosErr);
      }

      return { reportId, uploadedPhotos: uploadedUrls.length };
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: qk.competitorReports(vars.visit_id) });
    },
  });
}

/* ------------------------------------------------------------------ */
/*  Delete competitor report                                          */
/* ------------------------------------------------------------------ */

export function useDeleteCompetitorReport() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('competitor_reports')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['competitor-reports'] });
    },
  });
}
