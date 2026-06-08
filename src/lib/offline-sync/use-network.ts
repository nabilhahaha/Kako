'use client';

import { useEffect, useState } from 'react';

// Network + battery awareness for the field client (Phase 7B). Hooks the browser
// online/offline events and the Battery Status API (where available) so field
// workflows can adapt (e.g. defer media upload on low battery / no network).

/** True when the device reports an online connection. */
export function useOnlineStatus(): boolean {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    setOnline(navigator.onLine);
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);
  return online;
}

export interface BatteryState { level: number | null; charging: boolean | null }

/** Battery level (0..1) + charging state, or nulls when unavailable. */
export function useBattery(): BatteryState {
  const [state, setState] = useState<BatteryState>({ level: null, charging: null });
  useEffect(() => {
    let battery: { level: number; charging: boolean; addEventListener: (e: string, cb: () => void) => void; removeEventListener: (e: string, cb: () => void) => void } | null = null;
    const nav = navigator as Navigator & { getBattery?: () => Promise<typeof battery> };
    if (!nav.getBattery) return;
    let mounted = true;
    const update = () => { if (mounted && battery) setState({ level: battery.level, charging: battery.charging }); };
    nav.getBattery().then((b) => {
      battery = b; update();
      b?.addEventListener('levelchange', update);
      b?.addEventListener('chargingchange', update);
    }).catch(() => {});
    return () => {
      mounted = false;
      battery?.removeEventListener('levelchange', update);
      battery?.removeEventListener('chargingchange', update);
    };
  }, []);
  return state;
}
