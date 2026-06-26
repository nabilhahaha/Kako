/**
 * Fast Food POS — receipt print settings (per-device, manager-configurable).
 *
 * Printer settings are inherently per-till (each station has its own printer + paper), so they
 * live in localStorage keyed by company — no DB migration, no cross-company leakage. A future
 * ESC/POS bridge reads the SAME settings object, so nothing here is browser-specific beyond
 * persistence. Pure helpers (defaults + the receipt query builder) are unit-tested.
 */

export interface PosPrintSettings {
  /** Print the receipt automatically the moment a sale succeeds. */
  autoPrint: boolean;
  /** Thermal paper width — drives the @page size on the receipt. */
  paperWidth: '80' | '58';
  showLogo: boolean;
  showQr: boolean;
  showCashier: boolean;
}

export const DEFAULT_PRINT_SETTINGS: PosPrintSettings = {
  autoPrint: true,
  paperWidth: '80',
  showLogo: true,
  showQr: true,
  showCashier: true,
};

const storeKey = (companyId: string) => `pos:print-settings:${companyId}`;

/** Load settings for a company (defaults when absent/corrupt). SSR-safe (returns defaults). */
export function loadPrintSettings(companyId: string): PosPrintSettings {
  if (typeof window === 'undefined' || !companyId) return { ...DEFAULT_PRINT_SETTINGS };
  try {
    const raw = window.localStorage.getItem(storeKey(companyId));
    if (!raw) return { ...DEFAULT_PRINT_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<PosPrintSettings>;
    return normalizePrintSettings(parsed);
  } catch {
    return { ...DEFAULT_PRINT_SETTINGS };
  }
}

/** Persist settings for a company. No-op on the server. */
export function savePrintSettings(companyId: string, settings: PosPrintSettings): void {
  if (typeof window === 'undefined' || !companyId) return;
  try { window.localStorage.setItem(storeKey(companyId), JSON.stringify(normalizePrintSettings(settings))); } catch { /* quota / disabled */ }
}

/** Coerce an arbitrary stored object into a valid settings shape (pure). */
export function normalizePrintSettings(s: Partial<PosPrintSettings> | null | undefined): PosPrintSettings {
  const v = s ?? {};
  return {
    autoPrint: typeof v.autoPrint === 'boolean' ? v.autoPrint : DEFAULT_PRINT_SETTINGS.autoPrint,
    paperWidth: v.paperWidth === '58' ? '58' : '80',
    showLogo: typeof v.showLogo === 'boolean' ? v.showLogo : DEFAULT_PRINT_SETTINGS.showLogo,
    showQr: typeof v.showQr === 'boolean' ? v.showQr : DEFAULT_PRINT_SETTINGS.showQr,
    showCashier: typeof v.showCashier === 'boolean' ? v.showCashier : DEFAULT_PRINT_SETTINGS.showCashier,
  };
}

/** Build the receipt-route query string from settings (+ optional cash received/change). Pure,
 *  so the same string drives browser print today and any future renderer. Always includes
 *  autoprint=1 (the print route fires the dialog on load). */
export function receiptQuery(settings: PosPrintSettings, opts?: { received?: number | null; change?: number | null; autoprint?: boolean }): string {
  const p = new URLSearchParams();
  if (opts?.autoprint !== false) p.set('autoprint', '1');
  p.set('w', settings.paperWidth);
  p.set('logo', settings.showLogo ? '1' : '0');
  p.set('qr', settings.showQr ? '1' : '0');
  p.set('cashier', settings.showCashier ? '1' : '0');
  if (opts?.received != null && Number.isFinite(opts.received)) p.set('recv', String(opts.received));
  if (opts?.change != null && Number.isFinite(opts.change)) p.set('chg', String(opts.change));
  return p.toString();
}
