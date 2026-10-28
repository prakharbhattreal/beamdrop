import type { ClientMessage, IceCandidate } from '../types';

export type ParseResult = { ok: true; message: ClientMessage } | { ok: false; error: string };

const ROOM_CODE_RE = /^[A-Z0-9]{4,12}$/;

const fail = (error: string): ParseResult => ({ ok: false, error });
const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * Validates untrusted input and rebuilds a clean message containing only the
 * fields we expect, so nothing unexpected is ever relayed to the other peer.
 */
export function parseClientMessage(raw: unknown, maxChars = 64 * 1024): ParseResult {
  if (typeof raw !== 'string') return fail('Messages must be text');
  if (raw.length > maxChars) return fail('Message too large');

  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return fail('Invalid JSON');
  }
  if (!isObject(data) || typeof data.type !== 'string') return fail('Missing message type');

  switch (data.type) {
    case 'create-room':
      return { ok: true, message: { type: 'create-room' } };

    case 'ping':
      return { ok: true, message: { type: 'ping' } };

    case 'join-room': {
      if (typeof data.roomId !== 'string') return fail('roomId must be a string');
      const roomId = data.roomId.trim().toUpperCase();
      if (!ROOM_CODE_RE.test(roomId)) return fail('Invalid room code');
      return { ok: true, message: { type: 'join-room', roomId } };
    }

    case 'offer':
    case 'answer': {
      const kind = data.type;
      const sdp = data.sdp;
      if (!isObject(sdp) || sdp.type !== kind || typeof sdp.sdp !== 'string') {
        return fail(`Invalid ${kind}`);
      }
      return { ok: true, message: { type: kind, sdp: { type: kind, sdp: sdp.sdp } } };
    }

    case 'ice-candidate': {
      if (!isObject(data.candidate)) return fail('Invalid ice-candidate');
      return {
        ok: true,
        message: { type: 'ice-candidate', candidate: data.candidate as IceCandidate },
      };
    }

    default:
      return fail('Unknown message type');
  }
}
