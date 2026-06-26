// Fast Food POS — DEVICE BRIDGE integration point.
//
// Real restaurants need direct ESC/POS thermal printing + a cash drawer, like commercial POS.
// The web POS never speaks to hardware directly (no unsafe native deps in the browser). Instead
// a future local desktop/agent app — the "POS Device Bridge" — runs on the cashier machine,
// receives print / open-drawer COMMANDS from this web POS, renders the receipt from the SAME
// invoice data (the ZATCA-ready erp_pos_invoices payload remains the single source of truth),
// emits ESC/POS to the thermal printer, and opens the cash drawer via the printer kick command.
//
// Integration contract: the bridge installs a global on the POS machine's browser context:
//   window.__VANTORA_POS_BRIDGE__ = { printer, cashDrawer, capabilities }   // satisfies PosDevices
// When present, the POS terminal uses it automatically (ESC/POS + drawer); otherwise it falls
// back to browser print. A reference bridge could instead expose a localhost HTTP endpoint — a
// thin provider that POSTs { invoiceId } there drops in here without changing any caller.

import type { PosDevices } from './types';

export const POS_BRIDGE_GLOBAL = '__VANTORA_POS_BRIDGE__' as const;

/** Detect an installed device bridge (ESC/POS thermal + cash-drawer kick). null → browser. */
export function detectDeviceBridge(): PosDevices | null {
  if (typeof window === 'undefined') return null;
  const b = (window as unknown as Record<string, unknown>)[POS_BRIDGE_GLOBAL] as Partial<PosDevices> | undefined;
  if (b?.printer && b.cashDrawer && b.capabilities) return b as PosDevices;
  return null;
}
