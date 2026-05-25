import { useState, useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useTradeSpendStore } from '@/stores/tradeSpendStore';
import type {
  Campaign,
  CampaignBranch,
  TradeSpendCustomer,
  TradeSpendItem,
  SalesTransaction,
  SpendType,
  WorkflowEvent,
  ColumnMappingConfig,
  CampaignStatus,
} from '@/lib/trade-spend/types';
import {
  DEMO_CUSTOMERS,
  DEMO_ITEMS,
  DEMO_TRANSACTIONS,
  DEMO_SPEND_TYPES,
  DEMO_CAMPAIGNS,
} from '@/lib/trade-spend/demo-data';

// ---------------------------------------------------------------------------
// Query key factory
// ---------------------------------------------------------------------------
const queryKeys = {
  customers: ['trade-spend', 'customers'] as const,
  items: ['trade-spend', 'items'] as const,
  spendTypes: ['trade-spend', 'spend-types'] as const,
  campaigns: ['trade-spend', 'campaigns'] as const,
  transactions: ['trade-spend', 'transactions'] as const,
  workflowEvents: (campaignId: string) =>
    ['trade-spend', 'workflow-events', campaignId] as const,
  columnMappings: ['trade-spend', 'column-mappings'] as const,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Split an array into chunks of `size`. */
function chunk<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

/**
 * Map a Supabase campaign row (+ nested branches) to the app `Campaign` type.
 */
function toCampaign(
  row: Record<string, unknown>,
  branches: CampaignBranch[] = [],
): Campaign {
  return {
    id: row.id as string,
    account: row.account as string,
    classification: (row.classification as string) ?? undefined,
    spend_type: row.spend_type as string,
    duration_key: row.duration_key as Campaign['duration_key'],
    duration_months: row.duration_months as number | undefined,
    item_ids: (row.item_ids as string[]) ?? [],
    spend_amount: Number(row.spend_amount),
    start_date: row.start_date as string,
    roshen_pct: Number(row.roshen_pct),
    period_mode: row.period_mode as Campaign['period_mode'],
    custom_days: row.custom_days as number | undefined,
    before_start: (row.before_start as string) ?? undefined,
    before_end: (row.before_end as string) ?? undefined,
    after_start: (row.after_start as string) ?? undefined,
    after_end: (row.after_end as string) ?? undefined,
    branch_count: Number(row.branch_count),
    branches,
    status: row.status as Campaign['status'],
    created_by: row.created_by as string,
    created_at: row.created_at as string,
    submitted_at: (row.submitted_at as string) ?? undefined,
    approved_distributor_at:
      (row.approved_distributor_at as string) ?? undefined,
    approved_roshen_at: (row.approved_roshen_at as string) ?? undefined,
  };
}

function toWorkflowEvent(row: Record<string, unknown>): WorkflowEvent {
  return {
    id: row.id as string,
    campaign_id: row.campaign_id as string,
    actor_user_id: row.actor_user_id as string,
    action: row.action as WorkflowEvent['action'],
    note: (row.note as string) ?? undefined,
    timestamp: row.created_at as string,
  };
}

// ---------------------------------------------------------------------------
// 1. useSupabaseSync
// ---------------------------------------------------------------------------

/**
 * Loads all core trade-spend data from Supabase into the Zustand store on
 * mount.  If the Supabase tables are empty (first run) the demo data is
 * seeded.  If Supabase is unreachable the existing demo data in the store
 * is kept silently.
 */
export function useSupabaseSync() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const store = useTradeSpendStore;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      // --- Fetch all entities in parallel ---------------------------------
      const [
        customersRes,
        itemsRes,
        spendTypesRes,
        campaignsRes,
        branchesRes,
        transactionsRes,
      ] = await Promise.all([
        supabase.from('ts_customers').select('*'),
        supabase.from('ts_items').select('*'),
        supabase.from('ts_spend_types').select('*'),
        supabase.from('ts_campaigns').select('*'),
        supabase.from('ts_campaign_branches').select('*'),
        supabase.from('ts_sales_transactions').select('*'),
      ]);

      // If any critical query errors, throw so we fall back to demo data
      const firstError =
        customersRes.error ??
        itemsRes.error ??
        spendTypesRes.error ??
        campaignsRes.error ??
        branchesRes.error ??
        transactionsRes.error;
      if (firstError) throw firstError;

      const customers = (customersRes.data ?? []) as TradeSpendCustomer[];
      const items = (itemsRes.data ?? []) as TradeSpendItem[];
      const spendTypes = (spendTypesRes.data ?? []) as SpendType[];
      const campaignRows = (campaignsRes.data ?? []) as Record<
        string,
        unknown
      >[];
      const branchRows = (branchesRes.data ?? []) as CampaignBranch[];
      const transactions = (transactionsRes.data ?? []) as SalesTransaction[];

      // Check if tables are empty (first run) and seed demo data -----------
      const isEmpty =
        customers.length === 0 &&
        items.length === 0 &&
        campaignRows.length === 0;

      if (isEmpty) {
        await seedDemoData();
        // Re-populate the store with the demo data that was just seeded
        store.getState().setCustomers([...DEMO_CUSTOMERS]);
        store.getState().setItems([...DEMO_ITEMS]);
        store.getState().setTransactions([...DEMO_TRANSACTIONS]);
        store.setState({
          spendTypes: [...DEMO_SPEND_TYPES],
          campaigns: [...DEMO_CAMPAIGNS],
        });
        store.getState().updateLatestDataDate();
      } else {
        // Group branches by campaign_id
        const branchesByCampaign = new Map<string, CampaignBranch[]>();
        for (const b of branchRows) {
          const list = branchesByCampaign.get(b.campaign_id) ?? [];
          list.push(b);
          branchesByCampaign.set(b.campaign_id, list);
        }

        const campaigns: Campaign[] = campaignRows.map((row) =>
          toCampaign(row, branchesByCampaign.get(row.id as string) ?? []),
        );

        // Push everything into the Zustand store
        store.getState().setCustomers(customers);
        store.getState().setItems(items);
        store.getState().setTransactions(transactions);
        store.setState({ spendTypes, campaigns });
        store.getState().updateLatestDataDate();
      }
    } catch (err) {
      console.warn(
        '[useSupabaseSync] Supabase unavailable, falling back to demo data:',
        err,
      );
      setError(err instanceof Error ? err : new Error(String(err)));
      // Store already contains demo data from its initialiser — nothing to do.
    } finally {
      setLoading(false);
    }
  }, [store]);

  useEffect(() => {
    load();
  }, [load]);

  return { loading, error, refresh: load };
}

/**
 * Seeds demo data into Supabase tables. Errors are logged but not thrown so
 * the app can continue with in-memory data.
 */
async function seedDemoData() {
  try {
    // Customers
    await supabase.from('ts_customers').upsert(
      DEMO_CUSTOMERS.map((c) => ({
        account: c.account,
        name: c.name,
        class: c.class ?? null,
        channel: c.channel ?? null,
        classification: c.classification ?? null,
      })),
      { onConflict: 'account' },
    );

    // Items
    await supabase.from('ts_items').upsert(
      DEMO_ITEMS.map((i) => ({ id: i.id, description: i.description })),
      { onConflict: 'id' },
    );

    // Spend types
    await supabase.from('ts_spend_types').upsert(
      DEMO_SPEND_TYPES.map((s) => ({ id: s.id, name: s.name })),
      { onConflict: 'name' },
    );

    // Transactions (batch)
    for (const batch of chunk(DEMO_TRANSACTIONS, 500)) {
      await supabase.from('ts_sales_transactions').insert(
        batch.map((t) => ({
          id: t.id,
          account: t.account,
          item_id: t.item_id,
          date: t.date,
          value_ex_vat: t.value_ex_vat,
          cases: t.cases,
        })),
      );
    }

    // Campaigns + branches
    for (const c of DEMO_CAMPAIGNS) {
      const { branches, ...campaignRow } = c;
      await supabase.from('ts_campaigns').upsert(
        {
          ...campaignRow,
          duration_months: campaignRow.duration_months ?? null,
          custom_days: campaignRow.custom_days ?? null,
          before_start: campaignRow.before_start ?? null,
          before_end: campaignRow.before_end ?? null,
          after_start: campaignRow.after_start ?? null,
          after_end: campaignRow.after_end ?? null,
          submitted_at: campaignRow.submitted_at ?? null,
          approved_distributor_at:
            campaignRow.approved_distributor_at ?? null,
          approved_roshen_at: campaignRow.approved_roshen_at ?? null,
        },
        { onConflict: 'id' },
      );

      if (branches.length > 0) {
        await supabase.from('ts_campaign_branches').upsert(
          branches.map((b) => ({
            id: b.id,
            campaign_id: b.campaign_id,
            branch_name: b.branch_name,
            photo_url: b.photo_url ?? null,
          })),
          { onConflict: 'id' },
        );
      }
    }
  } catch (err) {
    console.warn('[seedDemoData] Failed to seed demo data:', err);
  }
}

// ---------------------------------------------------------------------------
// 2. useSaveCampaign
// ---------------------------------------------------------------------------

export function useSaveCampaign() {
  const store = useTradeSpendStore;
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async (campaign: Campaign) => {
      // Optimistic: update Zustand store immediately
      const existing = store.getState().campaigns.find((c) => c.id === campaign.id);
      if (existing) {
        store.getState().updateCampaign(campaign.id, campaign);
      } else {
        store.setState((s) => ({ campaigns: [...s.campaigns, campaign] }));
      }

      // Persist campaign to Supabase
      const { branches, ...row } = campaign;
      const { error: campaignError } = await supabase
        .from('ts_campaigns')
        .upsert(
          {
            ...row,
            duration_months: row.duration_months ?? null,
            custom_days: row.custom_days ?? null,
            before_start: row.before_start ?? null,
            before_end: row.before_end ?? null,
            after_start: row.after_start ?? null,
            after_end: row.after_end ?? null,
            submitted_at: row.submitted_at ?? null,
            approved_distributor_at: row.approved_distributor_at ?? null,
            approved_roshen_at: row.approved_roshen_at ?? null,
          },
          { onConflict: 'id' },
        );

      if (campaignError) {
        console.warn('[useSaveCampaign] Campaign upsert failed:', campaignError);
        // Don't throw — optimistic update in store still stands
        return;
      }

      // Upsert branches
      if (branches.length > 0) {
        const { error: branchError } = await supabase
          .from('ts_campaign_branches')
          .upsert(
            branches.map((b) => ({
              id: b.id,
              campaign_id: b.campaign_id,
              branch_name: b.branch_name,
              photo_url: b.photo_url ?? null,
            })),
            { onConflict: 'id' },
          );

        if (branchError) {
          console.warn(
            '[useSaveCampaign] Branch upsert failed:',
            branchError,
          );
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.campaigns });
    },
  });

  return {
    saveCampaign: mutation.mutateAsync,
    saving: mutation.isPending,
  };
}

// ---------------------------------------------------------------------------
// 3. useSaveTransactions
// ---------------------------------------------------------------------------

export function useSaveTransactions() {
  const store = useTradeSpendStore;
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async ({
      customers,
      items,
      transactions,
    }: {
      customers: TradeSpendCustomer[];
      items: TradeSpendItem[];
      transactions: SalesTransaction[];
    }) => {
      // Optimistic: update Zustand store immediately
      store.getState().setCustomers(customers);
      store.getState().setItems(items);
      store.getState().setTransactions(transactions);
      store.getState().updateLatestDataDate();

      // --- Customers (batch upsert) ---
      const customerRows = customers.map((c) => ({
        account: c.account,
        name: c.name,
        class: c.class ?? null,
        channel: c.channel ?? null,
        classification: c.classification ?? null,
      }));

      for (const batch of chunk(customerRows, 500)) {
        const { error } = await supabase
          .from('ts_customers')
          .upsert(batch, { onConflict: 'account' });
        if (error) {
          console.warn('[useSaveTransactions] Customer upsert failed:', error);
        }
      }

      // --- Items (batch upsert) ---
      const itemRows = items.map((i) => ({
        id: i.id,
        description: i.description,
      }));

      for (const batch of chunk(itemRows, 500)) {
        const { error } = await supabase
          .from('ts_items')
          .upsert(batch, { onConflict: 'id' });
        if (error) {
          console.warn('[useSaveTransactions] Item upsert failed:', error);
        }
      }

      // --- Transactions (batch insert) ---
      const txnRows = transactions.map((t) => ({
        id: t.id,
        account: t.account,
        item_id: t.item_id,
        date: t.date,
        value_ex_vat: t.value_ex_vat,
        cases: t.cases,
      }));

      for (const batch of chunk(txnRows, 500)) {
        const { error } = await supabase
          .from('ts_sales_transactions')
          .insert(batch);
        if (error) {
          console.warn(
            '[useSaveTransactions] Transaction insert failed:',
            error,
          );
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.customers });
      queryClient.invalidateQueries({ queryKey: queryKeys.items });
      queryClient.invalidateQueries({ queryKey: queryKeys.transactions });
    },
  });

  return {
    saveTransactions: (
      customers: TradeSpendCustomer[],
      items: TradeSpendItem[],
      transactions: SalesTransaction[],
    ) => mutation.mutateAsync({ customers, items, transactions }),
    saving: mutation.isPending,
  };
}

// ---------------------------------------------------------------------------
// 4. useWorkflowEvents
// ---------------------------------------------------------------------------

export function useWorkflowEvents(campaignId: string) {
  const store = useTradeSpendStore;
  const queryClient = useQueryClient();

  const { data: events = [], isLoading: loading } = useQuery({
    queryKey: queryKeys.workflowEvents(campaignId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ts_workflow_events')
        .select('*')
        .eq('campaign_id', campaignId)
        .order('created_at', { ascending: true });

      if (error) {
        console.warn('[useWorkflowEvents] Fetch failed:', error);
        // Fall back to store events for this campaign
        return store
          .getState()
          .workflowEvents.filter((e) => e.campaign_id === campaignId);
      }

      const mapped = (data ?? []).map((row: Record<string, unknown>) =>
        toWorkflowEvent(row),
      );
      return mapped;
    },
    enabled: !!campaignId,
  });

  const addEventMutation = useMutation({
    mutationFn: async (
      event: Omit<WorkflowEvent, 'id' | 'timestamp'>,
    ) => {
      // Optimistic update in store
      store.getState().addWorkflowEvent(event);

      const { error } = await supabase.from('ts_workflow_events').insert({
        campaign_id: event.campaign_id,
        actor_user_id: event.actor_user_id,
        action: event.action,
        note: event.note ?? null,
      });

      if (error) {
        console.warn('[useWorkflowEvents] Insert failed:', error);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.workflowEvents(campaignId),
      });
    },
  });

  return {
    events,
    loading,
    addEvent: addEventMutation.mutateAsync,
  };
}

// ---------------------------------------------------------------------------
// 5. useSavedMappings
// ---------------------------------------------------------------------------

export function useSavedMappings() {
  const store = useTradeSpendStore;
  const queryClient = useQueryClient();

  const { data: mappings = [], isLoading: loading } = useQuery({
    queryKey: queryKeys.columnMappings,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ts_column_mappings')
        .select('*')
        .order('name');

      if (error) {
        console.warn('[useSavedMappings] Fetch failed:', error);
        // Fall back to store
        return store.getState().savedMappings.map((m, i) => ({
          id: `local-${i}`,
          name: m.name,
          mapping: m.mapping,
        }));
      }

      return (data ?? []).map((row: Record<string, unknown>) => ({
        id: row.id as string,
        name: row.name as string,
        mapping: row.mapping as Partial<ColumnMappingConfig>,
      }));
    },
  });

  const saveMutation = useMutation({
    mutationFn: async ({
      name,
      mapping,
    }: {
      name: string;
      mapping: Partial<ColumnMappingConfig>;
    }) => {
      // Optimistic store update
      store.getState().saveMappingConfig(name, mapping);

      const { error } = await supabase.from('ts_column_mappings').upsert(
        { name, mapping },
        { onConflict: 'name' },
      );

      if (error) {
        console.warn('[useSavedMappings] Save failed:', error);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.columnMappings });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (name: string) => {
      // Optimistic store update
      store.getState().deleteMappingConfig(name);

      const { error } = await supabase
        .from('ts_column_mappings')
        .delete()
        .eq('name', name);

      if (error) {
        console.warn('[useSavedMappings] Delete failed:', error);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.columnMappings });
    },
  });

  return {
    mappings,
    loading,
    saveMapping: (name: string, mapping: Partial<ColumnMappingConfig>) =>
      saveMutation.mutateAsync({ name, mapping }),
    deleteMapping: deleteMutation.mutateAsync,
  };
}

// ---------------------------------------------------------------------------
// 6. useUpdateCampaignStatus
// ---------------------------------------------------------------------------

export function useUpdateCampaignStatus() {
  const store = useTradeSpendStore;
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async ({
      campaignId,
      status,
      actorUserId,
      note,
    }: {
      campaignId: string;
      status: CampaignStatus;
      actorUserId: string;
      note?: string;
    }) => {
      const now = new Date().toISOString();

      // Optimistic Zustand updates
      store.getState().updateCampaignStatus(campaignId, status);

      // Determine the workflow action from the new status
      const actionMap: Record<CampaignStatus, WorkflowEvent['action']> = {
        draft: 'edited',
        pending_distributor: 'submitted',
        pending_roshen: 'approved_distributor',
        approved: 'approved_roshen',
        changes_requested: 'changes_requested',
      };
      const action = actionMap[status];

      store.getState().addWorkflowEvent({
        campaign_id: campaignId,
        actor_user_id: actorUserId,
        action,
        note,
      });

      // Build the update payload with appropriate timestamp fields
      const updates: Record<string, unknown> = { status };
      if (status === 'pending_distributor') updates.submitted_at = now;
      if (status === 'pending_roshen') updates.approved_distributor_at = now;
      if (status === 'approved') updates.approved_roshen_at = now;

      // Persist campaign status
      const { error: statusError } = await supabase
        .from('ts_campaigns')
        .update(updates)
        .eq('id', campaignId);

      if (statusError) {
        console.warn(
          '[useUpdateCampaignStatus] Status update failed:',
          statusError,
        );
      }

      // Persist workflow event
      const { error: eventError } = await supabase
        .from('ts_workflow_events')
        .insert({
          campaign_id: campaignId,
          actor_user_id: actorUserId,
          action,
          note: note ?? null,
        });

      if (eventError) {
        console.warn(
          '[useUpdateCampaignStatus] Workflow event insert failed:',
          eventError,
        );
      }
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.campaigns });
      queryClient.invalidateQueries({
        queryKey: queryKeys.workflowEvents(variables.campaignId),
      });
    },
  });

  return {
    updateStatus: mutation.mutateAsync,
    updating: mutation.isPending,
  };
}
