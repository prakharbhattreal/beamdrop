# Signaling backend

WebSocket signaling server for browser-to-browser (WebRTC) file transfer.
It only pairs two peers and relays SDP/ICE messages. File data never touches it.

Runtime: **Bun** (uses `hono/bun`). Framework: **Hono**.

## Run

```bash
bun install
cp .env.example .env        # then edit ALLOWED_ORIGINS
bun run dev                 # http://localhost:3001
bun test
bun run typecheck
```

Check it: `curl http://localhost:3001/api/health`

## Layout

| File | Responsibility |
|---|---|
| `src/index.ts` | Wires everything: CORS, routes, WebSocket upgrade, cleanup timer |
| `src/config.ts` | Reads env vars once |
| `src/types.ts` | Wire protocol + room types (copy into the Next.js app) |
| `src/rooms/roomManager.ts` | Room logic: create / join / relay / leave / expire (no I/O) |
| `src/rooms/codeGenerator.ts` | Secure 6-char room codes |
| `src/ws/handler.ts` | Per-connection events, rate limit on failed joins |
| `src/ws/parse.ts` | Validates every incoming message |
| `src/middleware/originGuard.ts` | Origin check for `/ws` (CORS doesn't cover WebSockets) |
| `src/middleware/rateLimit.ts` | Sliding-window limiter for failed joins |
| `src/routes/health.ts`, `turn.ts` | `GET /api/health`, `GET /api/turn-credentials` |

## Protocol (JSON over `/ws`)

Client → server: `create-room`, `join-room {roomId}`, `offer {sdp}`, `answer {sdp}`, `ice-candidate {candidate}`, `ping`

Server → client: `room-created {roomId}`, `room-joined {roomId, isInitiator}`, `peer-joined`, `peer-left`, `offer`, `answer`, `ice-candidate`, `error {message}`, `pong`

Flow: host `create-room` → guest `join-room` → host receives `peer-joined` and sends `offer` → guest sends `answer` → both exchange `ice-candidate` → data channel opens.

## Behaviour notes

- Rooms expire 30 minutes after creation (absolute, not inactivity).
- Host disconnect destroys the room; guest disconnect frees the seat.
- After 5 failed `join-room` attempts per minute from one client, further joins are refused.
- Without `TURN_URL` + `TURN_SECRET`, `/api/turn-credentials` returns STUN servers only.

## Testing with Postman

Start the server first: `bun run dev` (default `http://localhost:3001`).

### 1. HTTP endpoints

Create a new **HTTP request**, method **GET**:

| URL | Expected response |
|---|---|
| `http://localhost:3001/api/health` | `{"status":"ok","timestamp":...}` |
| `http://localhost:3001/api/turn-credentials` | `{"iceServers":[...]}` (STUN only, or STUN + TURN with `username`/`credential` when `TURN_URL` and `TURN_SECRET` are set) |
| `http://localhost:3001/api/nope` | `{"error":"Not found"}` with status 404 |

Postman does not enforce CORS (that is a browser rule). To inspect CORS headers, add the
header `Origin: http://localhost:3000` and check the response for `Access-Control-Allow-Origin`.
With `Origin: http://evil.com` that header should be absent.

### 2. WebSocket

1. Click **New → WebSocket**.
2. Enter `ws://localhost:3001/ws` and click **Connect**.
3. Open a second WebSocket tab to the same URL (one tab is the host, the other the guest).

**Tab 1 (host)** — send as JSON:

```json
{"type":"create-room"}
```

Expect `{"type":"room-created","roomId":"XXXXXX"}`. Copy the code.

**Tab 2 (guest):**

```json
{"type":"join-room","roomId":"XXXXXX"}
```

Tab 2 receives `room-joined`; Tab 1 receives `{"type":"peer-joined"}`.

**Relay test** — from Tab 1:

```json
{"type":"offer","sdp":{"type":"offer","sdp":"v=0"}}
```

Tab 2 should receive the same offer. Then send an `answer` from Tab 2, and an
`ice-candidate` from either tab:

```json
{"type":"answer","sdp":{"type":"answer","sdp":"v=0"}}
{"type":"ice-candidate","candidate":{"candidate":"x"}}
```

### 3. Checks for validation and protections

| Test | Expected |
|---|---|
| `{"type":"ping"}` | `{"type":"pong"}` |
| `not json` | `error: Invalid JSON` |
| `{"type":"join-room","roomId":123}` | `error: roomId must be a string` |
| `{"type":"offer","sdp":"x"}` | `error: Invalid offer` |
| `{"type":"launch-missiles"}` | `error: Unknown message type` |
| Join a nonexistent code (e.g. `ZZZZZZ`) 6 times in one tab | first 5 return `Room not found`, then `Too many failed attempts. Try again later.` |
| Third connection joins a full room | `Room is full` |
| Close the guest tab | host receives `peer-left`; room stays open |
| Close the host tab while the guest is connected | guest receives `peer-left`; room is destroyed |
| Send `offer` before any peer has joined | `error: No peer connected` |

### 4. Origin check on `/ws`

In the WebSocket request's **Headers**, set the Origin before connecting:

| Origin header | Expected |
|---|---|
| `http://evil.com` | rejected with 403 |
| `http://localhost:3000` | connects |
| (none) | connects (the guard only targets browsers; this is intentional) |

Allowed origins come from `ALLOWED_ORIGINS` in `.env`.

### Troubleshooting

- **Connection refused:** check the server is running and the port matches `PORT`.
- **403 on connect:** your Origin header is not in `ALLOWED_ORIGINS`.
- **`Too many failed attempts`:** wait 60 seconds, or restart the server (the limiter is in memory).
- **No TURN entry in `/api/turn-credentials`:** set both `TURN_URL` and `TURN_SECRET`.