// Pure, dependency-free core for Backend-Enforcement Phase F so the allow/deny
// decision is unit-testable without server-only imports. See `action-authz.ts`
// for the server guard that wires this to the flag store + capability resolver.

export const ACTION_AUTHZ_FLAG = 'platform.action_authz_enforcement';

/** Whether server-action enforcement is ON in this company's flag map. */
export function actionAuthzEnforced(flags: Record<string, boolean>): boolean {
  return flags[ACTION_AUTHZ_FLAG] === true;
}

/**
 * Pure allow/deny decision. Apex (super admin / platform owner) is always
 * allowed; when the flag is OFF the action is allowed (no-op — default behaviour
 * preserved); otherwise it is allowed iff the caller holds ANY required capability.
 */
export function actionAuthzAllows(opts: { apex: boolean; enforced: boolean; holdsAny: boolean }): boolean {
  if (opts.apex) return true;
  if (!opts.enforced) return true;
  return opts.holdsAny;
}
