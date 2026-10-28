import type { Context } from 'hono';
import { getConnInfo } from 'hono/bun';
import type { WSContext, WSEvents } from 'hono/ws';
import { config } from '../config';
import type { FailureLimiter } from '../middleware/rateLimit';
import type { RoomManager } from '../rooms/roomManager';
import type { ServerMessage } from '../types';
import { parseClientMessage } from './parse';

export interface WsDeps {
  rooms: RoomManager;
  limiter: FailureLimiter;
  /** connId → socket. Shared with the RoomManager's notify function in index.ts */
  sockets: Map<string, WSContext>;
}

function clientIp(c: Context): string | null {
  if (config.trustProxy) {
    const forwarded = c.req.header('x-forwarded-for')?.split(',')[0]?.trim();
    if (forwarded) return forwarded;
  }
  try {
    return getConnInfo(c).remote.address ?? null;
  } catch {
    return null;
  }
}

function send(ws: WSContext, message: ServerMessage): void {
  try {
    ws.send(JSON.stringify(message));
  } catch {
    // socket already closed
  }
}

/** Returns the per-connection event handlers for Hono's upgradeWebSocket(). */
export function createWsHandler({ rooms, limiter, sockets }: WsDeps) {
  return (c: Context): WSEvents => {
    const connId = crypto.randomUUID().slice(0, 8);
    // If the IP is unknown, limit per connection rather than lumping everyone together.
    const limitKey = clientIp(c) ?? `conn:${connId}`;

    const cleanup = () => {
      rooms.leave(connId);
      sockets.delete(connId);
    };

    return {
      onOpen(_event, ws) {
        sockets.set(connId, ws);
        console.log(`[WS] ${connId} connected`);
      },

      onMessage(event, ws) {
        sockets.set(connId, ws); // keep the freshest wrapper

        const parsed = parseClientMessage(event.data, config.maxMessageBytes);
        if (!parsed.ok) return send(ws, { type: 'error', message: parsed.error });
        const msg = parsed.message;

        switch (msg.type) {
          case 'create-room': {
            const res = rooms.createRoom(connId);
            if (!res.ok) return send(ws, { type: 'error', message: res.error });
            console.log(`[Room ${res.roomId}] created by ${connId}`);
            return send(ws, { type: 'room-created', roomId: res.roomId });
          }

          case 'join-room': {
            if (limiter.isBlocked(limitKey)) {
              return send(ws, {
                type: 'error',
                message: 'Too many failed attempts. Try again later.',
              });
            }
            const res = rooms.joinRoom(connId, msg.roomId);
            if (!res.ok) {
              if (res.reason === 'not-found') limiter.recordFailure(limitKey);
              return send(ws, { type: 'error', message: res.error });
            }
            console.log(`[Room ${res.roomId}] ${connId} joined`);
            return send(ws, { type: 'room-joined', roomId: res.roomId, isInitiator: false });
          }

          case 'offer':
          case 'answer':
          case 'ice-candidate': {
            const res = rooms.relay(connId, msg);
            if (!res.ok) send(ws, { type: 'error', message: res.error });
            return;
          }

          case 'ping':
            return send(ws, { type: 'pong' });
        }
      },

      onClose() {
        console.log(`[WS] ${connId} closed`);
        cleanup();
      },

      onError(event) {
        console.error(`[WS] ${connId} error`, event);
        cleanup();
      },
    };
  };
}
