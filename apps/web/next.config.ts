import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  agentRules: false, // agent rules live in .kiro/steering, not in a generated AGENTS.md
  outputFileTracingRoot: new URL('../..', import.meta.url).pathname,
};

export default nextConfig;
