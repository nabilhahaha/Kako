// Sentry — server runtime. No-op until NEXT_PUBLIC_SENTRY_DSN is set.
import * as Sentry from '@sentry/nextjs';

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

Sentry.init({
  dsn,
  enabled: Boolean(dsn),
  // Distinguish production / preview(staging) / development in the Sentry UI.
  environment:
    process.env.SENTRY_ENVIRONMENT ?? process.env.VERCEL_ENV ?? process.env.NODE_ENV,
  // Tie events to the deployed commit for readable releases & regressions.
  release: process.env.VERCEL_GIT_COMMIT_SHA,
  // Modest performance sampling (override with SENTRY_TRACES_SAMPLE_RATE).
  tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? '0.1'),
  // Don't ship request bodies / cookies / user IPs by default (tenant data).
  sendDefaultPii: false,
});
