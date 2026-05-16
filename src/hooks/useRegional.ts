import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { qk } from '@/lib/queryKeys';
import type { Customer, NearExpiryRecord, RegionStats, Visit } from '@/lib/types';

export interface RegionalSnapshot {
  byRegion: RegionStats[];
  totalCustomers: number;
  totalActiveReps: number;
  visits30d: number;
  totalDebt: number;
  totalOverdue: number;
}

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

export function useRegionalSnapshot(region: string | null) {
  return useQuery({
    queryKey: qk.regional(region),
    staleTime: 60_000,
    queryFn: async (): Promise<RegionalSnapshot> => {
      const since = new Date(Date.now() - THIRTY_DAYS_MS).toISOString();

      const customersQ = supabase
        .from('customers')
        .select('id, region, customer_grade, total_debt, overdue_amount, assigned_rep_id');

      const usersQ = supabase
        .from('users')
        .select('id, region, user_type, is_active')
        .eq('is_active', true)
        .eq('user_type', 'presales_rep');

      const visitsQ = supabase
        .from('visits')
        .select('id, customer_id, user_id, visited_at')
        .gte('visited_at', since);

      const [{ data: customers, error: cErr }, { data: users, error: uErr }, { data: visits, error: vErr }] =
        await Promise.all([customersQ, usersQ, visitsQ]);

      if (cErr) throw cErr;
      if (uErr) throw uErr;
      if (vErr) throw vErr;

      const filteredCustomers = (customers ?? []).filter(
        (c) => !region || c.region === region,
      ) as Pick<Customer, 'id' | 'region' | 'customer_grade' | 'total_debt' | 'overdue_amount' | 'assigned_rep_id'>[];

      const customerSetByRegion = new Map<string, Set<string>>();
      const visitedSetByRegion = new Map<string, Set<string>>();
      const overdueByRegion = new Map<string, number>();

      const customersById = new Map<string, (typeof filteredCustomers)[number]>();
      for (const c of filteredCustomers) {
        customersById.set(c.id, c);
        const r = c.region ?? 'بدون إقليم';
        if (!customerSetByRegion.has(r)) customerSetByRegion.set(r, new Set());
        customerSetByRegion.get(r)!.add(c.id);
        if (Number(c.overdue_amount ?? 0) > 0) {
          overdueByRegion.set(r, (overdueByRegion.get(r) ?? 0) + 1);
        }
      }

      for (const v of (visits ?? []) as Pick<Visit, 'customer_id'>[]) {
        const cust = customersById.get(v.customer_id);
        if (!cust) continue;
        const r = cust.region ?? 'بدون إقليم';
        if (!visitedSetByRegion.has(r)) visitedSetByRegion.set(r, new Set());
        visitedSetByRegion.get(r)!.add(v.customer_id);
      }

      const byRegion: RegionStats[] = Array.from(customerSetByRegion.entries()).map(
        ([r, set]) => {
          const visited = visitedSetByRegion.get(r)?.size ?? 0;
          const total = set.size;
          return {
            region: r,
            customers: total,
            active_customers: visited,
            coverage_percent: total > 0 ? Math.round((visited / total) * 100) : 0,
            visits_30d: visits?.filter(
              (v) => customersById.get(v.customer_id)?.region === r ||
                (!customersById.get(v.customer_id)?.region && r === 'بدون إقليم'),
            ).length ?? 0,
            overdue_count: overdueByRegion.get(r) ?? 0,
          };
        },
      );

      byRegion.sort((a, b) => b.customers - a.customers);

      const filteredUsers = (users ?? []).filter(
        (u) => !region || u.region === region,
      );

      return {
        byRegion,
        totalCustomers: filteredCustomers.length,
        totalActiveReps: filteredUsers.length,
        visits30d: visits?.length ?? 0,
        totalDebt: filteredCustomers.reduce((sum, c) => sum + Number(c.total_debt ?? 0), 0),
        totalOverdue: filteredCustomers.reduce(
          (sum, c) => sum + Number(c.overdue_amount ?? 0),
          0,
        ),
      };
    },
  });
}

export function useChannelStats() {
  return useQuery({
    queryKey: qk.channelStats(),
    staleTime: 60_000,
    queryFn: async () => {
      const since = new Date(Date.now() - THIRTY_DAYS_MS).toISOString();

      const [{ data: customers, error: cErr }, { data: visits, error: vErr }] =
        await Promise.all([
          supabase
            .from('customers')
            .select('id, channel_type, total_debt, overdue_amount'),
          supabase.from('visits').select('id, customer_id').gte('visited_at', since),
        ]);
      if (cErr) throw cErr;
      if (vErr) throw vErr;

      const byChannel = new Map<
        string,
        {
          channel: string;
          customers: number;
          visits_30d: number;
          total_debt: number;
          overdue_amount: number;
          ids: Set<string>;
        }
      >();

      for (const c of customers ?? []) {
        const ch = c.channel_type ?? 'غير محدد';
        if (!byChannel.has(ch)) {
          byChannel.set(ch, {
            channel: ch,
            customers: 0,
            visits_30d: 0,
            total_debt: 0,
            overdue_amount: 0,
            ids: new Set(),
          });
        }
        const e = byChannel.get(ch)!;
        e.customers += 1;
        e.total_debt += Number(c.total_debt ?? 0);
        e.overdue_amount += Number(c.overdue_amount ?? 0);
        e.ids.add(c.id);
      }

      const channelByCustomer = new Map<string, string>();
      for (const [, e] of byChannel) {
        for (const id of e.ids) channelByCustomer.set(id, e.channel);
      }

      for (const v of visits ?? []) {
        const ch = channelByCustomer.get(v.customer_id);
        if (!ch) continue;
        byChannel.get(ch)!.visits_30d += 1;
      }

      return Array.from(byChannel.values())
        .map(({ ids, ...rest }) => {
          void ids;
          return rest;
        })
        .sort((a, b) => b.customers - a.customers);
    },
  });
}

export function useNearExpiryAnalytics() {
  return useQuery({
    queryKey: qk.nearExpiryAnalytics(),
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('near_expiry_records')
        .select('id, status, quantity, expiry_date, created_at, product_id')
        .order('created_at', { ascending: false })
        .limit(2000);
      if (error) throw error;

      const records = (data ?? []) as Pick<
        NearExpiryRecord,
        'id' | 'status' | 'quantity' | 'expiry_date' | 'created_at' | 'product_id'
      >[];

      const byStatus = new Map<string, { count: number; quantity: number }>();
      const byMonth = new Map<string, { month: string; count: number; quantity: number }>();
      const byProduct = new Map<string, { product_id: string; count: number; quantity: number }>();

      for (const r of records) {
        const s = r.status ?? 'pending';
        if (!byStatus.has(s)) byStatus.set(s, { count: 0, quantity: 0 });
        byStatus.get(s)!.count += 1;
        byStatus.get(s)!.quantity += Number(r.quantity ?? 0);

        const month = r.created_at.slice(0, 7);
        if (!byMonth.has(month)) byMonth.set(month, { month, count: 0, quantity: 0 });
        byMonth.get(month)!.count += 1;
        byMonth.get(month)!.quantity += Number(r.quantity ?? 0);

        if (!byProduct.has(r.product_id))
          byProduct.set(r.product_id, { product_id: r.product_id, count: 0, quantity: 0 });
        byProduct.get(r.product_id)!.count += 1;
        byProduct.get(r.product_id)!.quantity += Number(r.quantity ?? 0);
      }

      return {
        total: records.length,
        atRiskQuantity: records
          .filter((r) => r.status === 'pending' || r.status === 'supervisor_approved')
          .reduce((sum, r) => sum + Number(r.quantity ?? 0), 0),
        byStatus: Array.from(byStatus.entries()).map(([status, v]) => ({ status, ...v })),
        byMonth: Array.from(byMonth.values()).sort((a, b) => a.month.localeCompare(b.month)),
        topProducts: Array.from(byProduct.values())
          .sort((a, b) => b.quantity - a.quantity)
          .slice(0, 10),
      };
    },
  });
}
