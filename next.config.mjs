import { withSentryConfig } from '@sentry/nextjs';

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  eslint: {
    ignoreDuringBuilds: true,
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
