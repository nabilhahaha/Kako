// Sentry — browser runtime. No-op until NEXT_PUBLIC_SENTRY_DSN is set.
import * as Sentry from '@sentry/nextjs';

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

Sentry.init({
  dsn,
  enabled: Boolean(dsn),
  environment:
    process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ??
    process.env.NEXT_PUBLIC_VERCEL_ENV ??
    process.env.NODE_ENV,
  release: process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA,
  tracesSampleRate: Number(process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE ?? '0.1'),
  // Session Replay off by default to keep the client bundle lean; opt in by
  // setting NEXT_PUBLIC_SENTRY_REPLAY_ON_ERROR (0..1).
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: Number(process.env.NEXT_PUBLIC_SENTRY_REPLAY_ON_ERROR ?? '0'),
  // Drop well-known browser noise that isn't actionable.
  ignoreErrors: [
    'ResizeObserver loop limit exceeded',
    'ResizeObserver loop completed with undelivered notifications.',
    'AbortError',
    'Non-Error promise rejection captured',
  ],
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
