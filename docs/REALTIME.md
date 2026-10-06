# WebSockets & chat

Socket.IO runs in the same process as Next.js (`server.ts` → `src/server/socket/server.ts`), path
`/socket.io`. The handshake reads the `nova_session` cookie; guests may connect (lobby presence, chat
reading, crash spectating).

## Server → client delivery

All pushes go through Redis pub/sub (`nova:events`) via `src/server/realtime/events.ts`, so any process
(API route, crash leader) can reach any socket. Events raised inside a DB transaction are queued in a
`PostCommit` and published only after commit.

| Event | Scope | Payload |
|---|---|---|
| `wallet:update` | user | `{ balance, delta, type }` |
| `level:up`, `xp:update`, `notification:new`, `play:status` | user | progression / RP changes |
| `presence` | all | `{ online, users, games: { [gameId]: count } }` |
| `crash:state`, `crash:tick`, `crash:bet`, `crash:cashout` | room `crash` | round snapshots, 100 ms ticks |
| `crash:mybet` | user | your bet changes |
| `chat:message`, `chat:deleted` | per viewer (`nova:chat` channel) | messages filtered by the viewer's block list |

## Client → server RPCs (acked `{ ok, data } | { ok:false, error }`)

`presence:get`, `presence:game`, `crash:join`, `crash:leave`, `crash:bet`, `crash:cashout`, `chat:join`,
`chat:send`, `chat:delete`. Payloads are validated and rate limited.

## Chat

* Global room; last 50 messages on join. Max 300 characters, whitespace normalised, control and zero-width
  characters stripped, rendered as React text only (never HTML). Links clickable only for allowlisted
  http(s) domains.
* Per-user send lock makes rate limits exact: 5 messages / 10 s, configurable slow mode, identical message
  within 60 s rejected, caps/repetition throttled, blocked-word list with normalisation (`blocked-words.ts`).
* Replies, @mentions (highlighted, pinged), mute (local), block (server-side filtering), report.
* Moderators: delete, warn, mute 10 m / 1 h / 24 h / custom, chat ban/unban; admins: suspend account. Every
  action writes `ModerationLog` (and `AdminAuditLog` for suspensions). Players on a break or suspended are
  read-only.

## Reconnection

The client reconnects automatically (backoff 0.5–4 s); the shell shows a "Connection lost — reconnecting"
banner. On reconnect, the session is re-read, `me` is refetched, and crash/chat re-join and receive snapshots.
