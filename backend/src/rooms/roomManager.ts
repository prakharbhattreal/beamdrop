import type { ClientMessage, Room, ServerMessage } from '../types';

/** How the manager talks to a connection. The WebSocket layer supplies this. */
export type Notify = (connId: string, message: ServerMessage) => void;

export type RelayMessage = Extract<ClientMessage, { type: 'offer' | 'answer' | 'ice-candidate' }>;

export interface RoomManagerOptions {
  expiryMs: number;
  generateCode: () => string;
  now?: () => number; // injectable clock for tests
}

export type CreateResult = { ok: true; roomId: string } | { ok: false; error: string };
export type JoinResult =
  | { ok: true; roomId: string }
  | { ok: false; reason: 'not-found' | 'full' | 'already-in-room'; error: string };
export type RelayResult = { ok: true } | { ok: false; error: string };

/**
 * Pure room logic. No WebSocket, no Hono, no timers → easy to unit test.
 * A room has one host and at most one guest.
 */
export class RoomManager {
  private rooms = new Map<string, Room>();
  private connToRoom = new Map<string, string>();
  private notify: Notify;
  private expiryMs: number;
  private generateCode: () => string;
  private now: () => number;

  constructor(notify: Notify, opts: RoomManagerOptions) {
    this.notify = notify;
    this.expiryMs = opts.expiryMs;
    this.generateCode = opts.generateCode;
    this.now = opts.now ?? (() => Date.now());
  }

  get roomCount(): number {
    return this.rooms.size;
  }

  createRoom(connId: string): CreateResult {
    if (this.connToRoom.has(connId)) return { ok: false, error: 'Already in a room' };

    let roomId = '';
    for (let i = 0; i < 10; i++) {
      const candidate = this.generateCode();
      if (!this.rooms.has(candidate)) {
        roomId = candidate;
        break;
      }
    }
    if (!roomId) return { ok: false, error: 'Could not allocate a room code' };

    this.rooms.set(roomId, { id: roomId, hostId: connId, guestId: null, createdAt: this.now() });
    this.connToRoom.set(connId, roomId);
    return { ok: true, roomId };
  }

  joinRoom(connId: string, roomId: string): JoinResult {
    if (this.connToRoom.has(connId)) {
      return { ok: false, reason: 'already-in-room', error: 'Already in a room' };
    }
    const room = this.rooms.get(roomId);
    if (!room) return { ok: false, reason: 'not-found', error: 'Room not found' };
    if (room.guestId) return { ok: false, reason: 'full', error: 'Room is full' };

    room.guestId = connId;
    this.connToRoom.set(connId, roomId);

    // The host creates the WebRTC offer once it learns a guest is here.
    this.notify(room.hostId, { type: 'peer-joined' });
    return { ok: true, roomId };
  }

  /** Forward offer / answer / ice-candidate to the other peer in the room. */
  relay(connId: string, message: RelayMessage): RelayResult {
    const room = this.roomOf(connId);
    if (!room) return { ok: false, error: 'Not in a room' };

    const otherId = room.hostId === connId ? room.guestId : room.hostId;
    if (!otherId) return { ok: false, error: 'No peer connected' };

    this.notify(otherId, message);
    return { ok: true };
  }

  /** Call when a connection closes. Host leaving destroys the room; guest leaving frees the seat. */
  leave(connId: string): void {
    const roomId = this.connToRoom.get(connId);
    if (!roomId) return;
    this.connToRoom.delete(connId);

    const room = this.rooms.get(roomId);
    if (!room) return;

    if (room.hostId === connId) {
      if (room.guestId) {
        this.notify(room.guestId, { type: 'peer-left' });
        this.connToRoom.delete(room.guestId);
      }
      this.rooms.delete(roomId);
    } else if (room.guestId === connId) {
      room.guestId = null;
      this.notify(room.hostId, { type: 'peer-left' });
    }
  }

  /** Remove rooms older than expiryMs. Returns how many were removed. */
  expireOld(): number {
    const now = this.now();
    let removed = 0;
    for (const [id, room] of this.rooms) {
      if (now - room.createdAt <= this.expiryMs) continue;
      this.notify(room.hostId, { type: 'error', message: 'Room expired' });
      this.connToRoom.delete(room.hostId);
      if (room.guestId) {
        this.notify(room.guestId, { type: 'error', message: 'Room expired' });
        this.connToRoom.delete(room.guestId);
      }
      this.rooms.delete(id);
      removed++;
    }
    return removed;
  }

  private roomOf(connId: string): Room | undefined {
    const roomId = this.connToRoom.get(connId);
    return roomId ? this.rooms.get(roomId) : undefined;
  }
}
