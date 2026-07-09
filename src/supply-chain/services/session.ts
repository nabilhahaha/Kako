/**
 * Lightweight operator identity used for audit attribution. Phase 1 has no
 * authentication module; this provides a stable, editable operator name so
 * every action is attributable. Swappable for a real auth context later.
 */
const KEY = 'scv.operator';

export function getCurrentOperator(): string {
  try {
    return localStorage.getItem(KEY) || 'operator@roshen';
  } catch {
    return 'operator@roshen';
  }
}

export function setCurrentOperator(name: string): void {
  try {
    localStorage.setItem(KEY, name);
  } catch {
    /* ignore storage failures */
  }
}
