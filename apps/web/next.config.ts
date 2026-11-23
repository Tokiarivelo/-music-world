import type { NextConfig } from 'next';

// `pnpm dev` without Caddy: proxy /api to the local FastAPI (Caddy routes /api itself in Docker and production).
const DEV_API_URL = process.env.DEV_API_URL ?? 'http://localhost:8000';

const nextConfig: NextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  agentRules: false, // agent rules live in .kiro/steering, not in a generated AGENTS.md
  outputFileTracingRoot: new URL('../..', import.meta.url).pathname,
  async rewrites() {
    return process.env.NODE_ENV === 'development'
      ? [{ source: '/api/:path*', destination: `${DEV_API_URL}/api/:path*` }]
      : [];
  },
};

export default nextConfig;
