import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingRoot: process.cwd(),
  // A deploy builds into a staging directory and swaps it into place at restart, so the
  // running app never has its own chunks deleted underneath it - which is what produced the
  // "client-side exception" page during every deploy. Unset at runtime: the build being
  // served is always .next.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // Sent on every response. Deliberately not a Content-Security-Policy: the app loads map
  // tiles from openstreetmap.org and Next emits inline bootstrap scripts, so a policy strict
  // enough to be worth having needs testing against those rather than guessing at it.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          // The site is served over HTTPS by nginx; this stops a browser being talked back
          // down to HTTP. No includeSubDomains - other subdomains are not ours to speak for.
          { key: "Strict-Transport-Security", value: "max-age=31536000" },
          // Nothing here is meant to be framed, and framing it is how clickjacking starts.
          { key: "X-Frame-Options", value: "DENY" },
          // Stops a browser second-guessing a declared content type, which is how an upload
          // or an export gets treated as something executable.
          { key: "X-Content-Type-Options", value: "nosniff" },
          // Client names and loan numbers travel in query strings; keep them out of the
          // Referer header on the way to any other site.
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" }
        ]
      }
    ];
  },
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
