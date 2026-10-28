import { describe, expect, test } from 'bun:test';
import { parseClientMessage } from '../src/ws/parse';

const parse = (v: unknown) => parseClientMessage(typeof v === 'string' ? v : JSON.stringify(v));

describe('parseClientMessage', () => {
  test('accepts simple messages', () => {
    expect(parse({ type: 'create-room' })).toEqual({ ok: true, message: { type: 'create-room' } });
    expect(parse({ type: 'ping' })).toEqual({ ok: true, message: { type: 'ping' } });
  });

  test('normalises room codes', () => {
    expect(parse({ type: 'join-room', roomId: '  abc234 ' })).toEqual({
      ok: true,
      message: { type: 'join-room', roomId: 'ABC234' },
    });
  });

  test('rejects bad room codes', () => {
    expect(parse({ type: 'join-room', roomId: 123 }).ok).toBe(false);
    expect(parse({ type: 'join-room', roomId: '' }).ok).toBe(false);
    expect(parse({ type: 'join-room', roomId: 'AB' }).ok).toBe(false);
    expect(parse({ type: 'join-room', roomId: 'AB CD!' }).ok).toBe(false);
  });

  test('offer must carry a matching sdp object and drops extra fields', () => {
    const res = parse({ type: 'offer', sdp: { type: 'offer', sdp: 'v=0', evil: 1 }, extra: true });
    expect(res).toEqual({
      ok: true,
      message: { type: 'offer', sdp: { type: 'offer', sdp: 'v=0' } },
    });
    expect(parse({ type: 'offer', sdp: { type: 'answer', sdp: 'v=0' } }).ok).toBe(false);
    expect(parse({ type: 'answer', sdp: 'not-an-object' }).ok).toBe(false);
  });

  test('ice-candidate needs an object', () => {
    expect(parse({ type: 'ice-candidate', candidate: { candidate: 'x' } }).ok).toBe(true);
    expect(parse({ type: 'ice-candidate', candidate: 'x' }).ok).toBe(false);
  });

  test('rejects junk', () => {
    expect(parse('not json').ok).toBe(false);
    expect(parse('[]').ok).toBe(false);
    expect(parse({ nope: 1 }).ok).toBe(false);
    expect(parse({ type: 'launch-missiles' }).ok).toBe(false);
    expect(parseClientMessage(new ArrayBuffer(4)).ok).toBe(false);
  });

  test('rejects oversized messages', () => {
    expect(parseClientMessage('x'.repeat(101), 100).ok).toBe(false);
  });
});
