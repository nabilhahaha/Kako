'use client';

import { useMemo } from 'react';
import { browserPrintProvider, noopCashDrawer, browserCapabilities } from './browser-providers';
import { detectDeviceBridge } from './device-bridge';
import type { PosDevices } from './types';

/**
 * Resolve the active POS device providers. Browser providers are the always-available default.
 *
 * EXTENSION POINT (future): a Windows desktop wrapper / local print bridge can install
 * `window.__VANTORA_POS_BRIDGE__ = { print, cashDrawer, capabilities }` at runtime to provide
 * ESC/POS thermal printing + cash-drawer kick; the POS terminal then uses it automatically with
 * NO code change here or in callers. This keeps the first web version shipping today while
 * leaving a clean seam for the desktop/device-bridge phase.
 */
export function usePosDevices(): PosDevices {
  return useMemo<PosDevices>(() => {
    return detectDeviceBridge() ?? { printer: browserPrintProvider, cashDrawer: noopCashDrawer, capabilities: browserCapabilities };
  }, []);
}
