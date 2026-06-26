// Fast Food POS — BROWSER device providers (the first, always-available implementation).
//
// Print: opens the data-driven ZATCA receipt route and triggers the browser print dialog,
// keeping the cashier ON the POS for the next order. Cash drawer: a safe no-op (browsers
// cannot open a drawer; the ESC/POS or desktop-bridge provider will send the kick later).
// No native/device dependencies — safe for plain web deployment.

import type { PrintProvider, PrintJob, PrintResult, CashDrawerProvider, PosDeviceCapabilities } from './types';

export function receiptUrl(job: PrintJob): string {
  // The print settings query (paper width, show flags, received/change) already carries
  // autoprint=1; fall back to a bare autoprint when no settings query was supplied.
  const q = job.query && job.query.length > 0 ? job.query : 'autoprint=1';
  if (job.invoiceId) return `/print/pos/${job.invoiceId}?${q}`;
  if (job.orderId) return `/print/restaurant/order/${job.orderId}?${q}`;
  return '/pos';
}

export const browserPrintProvider: PrintProvider = {
  mode: 'browser',
  async print(job: PrintJob): Promise<PrintResult> {
    if (typeof window === 'undefined') return { ok: false, mode: 'browser', error: 'no_window' };
    // Open the receipt for printing in a new context so the POS stays ready (fast service).
    const w = window.open(receiptUrl(job), '_blank', 'noopener');
    if (!w) return { ok: false, mode: 'browser', error: 'popup_blocked' };
    return { ok: true, mode: 'browser' };
  },
};

export const noopCashDrawer: CashDrawerProvider = {
  canOpen: false,
  async open(): Promise<void> { /* browser cannot open a drawer; ESC/POS kick added later */ },
};

export const browserCapabilities: PosDeviceCapabilities = {
  print: 'browser', cashDrawer: false, escpos: false, bridge: false,
  scanner: { camera: true, wedge: true, manual: true },
};
