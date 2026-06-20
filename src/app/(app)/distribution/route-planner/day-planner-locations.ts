// ============================================================================
// Day Planner — saved named locations (Warehouse / Office) for one-click Start/End.
//
// Managers reuse the same depot/office every day, so we remember their coordinates
// once (localStorage) and offer them as one-click Start/End presets. "Current
// Location" uses the browser Geolocation API at click time (not stored here).
// Browser-only.
// ============================================================================
import type { JourneyPoint } from '@/lib/tis/journey';

export type DpLocationKey = 'warehouse' | 'office';

const KEY = 'vantora-day-planner-locations';

type Store = Partial<Record<DpLocationKey, JourneyPoint>>;

function read(): Store {
  if (typeof localStorage === 'undefined') return {};
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Store) : {};
  } catch {
    return {};
  }
}

function write(s: Store): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}

export function loadDpLocations(): Store {
  return read();
}

export function getDpLocation(key: DpLocationKey): JourneyPoint | null {
  return read()[key] ?? null;
}

export function setDpLocation(key: DpLocationKey, point: JourneyPoint): Store {
  const s = read();
  s[key] = point;
  write(s);
  return s;
}
