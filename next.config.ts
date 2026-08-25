import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingRoot: process.cwd(),
  experimental: {
    // The VPS cannot reliably reap Next's webpack worker process during deploys.
    // Compile in the main build process to prevent a completed worker becoming a zombie.
    webpackBuildWorker: false,
    serverActions: {
      bodySizeLimit: "2mb"
    }
  }
};

export default nextConfig;
