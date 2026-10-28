import type { MiddlewareHandler } from 'hono';

/**
 * CORS does NOT protect WebSockets, so check the Origin header ourselves.
 * Browsers always send Origin; non-browser tools (curl, wscat) usually don't,
 * so a missing Origin is allowed. This stops other websites from using your
 * signaling server from a visitor's browser. It is not authentication.
 */
export function originGuard(allowed: readonly string[]): MiddlewareHandler {
  return async (c, next) => {
    const origin = c.req.header('origin');
    if (origin && !allowed.includes('*') && !allowed.includes(origin)) {
      return c.text('Forbidden origin', 403);
    }
    await next();
  };
}
