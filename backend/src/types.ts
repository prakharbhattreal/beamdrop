// ─── Wire protocol (kept identical to the original P2P-Sender backend) ───

export type SessionDescription = { type: 'offer' | 'answer'; sdp: string };
export type IceCandidate = Record<string, unknown>;

/** Messages the client may send to the server */
export type ClientMessage =
  | { type: 'create-room' }
  | { type: 'join-room'; roomId: string }
  | { type: 'offer'; sdp: SessionDescription }
  | { type: 'answer'; sdp: SessionDescription }
  | { type: 'ice-candidate'; candidate: IceCandidate }
  | { type: 'ping' };

/** Messages the server sends to a client */
export type ServerMessage =
  | { type: 'room-created'; roomId: string }
  | { type: 'room-joined'; roomId: string; isInitiator: boolean }
  | { type: 'peer-joined' }
  | { type: 'peer-left' }
  | { type: 'offer'; sdp: SessionDescription }
  | { type: 'answer'; sdp: SessionDescription }
  | { type: 'ice-candidate'; candidate: IceCandidate }
  | { type: 'error'; message: string }
  | { type: 'pong' };

// ─── Room state ───

export interface Room {
  id: string;
  hostId: string;
  guestId: string | null;
  createdAt: number;
}
