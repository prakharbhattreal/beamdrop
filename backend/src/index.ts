import { Hono } from 'hono';
import { createBunWebSocket } from 'hono/bun';
import { cors } from 'hono/cors';
import type { WSContext } from 'hono/ws';
import { config } from './config';
import { originGuard } from './middleware/originGuard';
import { FailureLimiter } from './middleware/rateLimit';
import { generateCode } from './rooms/codeGenerator';
import { RoomManager } from './rooms/roomManager';
import { healthRoute } from './routes/health';
import { turnRoute } from './routes/turn';
import { createWsHandler } from './ws/handler';

// ─── Shared state ───
const sockets = new Map<string, WSContext>();

const rooms = new RoomManager(
  (connId, message) => {
    try {
      sockets.get(connId)?.send(JSON.stringify(message));
    } catch {
      // socket closed; onClose will clean up
    }
  },
  {
    expiryMs: config.rooms.expiryMs,
    generateCode: () => generateCode(config.rooms.codeLength),
  }
);

const limiter = new FailureLimiter(config.joinLimit.maxFailures, config.joinLimit.windowMs);

// ─── HTTP app ───
const app = new Hono();
const { upgradeWebSocket, websocket } = createBunWebSocket();

app.use('/api/*', cors({ origin: [...config.allowedOrigins] }));
app.route('/api', healthRoute);
app.route('/api', turnRoute);

app.use('/ws', originGuard(config.allowedOrigins));
app.get('/ws', upgradeWebSocket(createWsHandler({ rooms, limiter, sockets })));

app.notFound((c) => c.json({ error: 'Not found' }, 404));

// ─── Periodic cleanup ───
setInterval(() => {
  const removed = rooms.expireOld();
  if (removed > 0) console.log(`[Rooms] expired ${removed}`);
  limiter.cleanup();
}, config.rooms.cleanupIntervalMs);

console.log(
  `Signaling server on :${config.port}  origins=${config.allowedOrigins.join(',')}  turn=${config.turn ? 'on' : 'off'}`
);

export default {
  fetch: app.fetch,
  websocket: { ...websocket, maxPayloadLength: config.maxMessageBytes },
  port: config.port,
};
