# Architecture

NOVA is a single TypeScript codebase: a Next.js 16 App Router application served by a small custom
Node server (`server.ts`) that also hosts Socket.IO. PostgreSQL (via Prisma) is the system of record;
Redis provides the realtime bus, rate limiting, presence, leader election and dev-only overrides.

```
                    ┌──────────────────────────────────────────────┐
 Browser ──HTTP──▶  │ server.ts (Node)                             │
   │                │  ├─ Next.js request handler                   │
   │                │  │    ├─ React Server/Client Components (UI)  │
   │                │  │    └─ Route handlers  src/app/api/**       │──▶ services ──▶ Prisma ──▶ PostgreSQL
   └──WebSocket──▶  │  └─ Socket.IO (src/server/socket)             │        │
                    │       ├─ chat module   (services/chat)        │        └──▶ Redis (bus, rate limits,
                    │       ├─ crash module  (services/crash, loop)  │                  presence, locks)
                    │       └─ presence + Redis event fan-out       │
                    └──────────────────────────────────────────────┘
```

## Layers

| Layer | Location | Rules |
|---|---|---|
| Engines (pure math) | `src/engines/<game>` | Deterministic, no I/O, no React. Take an `Rng`. Unit-tested exhaustively. Shared with the browser verifier. |
| Fairness | `src/engines/fairness`, `src/server/services/fairness` | HMAC-SHA256 commit–reveal. See FAIRNESS.md. |
| Services (domain) | `src/server/services/**` | Own transactions, wallet movement (through `wagering.ts` → `WalletService`), persistence, settlement. |
| API | `src/app/api/**` | Thin route handlers wrapped in `route()` (CSRF, auth, Zod, rate limit, error envelope). |
| Realtime | `src/server/socket`, `src/server/realtime/events.ts` | Socket.IO; all server→client pushes go through the Redis bus so any process can emit. |
| UI | `src/components/**`, `src/app/(app)/**` | Design system in `components/ui`; games render server results, never compute them. |

Game logic never lives in React components. Wallet arithmetic never leaves `WalletService`.
Animation is presentation only: the server has already settled the round before the client animates.

## Request lifecycle of a wager (e.g. a roulette spin)

1. Client generates a `requestId` once per user action and POSTs `{ bets, requestId }`.
2. `route()` checks Origin (CSRF), session cookie, role, Zod schema, rate limit.
3. Service opens one PostgreSQL transaction:
   1. `lockWallet` — `SELECT … FOR UPDATE` on the user's wallet row (serialises that user's wagers).
   2. Replay check — if a round with this `clientRequestId` exists, return it unchanged.
   3. `placeWager` → `WagerEligibilityService` (status, cooldown/self-exclusion, maintenance, game
      enabled, min/max, daily wager limit, daily loss limit, balance) → `BET` ledger entry → daily
      aggregate → XP.
   4. `drawSeed` reserves the next nonce of the user's seed pair → deterministic `FairRng`.
   5. Pure engine computes the outcome. Round + bets persisted.
   6. `creditPayout` → `WIN` ledger entry (deterministic idempotency key) → aggregate.
   7. `recordRound` → `GameHistory` (unique per round) + `PlayerStats`.
4. Commit. Post-commit realtime events (`wallet:update`, `level:up`) are flushed to Redis.
5. Client animates to the server result and only then reveals the payout in the balance.

## Processes & scaling

* Everything runs in one process in development. Socket modules are loaded by `server.ts`.
* Crash uses a Redis leader lock so exactly one process runs the round loop; other processes relay.
* All realtime emission goes through Redis pub/sub (`nova:events`), so route handlers in any process
  can push to any socket. For multiple nodes add the Socket.IO Redis adapter for room broadcasts.
* Parallel dev servers are supported with `NEXT_DIST_DIR=.next-x PORT=3101 npx tsx server.ts`.

## Directory structure

```
prisma/                 schema.prisma, migrations, seed.ts
server.ts               Next.js + Socket.IO entrypoint
scripts/simulate.ts     slot RTP simulator (npm run simulate)
src/
  app/                  App Router: (app) shell pages, (auth) pages, api/** route handlers
  components/
    ui/                 design system primitives
    layout/             shell: sidebar, top bar, mobile nav, popovers
    brand/              logo, wordmark, game artwork
    games/<game>/       game UIs (+ shared GameShell)
    chat/ profile/ …    feature UIs
  engines/<game>/       pure game math + verifiers
  server/
    api/handler.ts      route() wrapper
    auth/               sessions (DB-backed, hashed tokens), Argon2id
    services/<domain>/  wallet, wagering, responsible-play, fairness, rewards, games, chat, admin…
    socket/             Socket.IO server, presence, module loader
    realtime/           Redis event bus
  lib/                  isomorphic helpers (errors, money, format, levels, time, games, api client)
  stores/               Zustand stores (UI, display balance)
  audio/                AudioManager (Web Audio synthesis)
tests/unit|integration|component   Vitest
e2e/                    Playwright
docs/                   this documentation
```
