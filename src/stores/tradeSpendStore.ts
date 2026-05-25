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
  AppNotification,
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

export type ViewMode = 'distributor' | 'admin' | 'unified_dashboard';

interface DistributorSummary {
  distId: string;
  distName: string;
  campaignCount: number;
  customerCount: number;
  totalSpend: number;
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
  viewMode: ViewMode;
  notifications: AppNotification[];

  setCurrentUser: (user: TradeSpendUser | null) => void;
  switchRole: (userId: string) => void;

  // View mode
  setViewMode: (mode: ViewMode) => void;

  // Distributor switching (multi-tenant)
  switchDistributor: (distId: string) => void;

  // All distributors summary for unified dashboard
  getAllDistributorsSummary: () => DistributorSummary[];

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

  // Notifications
  addNotification: (n: Omit<AppNotification, 'id' | 'timestamp' | 'read'>) => void;
  markNotificationRead: (id: string) => void;
  markAllNotificationsRead: () => void;
  unreadCount: () => number;

  saveMappingConfig: (name: string, mapping: Partial<ColumnMappingConfig>) => void;
  deleteMappingConfig: (name: string) => void;

  importRawData: (
    rows: Record<string, unknown>[],
    mapping: Partial<ColumnMappingConfig>,
  ) => { summary: { total_rows: number; valid_rows: number; dropped_rows: number; customers_count: number; items_count: number; date_range: { min: string; max: string } } };
}

/* -------------------------------------------------------------------------- */
/*  localStorage helpers                                                      */
/* -------------------------------------------------------------------------- */

/** Load a value from localStorage (no distributor prefix — global keys). */
function loadGlobal<T>(key: string, fallback: T): T {
  try {
    const stored = localStorage.getItem(`ts_${key}`);
    if (stored) return JSON.parse(stored);
  } catch { /* ignore */ }
  return fallback;
}

/** Load a value scoped to a specific distributor. */
function loadDistScoped<T>(distId: string, key: string, fallback: T): T {
  try {
    const stored = localStorage.getItem(`ts_${distId}_${key}`);
    if (stored) return JSON.parse(stored);
  } catch { /* ignore */ }
  return fallback;
}

/** Save a value scoped to a specific distributor. */
function saveDistScoped(distId: string, key: string, value: unknown): void {
  try {
    localStorage.setItem(`ts_${distId}_${key}`, JSON.stringify(value));
  } catch { /* quota exceeded — ignore */ }
}

/** Load all distributor-specific data slices from localStorage (or demo defaults). */
function loadDistributorData(distId: string) {
  return {
    users: loadDistScoped(distId, 'users', [...DEMO_USERS]),
    customers: loadDistScoped(distId, 'customers', [...DEMO_CUSTOMERS]),
    items: loadDistScoped(distId, 'items', [...DEMO_ITEMS]),
    transactions: loadDistScoped(distId, 'transactions', [...DEMO_TRANSACTIONS]),
    campaigns: loadDistScoped(distId, 'campaigns', [...DEMO_CAMPAIGNS]),
    workflowEvents: loadDistScoped<WorkflowEvent[]>(distId, 'workflowEvents', []),
    spendTypes: loadDistScoped(distId, 'spendTypes', [...DEMO_SPEND_TYPES]),
    classifications: loadDistScoped(distId, 'classifications', ['wholesale', 'discounter', 'roastery', 'grocery', 'sweets']),
    savedMappings: loadDistScoped<SavedColumnMapping[]>(distId, 'savedMappings', []),
    skipDistributorApproval: loadDistScoped(distId, 'skipDistributorApproval', false),
    notifications: loadDistScoped<AppNotification[]>(distId, 'notifications', []),
  };
}

/** Persist the current distributor's data slices to localStorage. */
function saveCurrentDistributorData(distId: string, state: TradeSpendState): void {
  const DIST_KEYS: (keyof TradeSpendState)[] = [
    'users', 'customers', 'items', 'transactions', 'campaigns',
    'workflowEvents', 'spendTypes', 'classifications', 'savedMappings',
    'skipDistributorApproval', 'notifications',
  ];
  for (const key of DIST_KEYS) {
    saveDistScoped(distId, key, state[key]);
  }
  // Also persist latestDataDate
  saveDistScoped(distId, 'latestDataDate', state.latestDataDate);
}

/* -------------------------------------------------------------------------- */
/*  Utility helpers                                                           */
/* -------------------------------------------------------------------------- */

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

  // Handle Date objects (from XLSX cellDates)
  if (val instanceof Date) {
    const yyyy = val.getFullYear();
    const mm = String(val.getMonth() + 1).padStart(2, '0');
    const dd = String(val.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  const s = String(val).trim();

  // ISO format: 2025-12-28 or 2025-12-28T12:12:30
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.substring(0, 10);

  // dd/mm/yyyy or dd-mm-yyyy or mm/dd/yyyy
  if (/^\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}$/.test(s)) {
    const parts = s.split(/[\/\-\.]/);
    let d = parts[0], m = parts[1], y = parts[2];
    if (y.length === 2) y = '20' + y;
    // If first part > 12, it's dd/mm/yyyy
    if (parseInt(d) > 12) { const tmp = d; d = m; m = tmp; }
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }

  // yyyy/mm/dd
  if (/^\d{4}[\/\.]\d{1,2}[\/\.]\d{1,2}$/.test(s)) {
    const parts = s.split(/[\/\.]/);
    return `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
  }

  // Excel serial number (e.g., 45654)
  const num = Number(val);
  if (!isNaN(num) && num > 30000 && num < 70000) {
    const epoch = new Date((num - 25569) * 86400 * 1000);
    const yyyy = epoch.getFullYear();
    const mm = String(epoch.getMonth() + 1).padStart(2, '0');
    const dd = String(epoch.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  // Try native Date parse as last resort
  try {
    const d = new Date(s);
    if (!isNaN(d.getTime()) && d.getFullYear() > 2000) {
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      return `${yyyy}-${mm}-${dd}`;
    }
  } catch { /* ignore */ }

  return null;
}

function parseNumber(val: unknown): number {
  if (val == null || val === '') return 0;
  if (typeof val === 'number') return val;
  const cleaned = String(val).replace(/[,\s]/g, '');
  const n = parseFloat(cleaned);
  return isNaN(n) ? 0 : n;
}

/* -------------------------------------------------------------------------- */
/*  Resolve initial distributor & load its data                               */
/* -------------------------------------------------------------------------- */

const DEFAULT_DISTRIBUTORS: Distributor[] = [
  { id: 'dist-relaia', name: 'Relaia', code: 'REL', active: true, created_at: '2026-01-01' },
  { id: 'dist-tofola', name: 'Tofola', code: 'TOF', active: true, created_at: '2026-01-01' },
  { id: 'dist-gulf', name: 'Gulf Food Supply', code: 'GFS', active: true, created_at: '2026-01-01' },
  { id: 'dist-tala', name: 'Tala', code: 'TAL', active: true, created_at: '2026-01-01' },
];

const initialDistributors = loadGlobal<Distributor[]>('distributors', DEFAULT_DISTRIBUTORS);
const initialDistId = loadGlobal<string | null>('currentDistributorId', initialDistributors[0]?.id ?? null);
const initialDistData = initialDistId ? loadDistributorData(initialDistId) : loadDistributorData('dist-relaia');

export const useTradeSpendStore = create<TradeSpendState>((set, get) => ({
  currentUser: null, // always null until login
  users: initialDistData.users,
  customers: initialDistData.customers,
  items: initialDistData.items,
  transactions: initialDistData.transactions,
  spendTypes: initialDistData.spendTypes,
  campaigns: initialDistData.campaigns,
  workflowEvents: initialDistData.workflowEvents,
  savedMappings: initialDistData.savedMappings,
  classifications: initialDistData.classifications,
  skipDistributorApproval: initialDistData.skipDistributorApproval,
  notifications: initialDistData.notifications,
  latestDataDate: loadDistScoped(
    initialDistId || 'dist-relaia',
    'latestDataDate',
    DEMO_TRANSACTIONS.reduce((max, t) => (t.date > max ? t.date : max), '1970-01-01'),
  ),
  distributors: initialDistributors,
  currentDistributorId: initialDistId,
  viewMode: loadGlobal<ViewMode>('viewMode', 'distributor'),

  setCurrentUser: (user) => set({ currentUser: user }),
  switchRole: (userId) => {
    const user = get().users.find((u) => u.id === userId);
    if (user) set({ currentUser: user });
  },

  /* ---- View mode ---- */
  setViewMode: (mode) => set({ viewMode: mode }),

  /* ---- Multi-tenant distributor switching ---- */
  switchDistributor: (distId) => {
    const state = get();
    // 1. Save current distributor's data (only if switching to a DIFFERENT one)
    if (state.currentDistributorId && state.currentDistributorId !== distId) {
      saveCurrentDistributorData(state.currentDistributorId, state);
    }
    // 2. Load new distributor's data
    const newData = loadDistributorData(distId);
    const newLatest = loadDistScoped(
      distId,
      'latestDataDate',
      DEMO_TRANSACTIONS.reduce((max, t) => (t.date > max ? t.date : max), '1970-01-01'),
    );
    // 3. Set all state at once, clear currentUser
    set({
      ...newData,
      currentDistributorId: distId,
      currentUser: null,
      latestDataDate: newLatest,
    });
  },

  /* ---- Unified dashboard summary ---- */
  getAllDistributorsSummary: () => {
    const distributors = get().distributors.filter((d) => d.active);
    const currentDistId = get().currentDistributorId;

    return distributors.map((d) => {
      // For the currently-loaded distributor, read from state; otherwise from localStorage
      if (d.id === currentDistId) {
        const state = get();
        return {
          distId: d.id,
          distName: d.name,
          campaignCount: state.campaigns.length,
          customerCount: state.customers.length,
          totalSpend: state.campaigns.reduce((s, c) => s + c.spend_amount, 0),
        };
      }
      const campaigns = loadDistScoped<Campaign[]>(d.id, 'campaigns', [...DEMO_CAMPAIGNS]);
      const customers = loadDistScoped<TradeSpendCustomer[]>(d.id, 'customers', [...DEMO_CUSTOMERS]);
      return {
        distId: d.id,
        distName: d.name,
        campaignCount: campaigns.length,
        customerCount: customers.length,
        totalSpend: campaigns.reduce((s, c) => s + c.spend_amount, 0),
      };
    });
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
      return { classifications: next };
    });
  },

  deleteClassification: (name) => {
    set((s) => {
      const next = s.classifications.filter((c) => c !== name);
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

    // Auto-generate notification based on status change
    const notifMap: Record<CampaignStatus, { type: AppNotification['type']; title: string; message: string } | null> = {
      draft: null,
      pending_distributor: { type: 'approval_pending', title: 'New Request', message: 'New request awaiting Trade Marketing approval' },
      pending_roshen: { type: 'approval_pending', title: 'Awaiting Roshen', message: 'Request awaiting Roshen approval' },
      approved_pending_photos: { type: 'photos_needed', title: 'Photos Needed', message: `Budget approved — photos needed for ${id}` },
      photos_submitted: { type: 'info', title: 'Photos Submitted', message: 'Photos submitted — awaiting final approval' },
      final_approved: { type: 'approved', title: 'Approved', message: `Request ${id} has been finally approved ✅` },
      changes_requested: { type: 'changes_requested', title: 'Changes Requested', message: `Changes requested on ${id}` },
      rejected: { type: 'rejected', title: 'Rejected', message: `Request ${id} has been rejected` },
    };
    const notif = notifMap[status];
    if (notif) {
      get().addNotification({ ...notif, campaignId: id });
    }
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
    set({ skipDistributorApproval: skip });
  },

  /* ---- Notifications ---- */
  addNotification: (n) => {
    const notification: AppNotification = {
      ...n,
      id: generateId(),
      read: false,
      timestamp: new Date().toISOString(),
    };
    set((s) => ({ notifications: [notification, ...s.notifications] }));
  },

  markNotificationRead: (id) => {
    set((s) => ({
      notifications: s.notifications.map((n) =>
        n.id === id ? { ...n, read: true } : n,
      ),
    }));
  },

  markAllNotificationsRead: () => {
    set((s) => ({
      notifications: s.notifications.map((n) => ({ ...n, read: true })),
    }));
  },

  unreadCount: () => {
    return get().notifications.filter((n) => !n.read).length;
  },

  saveMappingConfig: (name, mapping) => {
    set((s) => {
      const filtered = s.savedMappings.filter((m) => m.name !== name);
      const next = [...filtered, { name, mapping }];
      return { savedMappings: next };
    });
  },

  deleteMappingConfig: (name) => {
    set((s) => {
      const next = s.savedMappings.filter((m) => m.name !== name);
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

    // Build a normalized key lookup for each row to handle whitespace/case issues
    function getVal(row: Record<string, unknown>, mappedCol: string | undefined): unknown {
      if (!mappedCol) return undefined;
      // Direct match first
      if (row[mappedCol] !== undefined) return row[mappedCol];
      // Try trimmed match
      const trimmed = mappedCol.trim();
      if (row[trimmed] !== undefined) return row[trimmed];
      // Try case-insensitive match
      const lower = trimmed.toLowerCase();
      for (const key of Object.keys(row)) {
        if (key.trim().toLowerCase() === lower) return row[key];
      }
      return undefined;
    }

    for (const row of rows) {
      const account = String(getVal(row, mapping.customer_account) ?? '').trim();
      const itemId = String(getVal(row, mapping.item_id) ?? '').trim();
      const dateRaw = getVal(row, mapping.invoice_date);
      const date = parseDate(dateRaw);

      if (!account || !itemId || !date) {
        if (dropped === 0) {
          console.warn('[importRawData] First dropped row:', {
            account, itemId, date, dateRaw,
            mappedCols: { custCol: mapping.customer_account, itemCol: mapping.item_id, dateCol: mapping.invoice_date },
            actualKeys: Object.keys(row).slice(0, 10),
            firstRowSample: Object.entries(row).slice(0, 5).map(([k, v]) => `${k}=${v}`),
          });
        }
        dropped++;
        continue;
      }

      const value = parseNumber(getVal(row, mapping.invoice_amount) ?? 0);
      const cases = parseNumber(getVal(row, mapping.invoice_qty_cases) ?? 0);

      if (!custMap.has(account)) {
        custMap.set(account, {
          account,
          name: String(getVal(row, mapping.customer_name) ?? account),
          class: mapping.customer_class ? String(getVal(row, mapping.customer_class) ?? '') : undefined,
          channel: mapping.customer_channel ? String(getVal(row, mapping.customer_channel) ?? '') : undefined,
          created_at: new Date().toISOString(),
        });
      }

      if (!itemMap.has(itemId)) {
        itemMap.set(itemId, {
          id: itemId,
          description: String(getVal(row, mapping.item_description) ?? itemId),
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

/* -------------------------------------------------------------------------- */
/*  Persist to localStorage on changes (distributor-scoped + global)          */
/* -------------------------------------------------------------------------- */

// Distributor-scoped keys — persisted under ts_{distId}_{key}
const DIST_PERSIST_KEYS: (keyof TradeSpendState)[] = [
  'users', 'customers', 'items', 'transactions', 'campaigns',
  'workflowEvents', 'spendTypes', 'classifications', 'savedMappings',
  'skipDistributorApproval', 'latestDataDate', 'notifications',
];

// Global keys — persisted under ts_{key} (no distributor prefix)
const GLOBAL_PERSIST_KEYS: (keyof TradeSpendState)[] = [
  'distributors', 'currentDistributorId', 'viewMode',
];

useTradeSpendStore.subscribe((state, prevState) => {
  // Persist distributor-scoped data
  const distId = state.currentDistributorId;
  if (distId) {
    for (const key of DIST_PERSIST_KEYS) {
      if (state[key] !== prevState[key]) {
        saveDistScoped(distId, key, state[key]);
      }
    }
  }

  // Persist global data
  for (const key of GLOBAL_PERSIST_KEYS) {
    if (state[key] !== prevState[key]) {
      try {
        localStorage.setItem(`ts_${key}`, JSON.stringify(state[key]));
      } catch { /* quota exceeded — ignore */ }
    }
  }
});
