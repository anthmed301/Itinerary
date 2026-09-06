import type { NextConfig } from 'next'

/**
 * A02 (Security Misconfiguration).
 *
 * HSTS is deliberately absent: Phase 1 serves plain http on localhost, and
 * sending HSTS from a non-TLS origin is either ignored or actively harmful.
 * It arrives at Stage 2 with the certificate.
 *
 * Verified during review that this CSP breaks neither Turbopack HMR nor the
 * Hocuspocus websocket from Phase 0 — `connect-src ... ws:` covers :1234, and
 * Turbopack dev needs no 'unsafe-eval'.
 */
const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      // Next injects inline bootstrap scripts; 'unsafe-inline' is required until
      // a nonce-based CSP lands in the Phase 8 polish pass.
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "font-src 'self'",
      // ws: for the Hocuspocus connection on :1234.
      "connect-src 'self' ws: wss:",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join('; '),
  },
]

const config: NextConfig = {
  reactStrictMode: true,
  // Workspace packages ship TypeScript source, so Next must transpile them.
  transpilePackages: ['@tripi/shared'],
  // Next 16 writes apps/web/AGENTS.md and apps/web/CLAUDE.md on first dev run.
  // This repo keeps its agent instructions in the root CLAUDE.md; a generated
  // second copy scoped to apps/web would silently compete with it.
  agentRules: false,
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }]
  },
}

export default config
