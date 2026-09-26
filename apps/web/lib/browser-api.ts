/**
 * Browser-side API base.
 *
 * Customer-facing client components always call the Next.js same-origin proxy.
 * This avoids Codespaces forwarded-port auth/CORS HTML responses and keeps the
 * NestJS API port private during development.
 */
export const BROWSER_API_URL = "/api/store";
