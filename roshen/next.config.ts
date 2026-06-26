import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // This repo also contains a separate Vite app one level up, so pin the
  // workspace root to this project to avoid lockfile-inference warnings.
  turbopack: {
    root: path.resolve(__dirname),
  },
  experimental: {
    // Raw-data files are sent to a server action when a draft batch is created.
    serverActions: { bodySizeLimit: "25mb" },
  },
};

export default nextConfig;
