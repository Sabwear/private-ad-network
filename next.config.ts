import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep a portable Node.js bundle for generic hosts and containers. Vercel
  // provides its own Next.js packaging and must not receive standalone output.
  output: process.env.VERCEL ? undefined : "standalone",
};

export default nextConfig;
