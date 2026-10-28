// Reads environment variables once, with defaults, so the rest of the code
// never touches process.env directly.

function int(value: string | undefined, fallback: number): number {
  const n = Number.parseInt(value ?? '', 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

const turnUrl = process.env.TURN_URL?.trim();
const turnSecret = process.env.TURN_SECRET?.trim();

export const config = {
  port: int(process.env.PORT, 3001),

  allowedOrigins: (process.env.ALLOWED_ORIGINS ?? 'http://localhost:3000')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),

  trustProxy: process.env.TRUST_PROXY === 'true',

  // null when not configured → /api/turn-credentials returns STUN only
  turn:
    turnUrl && turnSecret
      ? { url: turnUrl, secret: turnSecret, ttlSeconds: int(process.env.TURN_TTL_SECONDS, 600) }
      : null,

  rooms: {
    codeLength: 6,
    expiryMs: 30 * 60 * 1000, // absolute lifetime from creation
    cleanupIntervalMs: 60_000,
  },

  // Failed join-room attempts allowed per client within the window
  joinLimit: { maxFailures: 5, windowMs: 60_000 },

  maxMessageBytes: 64 * 1024,
} as const;
