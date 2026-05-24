import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { qk } from '@/lib/queryKeys';
import type { Visit, VisitReason } from '@/lib/types';
import type { VisitWizardValues } from '@/lib/schemas';

const DEMO_VISIT_REASONS: VisitReason[] = [
  { id: 'r01', label: 'Routine Visit', label_ar: 'زيارة روتينية', applies_to: 'all', is_active: true },
  { id: 'r02', label: 'New Product Launch', label_ar: 'إطلاق منتج جديد', applies_to: 'all', is_active: true },
  { id: 'r03', label: 'Shelf Arrangement', label_ar: 'ترتيب الرف', applies_to: 'all', is_active: true },
  { id: 'r04', label: 'Stock Check', label_ar: 'جرد المخزون', applies_to: 'all', is_active: true },
  { id: 'r05', label: 'Promotion Follow-up', label_ar: 'متابعة العرض الترويجي', applies_to: 'all', is_active: true },
  { id: 'r06', label: 'Complaint Resolution', label_ar: 'حل شكوى', applies_to: 'all', is_active: true },
  { id: 'r07', label: 'Payment Collection', label_ar: 'تحصيل مبالغ', applies_to: 'all', is_active: true },
  { id: 'r08', label: 'Price Update', label_ar: 'تحديث الأسعار', applies_to: 'all', is_active: true },
  { id: 'r09', label: 'Competitor Activity', label_ar: 'نشاط منافسين', applies_to: 'all', is_active: true },
  { id: 'r10', label: 'Near Expiry Check', label_ar: 'فحص قارب على الانتهاء', applies_to: 'all', is_active: true },
  { id: 'r11', label: 'New Customer Onboarding', label_ar: 'تسجيل عميل جديد', applies_to: 'all', is_active: true },
  { id: 'r12', label: 'Display Installation', label_ar: 'تركيب ستاند عرض', applies_to: 'all', is_active: true },
];

export function useVisits(userId: string | undefined) {
  return useQuery({
    enabled: !!userId,
    queryKey: qk.visits(userId ?? ''),
    queryFn: async (): Promise<Visit[]> => {
      const { data, error } = await supabase
        .from('visits')
        .select('id, customer_id, user_id, visit_type, visited_at, latitude, longitude, notes, status')
        .eq('user_id', userId)
        .order('visited_at', { ascending: false })
        .limit(100);
      if (error || !data) return [];
      return data as Visit[];
    },
  });
}

export function useVisitReasons() {
  return useQuery({
    queryKey: qk.visitReasons(),
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<VisitReason[]> => {
      const { data, error } = await supabase
        .from('visit_reasons_master')
        .select('id, label, label_ar, applies_to, is_active')
        .eq('is_active', true)
        .order('label_ar', { ascending: true });
      if (error || !data || data.length === 0) {
        return DEMO_VISIT_REASONS;
      }
      return data as VisitReason[];
    },
  });
}

interface CreateVisitInput {
  values: VisitWizardValues;
  photos: File[];
  userId: string;
}

export function useCreateVisit() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ values, photos, userId }: CreateVisitInput) => {
      const { data: visit, error: visitErr } = await supabase
        .from('visits')
        .insert({
          customer_id: values.customerId,
          user_id: userId,
          visit_type: values.visitType,
          visited_at: new Date().toISOString(),
          latitude: values.gps?.latitude ?? null,
          longitude: values.gps?.longitude ?? null,
          notes: values.notes ?? null,
          status: 'pending',
        })
        .select('id')
        .single();

      if (visitErr || !visit) throw visitErr ?? new Error('فشل تسجيل الزيارة');

      const visitId = visit.id as string;

      if (values.reasonIds.length) {
        const { error: reasonsErr } = await supabase.from('visit_reasons').insert(
          values.reasonIds.map((reason_id) => ({ visit_id: visitId, reason_id })),
        );
        if (reasonsErr) {
          console.warn('visit_reasons insert failed', reasonsErr);
        }
      }

      const uploadedUrls: string[] = [];
      for (const photo of photos) {
        const ext = photo.name.split('.').pop() ?? 'jpg';
        const path = `${visitId}/${crypto.randomUUID()}.${ext}`;
        const { error: uploadErr } = await supabase.storage
          .from('visit-photos')
          .upload(path, photo, { contentType: photo.type, upsert: false });
        if (uploadErr) {
          console.warn('photo upload failed', uploadErr);
          continue;
        }
        const { data: pub } = supabase.storage.from('visit-photos').getPublicUrl(path);
        uploadedUrls.push(pub.publicUrl);
      }

      if (uploadedUrls.length) {
        const { error: photosErr } = await supabase.from('visit_photos').insert(
          uploadedUrls.map((photo_url) => ({ visit_id: visitId, photo_url })),
        );
        if (photosErr) console.warn('visit_photos insert failed', photosErr);
      }

      return { visitId, uploadedPhotos: uploadedUrls.length };
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: qk.visits(vars.userId) });
      qc.invalidateQueries({ queryKey: qk.customer360(vars.values.customerId) });
    },
  });
}
