// Fast Food POS — DEVICE ABSTRACTION LAYER (interfaces).
//
// POS hardware is accessed ONLY through these provider interfaces so callers never hardcode a
// device. The first version ships a BROWSER implementation (browser print, no cash drawer);
// ESC/POS thermal printing, a network/printer bridge, a cash-drawer kick, and a kitchen
// printer/KDS plug in later as alternative providers WITHOUT changing the POS terminal. The
// receipt is built from invoice DATA (see receipt-model.ts), not HTML, so every renderer
// (browser / thermal / desktop) consumes the same source of truth — keeping the ZATCA-ready
// invoice structure intact.

export type PrintMode = 'browser' | 'escpos' | 'bridge';

export interface PrintJob {
  /** What to print. 'receipt' = customer ZATCA receipt; 'kitchen' = KOT (future). */
  kind: 'receipt' | 'kitchen';
  /** The issued POS invoice id (source of truth lives in erp_pos_invoices). */
  invoiceId: string;
  /** Fallback when there is no POS invoice (e.g. order-only) — the restaurant order id. */
  orderId?: string | null;
  /** Open the cash drawer with this job (cash sales). Honoured only when supported. */
  openDrawer?: boolean;
}
export interface PrintResult { ok: boolean; mode: PrintMode; error?: string }

export interface PrintProvider {
  readonly mode: PrintMode;
  print(job: PrintJob): Promise<PrintResult>;
}

export interface CashDrawerProvider {
  readonly canOpen: boolean;
  /** Open the drawer. Browser provider is a safe no-op; ESC/POS sends the kick command later. */
  open(): Promise<void>;
}

/** Scanner is already provided by the shared, isolated scanner component (camera +
 *  keyboard-wedge). This describes that contract so a future provider can swap in. */
export interface ScannerCapabilities { camera: boolean; wedge: boolean; manual: boolean }

export interface PosDeviceCapabilities {
  print: PrintMode;
  cashDrawer: boolean;
  escpos: boolean;
  bridge: boolean;
  scanner: ScannerCapabilities;
}

export interface PosDevices {
  printer: PrintProvider;
  cashDrawer: CashDrawerProvider;
  capabilities: PosDeviceCapabilities;
}
