/** ── Shared OAuth2 helper (platform infrastructure) ────────────────────────
 *  Reusable client-credentials token fetch for any adapter that authenticates
 *  via OAuth2 (Dynamics 365 Business Central first; future vendors next). Pure +
 *  injectable fetch so it's unit-testable. No secret is logged or persisted —
 *  the client secret is passed in (resolved from Vault by the dispatcher) and
 *  only sent to the token endpoint. */

type FetchLike = (url: string, init?: { method?: string; headers?: Record<string, string>; body?: string }) =>
  Promise<{ ok: boolean; status: number; json: () => Promise<unknown>; text: () => Promise<string> }>;

export interface ClientCredentialsArgs {
  tokenUrl: string;
  clientId: string;
  clientSecret: string;
  scope: string;
  fetchImpl?: FetchLike;
}

export interface TokenResult {
  accessToken: string;
  /** Seconds until expiry, if the provider returned it. */
  expiresIn: number | null;
}

/** OAuth2 client-credentials grant. Returns the bearer access token. */
export async function fetchClientCredentialsToken(args: ClientCredentialsArgs): Promise<TokenResult> {
  const f = (args.fetchImpl ?? (globalThis.fetch as unknown as FetchLike));
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: args.clientId,
    client_secret: args.clientSecret,
    scope: args.scope,
  }).toString();
  const res = await f(args.tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!res.ok) throw new Error(`oauth2 token request failed: HTTP ${res.status}`);
  const json = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!json.access_token) throw new Error('oauth2 token response missing access_token');
  return { accessToken: json.access_token, expiresIn: json.expires_in ?? null };
}
