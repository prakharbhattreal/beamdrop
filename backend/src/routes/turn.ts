import { createHmac } from 'node:crypto';
import { Hono } from 'hono';
import { config } from '../config';

const STUN_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

/**
 * Always returns a valid iceServers list. If TURN isn't configured, it's STUN only.
 * TURN credentials follow coturn's "use-auth-secret" scheme:
 *   username   = expiry unix timestamp
 *   credential = base64(HMAC-SHA1(secret, username))
 */
export const turnRoute = new Hono().get('/turn-credentials', (c) => {
  c.header('Cache-Control', 'no-store');

  if (!config.turn) return c.json({ iceServers: STUN_SERVERS });

  const { url, secret, ttlSeconds } = config.turn;
  const username = String(Math.floor(Date.now() / 1000) + ttlSeconds);
  const credential = createHmac('sha1', secret).update(username).digest('base64');

  return c.json({ iceServers: [...STUN_SERVERS, { urls: url, username, credential }] });
});
