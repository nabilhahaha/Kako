/* NOT FROZEN — native-dashboard glue over the verbatim frozen promotion
 * engines. This module only orchestrates boot, change notification and
 * typed read access; every business figure comes from the frozen modules.
 *
 * Data compatibility: the frozen modules keep their original storage
 * identities (localStorage `roshen_pb_promotions_v1`, the
 * `roshen_platform_v2:` preference namespace, IndexedDB
 * `roshen_platform_datapool_v1` and the `roshen_platform_sync`
 * BroadcastChannel), so the untouched reference application and this
 * native module read and write the same data and stay in sync across tabs.
 */
import { toast } from 'sonner';
import { engine } from './frozen/engine-bootstrap.js';
import { PBModel } from './frozen/pb-model.js';
import { DataStore, AUDITED_SOURCES } from './frozen/data-pool.js';
import { PromoSimulator } from './frozen/promo-simulator.js';
import { PromoPublisher } from './frozen/promo-publisher.js';
import { Seeds } from './frozen/seeds.js';
import { Store } from './frozen/store.js';
import { setToastHandler } from './ui-bridge.js';

export interface BuilderPromo {
  id: string;
  status: 'draft' | 'active' | 'paused';
  rewardType: 'free_product' | 'cash_reward' | 'discount_pct' | 'salesman_reward';
  name: string;
  startDate: string;
  endDate: string;
  customerScope: 'all' | 'selected';
  customerCodes: string[];
  buyQty: number | null;
  buyUnit?: 'cases' | 'pcs';
  productCodes: string[];
  qtyMode: 'combined' | 'each';
  reward: {
    rewardProduct: string;
    rewardQty: number | null;
    rewardAmount: number | null;
    discountPct: number | null;
  };
  repIncentive?: { minCustomers: number; supervisorAmount: number };
  rev?: number;
  createdAt: number;
  updatedAt: number;
}

export interface CampaignView {
  id: string;
  displayName: string;
  startDate: string;
  mechanic: string;
  plannedRatio: number;
  actualRatio: number | null;
  rate: number;
  freeValue: number;
  compensation: number;
  compensationInclVat: number;
  recipients: number;
  invoiceCount: number;
  health: 'critical' | 'warning' | 'healthy' | 'attention' | 'neutral';
  isPublished: boolean;
  isAudited: boolean;
  isHidden: boolean;
}

export interface SimResult {
  rows: Array<{
    cust: string; code: string; city: string; rep: string;
    bought: number; paidValue: number; achievements: number;
  }>;
  buyers: number;
  qualifying: number;
  achievements: number;
  invoices: number;
  poolSize: number;
  coverage: { label: string } | null;
  rewardType: BuilderPromo['rewardType'];
  rewardLabel: string;
  freeCases: number | null;
  unitPrice: number | null;
  cost: number | null;
  note: string;
  unitShort: 'pcs' | 'cs';
  repMin?: number;
  repsTotal?: number;
  repsAchieved?: number;
  perRep?: Array<{ rep: string; customers: number; achieved: boolean; payout: number }>;
}

export interface PoolInfo {
  mode: 'idb' | 'local' | 'memory';
  batches: Array<{ id: string; name: string; from: string; to: string; nInv: number; nRows: number }>;
  version: number;
}

let booted: Promise<void> | null = null;
let version = 0;
const listeners = new Set<() => void>();

function emit() {
  version++;
  listeners.forEach((l) => l());
}

function resync() {
  try {
    PromoPublisher.sync();
  } catch (e) {
    console.warn('[promotions] publisher resync failed', e);
  }
  emit();
}

/** Idempotent async boot mirroring the reference App.boot() order for the
 * promotion domain: data pool → seeds → publisher. */
export function initPromotionsRuntime(): Promise<void> {
  if (booted) return booted;
  setToastHandler((msg, kind) => {
    if (kind === 'err') toast.error(msg);
    else if (kind === 'warn') toast.warning(msg);
    else if (kind === 'ok') toast.success(msg);
    else toast(msg);
  });
  booted = (async () => {
    await DataStore.init();
    Seeds.merge();
    PromoPublisher.sync();

    // Cross-tab / cross-app sync — same signals the reference app uses.
    if (typeof BroadcastChannel !== 'undefined') {
      const bc = new BroadcastChannel('roshen_platform_sync');
      bc.onmessage = () => resync();
    }
    window.addEventListener('storage', (e) => {
      if (e.key && e.key.includes('roshen')) resync();
    });
    let lastRaw = localStorage.getItem('roshen_pb_promotions_v1');
    const focusCheck = () => {
      let raw: string | null = null;
      try { raw = localStorage.getItem('roshen_pb_promotions_v1'); } catch { /* blocked */ }
      if (raw !== lastRaw) { lastRaw = raw; resync(); }
    };
    window.addEventListener('focus', focusCheck);
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) focusCheck();
    });
    emit();
  })();
  return booted;
}

/** React 18 external-store subscription pair. */
export function subscribePromotions(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
export function getPromotionsVersion(): number {
  return version;
}

/** Notify the runtime (and every other tab / the reference app) after a
 * local mutation. Mirrors the reference App.announceChange(). */
export function announcePromotionsChange(): void {
  resync();
  try {
    if (typeof BroadcastChannel !== 'undefined') {
      new BroadcastChannel('roshen_platform_sync').postMessage({ t: Date.now() });
    }
  } catch { /* unavailable */ }
}

const auditedIds = new Set<string>((AUDITED_SOURCES as Array<{ id: string }>).map((p) => p.id));

export function getCampaigns(): CampaignView[] {
  const hidden: string[] = Store.get('hiddenCampaigns', []);
  return (engine.promotions as Array<Record<string, unknown>>).map((p) => ({
    id: p.id as string,
    displayName: p.displayName as string,
    startDate: p.startDate as string,
    mechanic: p.mechanic as string,
    plannedRatio: p.plannedRatio as number,
    actualRatio: p.actualRatio as number | null,
    rate: p.rate as number,
    freeValue: p.freeValue as number,
    compensation: p.compensation as number,
    compensationInclVat: p.compensationInclVat as number,
    recipients: p.recipients as number,
    invoiceCount: p.invoiceCount as number,
    health: p.health as CampaignView['health'],
    isPublished: String(p.id).startsWith('pbpub_'),
    isAudited: auditedIds.has(p.id as string),
    isHidden: hidden.includes(p.id as string),
  }));
}

export function getBuilderPromos(): BuilderPromo[] {
  return PBModel.load() as BuilderPromo[];
}

export function isRepIncentive(p: BuilderPromo): boolean {
  return Boolean(p.repIncentive && Number(p.repIncentive.minCustomers) > 0);
}

export function simulatePromo(p: BuilderPromo): SimResult | null {
  try {
    return PromoSimulator.analyze(p) as SimResult;
  } catch (e) {
    console.warn('[promotions] simulation failed for', p.id, e);
    return null;
  }
}

export function getPoolInfo(): PoolInfo {
  const batches = (DataStore.batches() as PoolInfo['batches']) || [];
  return { mode: DataStore.mode as PoolInfo['mode'], batches, version: DataStore.version as number };
}

export function getPortfolioTotals(): {
  compensation: number; compensationInclVat: number; freeValue: number;
  recipients: number; invoices: number; campaigns: number;
} {
  return {
    compensation: engine.portfolioCompensation as number,
    compensationInclVat: engine.portfolioCompensationInclVat as number,
    freeValue: engine.portfolioFreeValue as number,
    recipients: engine.portfolioRecipients as number,
    invoices: engine.portfolioInvoices as number,
    campaigns: (engine.promotions as unknown[]).length,
  };
}
