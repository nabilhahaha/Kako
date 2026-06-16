import { withSentryConfig } from '@sentry/nextjs';

/** Baseline security headers applied to every response. (A full nonce-based
 *  CSP is intentionally deferred — it needs per-request nonces for Next's inline
 *  scripts + Supabase/Sentry origins; these are the safe, no-break wins.) */
const SECURITY_HEADERS = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), browsing-topics=()' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'X-DNS-Prefetch-Control', value: 'on' },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  eslint: {
    ignoreDuringBuilds: true,
  },
  // SFTP transport (sync engine) uses ssh2, and the document-PDF renderer uses
  // headless Chromium (@sparticuz/chromium + puppeteer-core) — both carry native /
  // binary payloads that must NOT be bundled; treat them as runtime externals.
  serverExternalPackages: ['ssh2', 'ssh2-sftp-client', '@sparticuz/chromium', 'puppeteer-core'],
  experimental: {
    // Import Engine uploads .xlsx bytes (base64) to a server action for parsing.
    serverActions: { bodySizeLimit: '15mb' },
  },
  async headers() {
    return [{ source: '/(.*)', headers: SECURITY_HEADERS }];
  },
};

// Sentry build wrapper. Error capture is gated at runtime on
// NEXT_PUBLIC_SENTRY_DSN; source maps are only uploaded when SENTRY_ORG/
// SENTRY_PROJECT/SENTRY_AUTH_TOKEN are set, so local/CI builds stay clean.
export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: true,
  disableLogger: true,
});
