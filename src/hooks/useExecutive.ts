import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { Anomaly, ExecutiveKPIs } from '@/lib/types';

const DAY = 24 * 60 * 60 * 1000;
const AUTO_REFRESH_MS = 5 * 60 * 1000;

function isoDaysAgo(days: number) {
  return new Date(Date.now() - days * DAY).toISOString();
}

export function useExecutiveKPIs() {
  return useQuery({
    queryKey: ['executive-kpis'],
    refetchInterval: AUTO_REFRESH_MS,
    refetchIntervalInBackground: false,
    staleTime: AUTO_REFRESH_MS / 2,
    queryFn: async (): Promise<ExecutiveKPIs> => {
      const since30 = isoDaysAgo(30);
      const since60 = isoDaysAgo(60);

      const [
        { data: customers, error: cErr },
        { data: visits30, error: v30Err },
        { data: visitsPrev30, error: vPrevErr },
        { data: invoices30, error: i30Err },
        { data: invoicesPrev30, error: iPrevErr },
        { data: reps, error: rErr },
        { count: pendingVisits, error: pvErr },
        { count: pendingNE, error: pneErr },
        { data: atRisk, error: arErr },
      ] = await Promise.all([
        supabase
          .from('customers')
          .select('id, total_debt, overdue_amount'),
        supabase
          .from('visits')
          .select('id, customer_id, visited_at')
          .gte('visited_at', since30),
        supabase
          .from('visits')
          .select('id')
          .gte('visited_at', since60)
          .lt('visited_at', since30),
        supabase
          .from('raw_data_invoices')
          .select('amount, invoice_date')
          .gte('invoice_date', since30),
        supabase
          .from('raw_data_invoices')
          .select('amount, invoice_date')
          .gte('invoice_date', since60)
          .lt('invoice_date', since30),
        supabase
          .from('users')
          .select('id, role, is_active')
          .eq('role', 'presales_rep')
          .eq('is_active', true),
        supabase
          .from('visits')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'pending'),
        supabase
          .from('near_expiry_records')
          .select('id', { count: 'exact', head: true })
          .in('status', ['pending', 'supervisor_approved']),
        supabase
          .from('near_expiry_records')
          .select('quantity, status')
          .in('status', ['pending', 'supervisor_approved']),
      ]);

      if (cErr) throw cErr;
      if (v30Err) throw v30Err;
      if (vPrevErr) throw vPrevErr;
      if (rErr) throw rErr;
      if (pvErr) throw pvErr;
      if (pneErr) throw pneErr;
      if (arErr) throw arErr;
      // invoices are optional — failure is downgraded
      if (i30Err) console.warn('invoices_30 fetch failed', i30Err);
      if (iPrevErr) console.warn('invoices_prev fetch failed', iPrevErr);

      const customerIds = new Set((customers ?? []).map((c) => c.id));
      const activeCustomerIds = new Set(
        (visits30 ?? []).map((v) => v.customer_id).filter((id) => customerIds.has(id)),
      );

      const sumAmounts = (rows: { amount: number | string | null }[] | null | undefined) =>
        (rows ?? []).reduce((s, r) => s + Number(r.amount ?? 0), 0);

      return {
        totalRevenue30d: sumAmounts(invoices30),
        totalRevenuePrev30d: sumAmounts(invoicesPrev30),
        totalVisits30d: visits30?.length ?? 0,
        totalVisitsPrev30d: visitsPrev30?.length ?? 0,
        totalCustomers: customerIds.size,
        activeCustomers30d: activeCustomerIds.size,
        totalReps: reps?.length ?? 0,
        coveragePercent:
          customerIds.size > 0
            ? Math.round((activeCustomerIds.size / customerIds.size) * 100)
            : 0,
        totalOverdue: (customers ?? []).reduce(
          (s, c) => s + Number(c.overdue_amount ?? 0),
          0,
        ),
        totalDebt: (customers ?? []).reduce((s, c) => s + Number(c.total_debt ?? 0), 0),
        pendingApprovals: (pendingVisits ?? 0) + (pendingNE ?? 0),
        atRiskQuantity: (atRisk ?? []).reduce(
          (s, r) => s + Number(r.quantity ?? 0),
          0,
        ),
      };
    },
  });
}

export function useDailyVisitTrend(days = 30) {
  return useQuery({
    queryKey: ['daily-visit-trend', days],
    refetchInterval: AUTO_REFRESH_MS,
    queryFn: async () => {
      const since = isoDaysAgo(days);
      const { data, error } = await supabase
        .from('visits')
        .select('id, visited_at')
        .gte('visited_at', since)
        .limit(20000);
      if (error) throw error;

      const buckets = new Map<string, number>();
      for (let i = days - 1; i >= 0; i--) {
        const day = new Date(Date.now() - i * DAY).toISOString().slice(0, 10);
        buckets.set(day, 0);
      }
      for (const v of data ?? []) {
        const day = v.visited_at.slice(0, 10);
        if (buckets.has(day)) buckets.set(day, buckets.get(day)! + 1);
      }
      return Array.from(buckets.entries()).map(([day, count]) => ({
        day,
        visits: count,
      }));
    },
  });
}

export function useAnomalies() {
  const trend = useDailyVisitTrend(30);

  const anomalies: Anomaly[] = [];

  if (trend.data && trend.data.length >= 14) {
    const series = trend.data.map((d) => d.visits);
    const baseline = series.slice(0, -3);
    if (baseline.length > 0) {
      const mean = baseline.reduce((s, n) => s + n, 0) / baseline.length;
      const variance =
        baseline.reduce((s, n) => s + (n - mean) ** 2, 0) / baseline.length;
      const std = Math.sqrt(variance);

      const recent = trend.data.slice(-3);
      for (const point of recent) {
        if (std === 0) continue;
        const z = (point.visits - mean) / std;
        const delta = mean > 0 ? ((point.visits - mean) / mean) * 100 : 0;

        if (z <= -2) {
          anomalies.push({
            id: `drop-${point.day}`,
            severity: z <= -2.5 ? 'high' : 'medium',
            metric: 'الزيارات اليومية',
            message: `انخفاض حاد في ${point.day}: ${point.visits} زيارة مقابل متوسط ${Math.round(mean)}.`,
            detected_at: point.day,
            delta_percent: Math.round(delta),
          });
        } else if (z >= 2) {
          anomalies.push({
            id: `spike-${point.day}`,
            severity: z >= 2.5 ? 'high' : 'medium',
            metric: 'الزيارات اليومية',
            message: `ارتفاع غير معتاد في ${point.day}: ${point.visits} زيارة (+${Math.round(delta)}%).`,
            detected_at: point.day,
            delta_percent: Math.round(delta),
          });
        }
      }
    }
  }

  return { anomalies, isLoading: trend.isLoading, isError: trend.isError };
}
