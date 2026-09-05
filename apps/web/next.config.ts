import type { NextConfig } from 'next'

const config: NextConfig = {
  reactStrictMode: true,
  // Workspace packages ship TypeScript source, so Next must transpile them.
  transpilePackages: ['@tripi/shared'],
  // Next 16 writes apps/web/AGENTS.md and apps/web/CLAUDE.md on first dev run.
  // This repo keeps its agent instructions in the root CLAUDE.md; a generated
  // second copy scoped to apps/web would silently compete with it.
  agentRules: false,
}

export default config
