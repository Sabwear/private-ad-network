import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Produces a portable Node.js server bundle for containers and managed hosts.
  // Vercel detects and deploys the same Next.js application without a custom adapter.
  output: "standalone",
};

export default nextConfig;
