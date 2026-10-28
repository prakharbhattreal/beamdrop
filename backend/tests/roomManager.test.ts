import { beforeEach, describe, expect, test } from 'bun:test';
import { RoomManager } from '../src/rooms/roomManager';
import type { ServerMessage } from '../src/types';

let sent: Array<{ to: string; msg: ServerMessage }>;
let clock: number;
let rooms: RoomManager;
let nextCode: number;

beforeEach(() => {
  sent = [];
  clock = 1_000;
  nextCode = 0;
  rooms = new RoomManager((to, msg) => sent.push({ to, msg }), {
    expiryMs: 10_000,
    generateCode: () => `CODE${nextCode++}`,
    now: () => clock,
  });
});

const offer = { type: 'offer' as const, sdp: { type: 'offer' as const, sdp: 'v=0' } };

describe('createRoom', () => {
  test('creates a room and returns its code', () => {
    const res = rooms.createRoom('a');
    expect(res).toEqual({ ok: true, roomId: 'CODE0' });
    expect(rooms.roomCount).toBe(1);
  });

  test('a connection cannot create two rooms', () => {
    rooms.createRoom('a');
    expect(rooms.createRoom('a').ok).toBe(false);
  });

  test('retries when a generated code collides', () => {
    const codes = ['SAME', 'SAME', 'OTHER'];
    const r = new RoomManager(() => {}, { expiryMs: 1, generateCode: () => codes.shift()! });
    expect(r.createRoom('a')).toEqual({ ok: true, roomId: 'SAME' });
    expect(r.createRoom('b')).toEqual({ ok: true, roomId: 'OTHER' });
  });
});

describe('joinRoom', () => {
  test('guest joins and host is told', () => {
    rooms.createRoom('host');
    const res = rooms.joinRoom('guest', 'CODE0');
    expect(res).toEqual({ ok: true, roomId: 'CODE0' });
    expect(sent).toEqual([{ to: 'host', msg: { type: 'peer-joined' } }]);
  });

  test('unknown room → not-found', () => {
    const res = rooms.joinRoom('guest', 'NOPE');
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe('not-found');
  });

  test('third peer → full', () => {
    rooms.createRoom('host');
    rooms.joinRoom('g1', 'CODE0');
    const res = rooms.joinRoom('g2', 'CODE0');
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe('full');
  });

  test('already in a room → rejected', () => {
    rooms.createRoom('host');
    const res = rooms.joinRoom('host', 'CODE0');
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe('already-in-room');
  });
});

describe('relay', () => {
  test('host → guest and guest → host', () => {
    rooms.createRoom('host');
    rooms.joinRoom('guest', 'CODE0');
    sent = [];
    expect(rooms.relay('host', offer).ok).toBe(true);
    expect(sent).toEqual([{ to: 'guest', msg: offer }]);

    sent = [];
    const cand = { type: 'ice-candidate' as const, candidate: { candidate: 'x' } };
    expect(rooms.relay('guest', cand).ok).toBe(true);
    expect(sent).toEqual([{ to: 'host', msg: cand }]);
  });

  test('fails when not in a room', () => {
    expect(rooms.relay('ghost', offer)).toEqual({ ok: false, error: 'Not in a room' });
  });

  test('fails when no peer has joined yet', () => {
    rooms.createRoom('host');
    expect(rooms.relay('host', offer)).toEqual({ ok: false, error: 'No peer connected' });
  });
});

describe('leave', () => {
  test('guest leaves → host notified, room stays open for a new guest', () => {
    rooms.createRoom('host');
    rooms.joinRoom('guest', 'CODE0');
    sent = [];
    rooms.leave('guest');
    expect(sent).toEqual([{ to: 'host', msg: { type: 'peer-left' } }]);
    expect(rooms.roomCount).toBe(1);
    expect(rooms.joinRoom('guest2', 'CODE0').ok).toBe(true);
  });

  test('host leaves → guest notified, room destroyed, guest free to join elsewhere', () => {
    rooms.createRoom('host');
    rooms.joinRoom('guest', 'CODE0');
    sent = [];
    rooms.leave('host');
    expect(sent).toEqual([{ to: 'guest', msg: { type: 'peer-left' } }]);
    expect(rooms.roomCount).toBe(0);
    expect(rooms.createRoom('guest').ok).toBe(true);
  });

  test('leaving when not in a room is a no-op', () => {
    rooms.leave('nobody');
    expect(sent).toHaveLength(0);
  });
});

describe('expireOld', () => {
  test('keeps young rooms, removes old ones and notifies both peers', () => {
    rooms.createRoom('host');
    rooms.joinRoom('guest', 'CODE0');
    sent = [];

    clock += 10_000; // exactly at the limit → still alive
    expect(rooms.expireOld()).toBe(0);

    clock += 1; // just past the limit
    expect(rooms.expireOld()).toBe(1);
    expect(rooms.roomCount).toBe(0);
    expect(sent).toEqual([
      { to: 'host', msg: { type: 'error', message: 'Room expired' } },
      { to: 'guest', msg: { type: 'error', message: 'Room expired' } },
    ]);
  });
});
