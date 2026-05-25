import { create } from 'zustand';
import type {
  TradeSpendUser,
  TradeSpendCustomer,
  TradeSpendItem,
  SalesTransaction,
  SpendType,
  Campaign,
  CampaignStatus,
  ColumnMappingConfig,
  WorkflowEvent,
  Distributor,
} from '@/lib/trade-spend/types';
import {
  DEMO_USERS,
  DEMO_CUSTOMERS,
  DEMO_ITEMS,
  DEMO_TRANSACTIONS,
  DEMO_SPEND_TYPES,
  DEMO_CAMPAIGNS,
} from '@/lib/trade-spend/demo-data';

interface SavedColumnMapping {
  name: string;
  mapping: Partial<ColumnMappingConfig>;
}

interface TradeSpendState {
  currentUser: TradeSpendUser | null;
  users: TradeSpendUser[];
  customers: TradeSpendCustomer[];
  items: TradeSpendItem[];
  transactions: SalesTransaction[];
  spendTypes: SpendType[];
  campaigns: Campaign[];
  workflowEvents: WorkflowEvent[];
  savedMappings: SavedColumnMapping[];
  latestDataDate: string;
  classifications: string[];
  skipDistributorApproval: boolean;
  distributors: Distributor[];
  currentDistributorId: string | null;

  setCurrentUser: (user: TradeSpendUser | null) => void;
  switchRole: (userId: string) => void;

  // Distributors CRUD
  addDistributor: (d: Omit<Distributor, 'id' | 'created_at'>) => void;
  updateDistributor: (id: string, updates: Partial<Distributor>) => void;
  deleteDistributor: (id: string) => void;
  setCurrentDistributor: (id: string | null) => void;

  // Users CRUD
  addUser: (user: Omit<TradeSpendUser, 'id' | 'created_at'>) => void;
  updateUser: (id: string, updates: Partial<TradeSpendUser>) => void;
  deleteUser: (id: string) => void;

  setTransactions: (txns: SalesTransaction[]) => void;
  setCustomers: (custs: TradeSpendCustomer[]) => void;
  setItems: (items: TradeSpendItem[]) => void;
  updateLatestDataDate: () => void;

  updateCustomerClassification: (account: string, classification: string) => void;

  // Spend types CRUD
  addSpendType: (name: string) => void;
  updateSpendType: (id: string, name: string) => void;
  deleteSpendType: (id: string) => void;

  // Classifications CRUD
  addClassification: (name: string) => void;
  deleteClassification: (name: string) => void;

  addCampaign: (campaign: Campaign) => void;
  updateCampaign: (id: string, updates: Partial<Campaign>) => void;
  updateCampaignStatus: (id: string, status: CampaignStatus) => void;

  addWorkflowEvent: (event: Omit<WorkflowEvent, 'id' | 'timestamp'>) => void;

  setSkipDistributorApproval: (skip: boolean) => void;

  saveMappingConfig: (name: string, mapping: Partial<ColumnMappingConfig>) => void;
  deleteMappingConfig: (name: string) => void;

  importRawData: (
    rows: Record<string, unknown>[],
    mapping: Partial<ColumnMappingConfig>,
  ) => { summary: { total_rows: number; valid_rows: number; dropped_rows: number; customers_count: number; items_count: number; date_range: { min: string; max: string } } };
}

function loadOrDefault<T>(key: string, fallback: T): T {
  try {
    const stored = localStorage.getItem(`ts_${key}`);
    if (stored) return JSON.parse(stored);
  } catch { /* ignore */ }
  return fallback;
}

function generateId(): string {
  return Math.random().toString(36).substring(2, 10);
}

function nextCampaignId(campaigns: Campaign[]): string {
  const maxNum = campaigns.reduce((max, c) => {
    const n = parseInt(c.id.replace('TS-', ''), 10);
    return isNaN(n) ? max : Math.max(max, n);
  }, 0);
  return `TS-${String(maxNum + 1).padStart(6, '0')}`;
}

function parseDate(val: unknown): string | null {
  if (val == null || val === '') return null;
  const s = String(val).trim();

  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.substring(0, 10);

  if (/^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}$/.test(s)) {
    const parts = s.split(/[\/\-]/);
    const m = parts[0].padStart(2, '0');
    const d = parts[1].padStart(2, '0');
    let y = parts[2];
    if (y.length === 2) y = '20' + y;
    return `${y}-${m}-${d}`;
  }

  const num = Number(val);
  if (!isNaN(num) && num > 40000 && num < 60000) {
    const epoch = new Date((num - 25569) * 86400 * 1000);
    const yyyy = epoch.getFullYear();
    const mm = String(epoch.getMonth() + 1).padStart(2, '0');
    const dd = String(epoch.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  return null;
}

function parseNumber(val: unknown): number {
  if (val == null || val === '') return 0;
  if (typeof val === 'number') return val;
  const cleaned = String(val).replace(/[,\s]/g, '');
  const n = parseFloat(cleaned);
  return isNaN(n) ? 0 : n;
}

export const useTradeSpendStore = create<TradeSpendState>((set, get) => ({
  currentUser: loadOrDefault('currentUser', DEMO_USERS[0]),
  users: loadOrDefault('users', DEMO_USERS),
  customers: loadOrDefault('customers', [...DEMO_CUSTOMERS]),
  items: loadOrDefault('items', [...DEMO_ITEMS]),
  transactions: loadOrDefault('transactions', [...DEMO_TRANSACTIONS]),
  spendTypes: loadOrDefault('spendTypes', [...DEMO_SPEND_TYPES]),
  campaigns: loadOrDefault('campaigns', [...DEMO_CAMPAIGNS]),
  workflowEvents: loadOrDefault('workflowEvents', []),
  savedMappings: loadOrDefault('saved_mappings', []),
  classifications: loadOrDefault('classifications', ["wholesale","discounter","roastery","grocery","sweets"]),
  latestDataDate: loadOrDefault('latestDataDate', DEMO_TRANSACTIONS.reduce(
    (max, t) => (t.date > max ? t.date : max),
    '1970-01-01',
  )),
  skipDistributorApproval: loadOrDefault('skipDistributorApproval', false),
  distributors: loadOrDefault('distributors', [
    { id: 'dist-relaia', name: 'Relaia', code: 'REL', active: true, created_at: '2026-01-01' },
    { id: 'dist-tofola', name: 'Tofola', code: 'TOF', active: true, created_at: '2026-01-01' },
    { id: 'dist-gulf', name: 'Gulf Food Supply', code: 'GFS', active: true, created_at: '2026-01-01' },
    { id: 'dist-tala', name: 'Tala', code: 'TAL', active: true, created_at: '2026-01-01' },
  ]),
  currentDistributorId: loadOrDefault('currentDistributorId', 'dist-relaia'),

  setCurrentUser: (user) => set({ currentUser: user }),
  switchRole: (userId) => {
    const user = get().users.find((u) => u.id === userId);
    if (user) set({ currentUser: user });
  },

  addUser: (user) => {
    const newUser: TradeSpendUser = {
      ...user,
      password: (user as any).password || 'Roshen2026',
      id: `user-${generateId()}`,
      created_at: new Date().toISOString(),
    };
    set((s) => ({ users: [...s.users, newUser] }));
  },

  updateUser: (id, updates) => {
    set((s) => ({
      users: s.users.map((u) => (u.id === id ? { ...u, ...updates } : u)),
    }));
  },

  deleteUser: (id) => {
    set((s) => ({ users: s.users.filter((u) => u.id !== id) }));
  },

  addDistributor: (d) => {
    const newDist: Distributor = {
      ...d,
      id: `dist-${generateId()}`,
      created_at: new Date().toISOString(),
    };
    set((s) => ({ distributors: [...s.distributors, newDist] }));
  },

  updateDistributor: (id, updates) => {
    set((s) => ({
      distributors: s.distributors.map((d) => (d.id === id ? { ...d, ...updates } : d)),
    }));
  },

  deleteDistributor: (id) => {
    set((s) => ({ distributors: s.distributors.filter((d) => d.id !== id) }));
  },

  setCurrentDistributor: (id) => set({ currentDistributorId: id }),

  setTransactions: (txns) => set({ transactions: txns }),
  setCustomers: (custs) => set({ customers: custs }),
  setItems: (items) => set({ items }),
  updateLatestDataDate: () => {
    const max = get().transactions.reduce(
      (m, t) => (t.date > m ? t.date : m),
      '1970-01-01',
    );
    set({ latestDataDate: max });
  },

  updateCustomerClassification: (account, classification) => {
    set((s) => ({
      customers: s.customers.map((c) =>
        c.account === account ? { ...c, classification } : c,
      ),
      campaigns: s.campaigns.map((c) =>
        c.account === account ? { ...c, classification } : c,
      ),
    }));
  },

  addSpendType: (name) => {
    set((s) => ({
      spendTypes: [...s.spendTypes, { id: `st-${generateId()}`, name }],
    }));
  },

  updateSpendType: (id, name) => {
    set((s) => ({
      spendTypes: s.spendTypes.map((t) => (t.id === id ? { ...t, name } : t)),
    }));
  },

  deleteSpendType: (id) => {
    set((s) => ({ spendTypes: s.spendTypes.filter((t) => t.id !== id) }));
  },

  addClassification: (name) => {
    set((s) => {
      const next = [...s.classifications, name];
      localStorage.setItem('ts_classifications', JSON.stringify(next));
      return { classifications: next };
    });
  },

  deleteClassification: (name) => {
    set((s) => {
      const next = s.classifications.filter((c) => c !== name);
      localStorage.setItem('ts_classifications', JSON.stringify(next));
      return { classifications: next };
    });
  },

  addCampaign: (campaign) => {
    const id = nextCampaignId(get().campaigns);
    set((s) => ({
      campaigns: [...s.campaigns, { ...campaign, id }],
    }));
  },

  updateCampaign: (id, updates) => {
    set((s) => ({
      campaigns: s.campaigns.map((c) =>
        c.id === id ? { ...c, ...updates } : c,
      ),
    }));
  },

  updateCampaignStatus: (id, status) => {
    const now = new Date().toISOString();
    set((s) => ({
      campaigns: s.campaigns.map((c) => {
        if (c.id !== id) return c;
        const upd: Partial<Campaign> = { status };
        if (status === 'pending_distributor') upd.submitted_at = now;
        if (status === 'pending_roshen') upd.approved_distributor_at = now;
        if (status === 'approved_pending_photos') upd.approved_roshen_at = now;
        if (status === 'photos_submitted') upd.photos_submitted_at = now;
        if (status === 'final_approved') upd.final_approved_at = now;
        if (status === 'rejected') upd.rejected_at = now;
        return { ...c, ...upd };
      }),
    }));
  },

  addWorkflowEvent: (event) => {
    set((s) => ({
      workflowEvents: [
        ...s.workflowEvents,
        { ...event, id: generateId(), timestamp: new Date().toISOString() },
      ],
    }));
  },

  setSkipDistributorApproval: (skip) => {
    try { localStorage.setItem('ts_skipDistributorApproval', JSON.stringify(skip)); } catch { /* */ }
    set({ skipDistributorApproval: skip });
  },

  saveMappingConfig: (name, mapping) => {
    set((s) => {
      const filtered = s.savedMappings.filter((m) => m.name !== name);
      const next = [...filtered, { name, mapping }];
      localStorage.setItem('ts_saved_mappings', JSON.stringify(next));
      return { savedMappings: next };
    });
  },

  deleteMappingConfig: (name) => {
    set((s) => {
      const next = s.savedMappings.filter((m) => m.name !== name);
      localStorage.setItem('ts_saved_mappings', JSON.stringify(next));
      return { savedMappings: next };
    });
  },

  importRawData: (rows, mapping) => {
    const custMap = new Map<string, TradeSpendCustomer>();
    const itemMap = new Map<string, TradeSpendItem>();
    const txns: SalesTransaction[] = [];
    let dropped = 0;

    for (const existing of get().customers) {
      custMap.set(existing.account, existing);
    }
    for (const existing of get().items) {
      itemMap.set(existing.id, existing);
    }

    for (const row of rows) {
      const account = mapping.customer_account
        ? String(row[mapping.customer_account] ?? '').trim()
        : '';
      const itemId = mapping.item_id
        ? String(row[mapping.item_id] ?? '').trim()
        : '';
      const dateRaw = mapping.invoice_date ? row[mapping.invoice_date] : null;
      const date = parseDate(dateRaw);

      if (!account || !itemId || !date) {
        dropped++;
        continue;
      }

      const value = parseNumber(
        mapping.invoice_amount ? row[mapping.invoice_amount] : 0,
      );
      const cases = parseNumber(
        mapping.invoice_qty_cases ? row[mapping.invoice_qty_cases] : 0,
      );

      if (!custMap.has(account)) {
        custMap.set(account, {
          account,
          name: mapping.customer_name
            ? String(row[mapping.customer_name] ?? account)
            : account,
          class: mapping.customer_class
            ? String(row[mapping.customer_class] ?? '')
            : undefined,
          channel: mapping.customer_channel
            ? String(row[mapping.customer_channel] ?? '')
            : undefined,
          created_at: new Date().toISOString(),
        });
      }

      if (!itemMap.has(itemId)) {
        itemMap.set(itemId, {
          id: itemId,
          description: mapping.item_description
            ? String(row[mapping.item_description] ?? itemId)
            : itemId,
        });
      }

      txns.push({
        id: `tx-${generateId()}-${txns.length}`,
        account,
        item_id: itemId,
        date,
        value_ex_vat: value,
        cases,
      });
    }

    const allCustomers = Array.from(custMap.values());
    const allItems = Array.from(itemMap.values());
    const allTxns = [...get().transactions, ...txns];

    const dates = txns.map((t) => t.date).sort();
    const summary = {
      total_rows: rows.length,
      valid_rows: txns.length,
      dropped_rows: dropped,
      customers_count: allCustomers.length,
      items_count: allItems.length,
      date_range: {
        min: dates[0] || '',
        max: dates[dates.length - 1] || '',
      },
    };

    set({
      customers: allCustomers,
      items: allItems,
      transactions: allTxns,
      latestDataDate: allTxns.reduce(
        (m, t) => (t.date > m ? t.date : m),
        '1970-01-01',
      ),
    });

    return { summary };
  },
}));

// Persist to localStorage on changes
const PERSIST_KEYS = ['currentUser', 'users', 'customers', 'items', 'transactions', 'campaigns', 'workflowEvents', 'spendTypes', 'latestDataDate', 'distributors', 'currentDistributorId'] as const;

useTradeSpendStore.subscribe((state, prevState) => {
  for (const key of PERSIST_KEYS) {
    if (state[key] !== prevState[key]) {
      try {
        localStorage.setItem(`ts_${key}`, JSON.stringify(state[key]));
      } catch { /* quota exceeded — ignore */ }
    }
  }
});
