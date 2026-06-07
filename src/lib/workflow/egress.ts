// ============================================================================
// api_call egress allow-list (Phase A). The runtime may only call APPROVED
// domains via APPROVED connectors, per company (tenant-isolated). Pure matcher +
// URL host parser — unit-tested; the adapter loads the company's rules and the
// `api_call` executor is denied (403, non-retryable, audited) for anything else.
// ============================================================================

export interface EgressRule {
  domain: string;            // exact host ('api.x.com') or suffix ('.x.com')
  connectorKey: string | null; // null = any connector allowed for this domain
  isActive?: boolean;
}

/** Parse the host from a URL; '' if invalid. */
export function hostFromUrl(url: string): string {
  try { return new URL(url).hostname.toLowerCase(); } catch { return ''; }
}

/** True if `host` (called via optional `connector`) is permitted by the rules.
 *  Approved DOMAIN (exact or suffix) AND approved CONNECTOR (rule.connectorKey
 *  null = any; else must equal the step's connector). */
export function isEgressAllowed(host: string, connector: string | null | undefined, rules: EgressRule[]): boolean {
  if (!host) return false;
  return rules.some((r) => {
    if (r.isActive === false) return false;
    const domainOk = r.domain.startsWith('.')
      ? host === r.domain.slice(1) || host.endsWith(r.domain)
      : host === r.domain.toLowerCase();
    if (!domainOk) return false;
    return r.connectorKey == null || r.connectorKey === (connector ?? null);
  });
}
