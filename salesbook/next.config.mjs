import { fileURLToPath } from 'url';
import path from 'path';

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // The app is nested inside the Kako repo, which has its own lockfile at the
  // root; pin the tracing root so Next doesn't infer the monorepo root.
  outputFileTracingRoot: path.dirname(fileURLToPath(import.meta.url)),
};

export default nextConfig;
