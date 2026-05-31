import { createHmac } from 'node:crypto';

/** ── Shared OAuth 1.0a (TBA) signer — platform infrastructure ───────────────
 *  Token-Based Auth request signing for adapters that use OAuth 1.0a HMAC
 *  (Oracle NetSuite SuiteTalk REST first). Builds the signature base string
 *  (METHOD&url&sorted-params), signs it with HMAC-SHA256 keyed by
 *  `consumerSecret&tokenSecret`, and emits the `Authorization: OAuth …` header.
 *  Pure + deterministic: nonce/timestamp are injectable so tests are
 *  reproducible. Uses Node's built-in crypto (no new dependency). Secrets are
 *  passed in (resolved from Vault) and never logged or persisted. */

export type Oauth1Method = 'HMAC-SHA256' | 'HMAC-SHA1';

export interface Oauth1Args {
  method: string;                 // HTTP method, e.g. 'GET' | 'POST'
  url: string;                    // full request URL (may include a query string)
  consumerKey: string;
  consumerSecret: string;
  tokenId: string;
  tokenSecret: string;
  realm: string;                  // NetSuite account id
  signatureMethod?: Oauth1Method; // default HMAC-SHA256
  nonce?: string;                 // injectable for tests
  timestamp?: string;             // injectable for tests (seconds)
}

/** RFC-3986 percent-encoding (stricter than encodeURIComponent). */
export function rfc3986(value: string): string {
  return encodeURIComponent(value).replace(/[!*'()]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase());
}

function randomNonce(): string {
  // 32 hex chars; crypto-random not required for OAuth nonce uniqueness here.
  let s = '';
  while (s.length < 32) s += Math.random().toString(36).slice(2);
  return s.slice(0, 32);
}

/** Split a query string into [key,value] pairs (decoded). */
function splitUrl(url: string): { base: string; queryParams: [string, string][] } {
  const qIndex = url.indexOf('?');
  if (qIndex === -1) return { base: url, queryParams: [] };
  const base = url.slice(0, qIndex);
  const queryParams: [string, string][] = [];
  for (const part of url.slice(qIndex + 1).split('&')) {
    if (!part) continue;
    const eq = part.indexOf('=');
    const k = eq === -1 ? part : part.slice(0, eq);
    const v = eq === -1 ? '' : part.slice(eq + 1);
    queryParams.push([decodeURIComponent(k), decodeURIComponent(v)]);
  }
  return { base, queryParams };
}

export interface Oauth1Signature {
  header: string;                 // full Authorization header value
  signature: string;              // base64 signature (also useful for tests)
  baseString: string;             // signature base string (useful for tests)
}

/** Compute the OAuth 1.0a signature + Authorization header for a request. */
export function signOauth1(args: Oauth1Args): Oauth1Signature {
  const sigMethod = args.signatureMethod ?? 'HMAC-SHA256';
  const nonce = args.nonce ?? randomNonce();
  const timestamp = args.timestamp ?? Math.floor(Date.now() / 1000).toString();
  const { base, queryParams } = splitUrl(args.url);

  const oauthParams: Record<string, string> = {
    oauth_consumer_key: args.consumerKey,
    oauth_token: args.tokenId,
    oauth_nonce: nonce,
    oauth_timestamp: timestamp,
    oauth_signature_method: sigMethod,
    oauth_version: '1.0',
  };

  // All params (oauth + query) are RFC-3986 encoded, sorted, and joined.
  const allParams: [string, string][] = [
    ...Object.entries(oauthParams),
    ...queryParams,
  ].map(([k, v]) => [rfc3986(k), rfc3986(v)] as [string, string]);
  allParams.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : (a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0)));
  const paramString = allParams.map(([k, v]) => `${k}=${v}`).join('&');

  const baseString = [args.method.toUpperCase(), rfc3986(base), rfc3986(paramString)].join('&');
  const signingKey = `${rfc3986(args.consumerSecret)}&${rfc3986(args.tokenSecret)}`;
  const algo = sigMethod === 'HMAC-SHA1' ? 'sha1' : 'sha256';
  const signature = createHmac(algo, signingKey).update(baseString).digest('base64');

  // Authorization header: realm + oauth params + signature, all quoted+encoded.
  const headerParams: Record<string, string> = {
    realm: args.realm,
    ...oauthParams,
    oauth_signature: signature,
  };
  const header = 'OAuth ' + Object.entries(headerParams)
    .map(([k, v]) => `${rfc3986(k)}="${rfc3986(v)}"`)
    .join(', ');

  return { header, signature, baseString };
}
