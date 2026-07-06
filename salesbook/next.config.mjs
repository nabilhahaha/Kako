import { fileURLToPath } from 'url';
import path from 'path';

// When PAGES_EXPORT=1 (the GitHub Pages workflow), build a fully static export
// served from the "/Kako" project-pages sub-path. The default Vercel build is
// left untouched (server app with its API routes).
const isPagesExport = process.env.PAGES_EXPORT === '1';

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // The app is nested inside the Kako repo, which has its own lockfile at the
  // root; pin the tracing root so Next doesn't infer the monorepo root.
  outputFileTracingRoot: path.dirname(fileURLToPath(import.meta.url)),
  ...(isPagesExport
    ? {
        output: 'export',
        basePath: '/Kako',
        assetPrefix: '/Kako/',
        images: { unoptimized: true },
      }
    : {}),
};

export default nextConfig;
