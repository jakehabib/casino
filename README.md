# NOVA — premium play-money social casino

NOVA is a free-to-play social casino built around seven carefully made games:
**Blackjack, Baccarat, European Roulette, Launch (multiplayer crash) and three distinct slots**
(Gilded Vault, Overcharge, Starforged Relics), with live chat, player levels, statistics, provably fair
outcomes and serious responsible-play controls.

> **Play money only.** Credits cannot be purchased, withdrawn, redeemed, transferred or exchanged for
> anything of value. There are no payment, crypto, skin, prize or cash-out integrations.

---

## Quick start (local)

Requirements: **Node.js 22+**, **Docker** (for PostgreSQL + Redis).

```bash
cp .env.example .env
docker compose up -d          # PostgreSQL 16 + Redis 7 (also creates the nova_test database)
npm install
npm run db:deploy             # apply migrations   (use `npm run db:migrate` while changing the schema)
npm run db:seed               # default settings + demo accounts
npm run dev                   # http://localhost:3000
```

`npm run dev` starts `server.ts`: Next.js + Socket.IO (chat, crash, live balance) in one process.

### Demo accounts (development seed)

| Role | Email | Password |
|---|---|---|
| Player | `demo@nova.test` | `demo12345` |
| Moderator | `mod@nova.test` | `moderator123` |
| Admin | `admin@nova.test` | `admin12345` |
| Super admin | `super@nova.test` | `superadmin123` |

New accounts receive **100,000 Credits**. The **dev panel** (`/dev`, development only) can grant credits,
force blackjack/baccarat cards, roulette numbers, crash points and slot features, inspect shoes and seeds,
speed up the crash countdown and reset responsible-play state.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Development server (Next.js + Socket.IO) on `PORT` (3000) |
| `npm run build` / `npm start` | Production build / start |
| `npm run db:migrate` · `db:deploy` · `db:seed` · `db:reset` · `db:studio` | Database workflows |
| `npm run simulate -- --slot gilded-vault --spins 1000000` | Slot RTP simulator (all slots by default) |
| `npm test` | All Vitest projects (unit + component + integration) |
| `npm run test:unit` · `npx vitest run --project integration` | Pure-engine tests · DB-backed service tests (uses `TEST_DATABASE_URL`) |
| `npm run test:e2e` | Playwright end-to-end suite (boots its own server on :3300) |
| `npm run typecheck` | TypeScript |

## Environment variables

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection (`?connection_limit=20` recommended) |
| `TEST_DATABASE_URL` | Separate database for integration tests (wiped by the suite) |
| `REDIS_URL` | Redis (realtime bus, rate limits, presence, crash leader lock) |
| `APP_URL` | Public origin (CSRF origin check, links) |
| `AUTH_SECRET` | Long random secret — required in production |
| `SESSION_TTL_DAYS` | Session lifetime (default 30) |
| `ENABLE_DEV_TOOLS` | Enables `/dev` + forced outcomes. Ignored (always off) when `NODE_ENV=production` |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_USERNAME` | Optional: create a SUPER_ADMIN owner account when seeding (e.g. first deploy) |
| `SEED_DEMO_USERS` | `true` to create the demo accounts in production |
| `TRUST_PROXY` | `true` when behind one reverse proxy (Railway, Render, nginx) so rate limits use the real client IP |
| `LOG_LEVEL`, `PORT` | Logging level, port |

## Deploying to Railway

The repo ships `railway.json` + `Dockerfile`; the container applies migrations, seeds settings (and the
owner account if `ADMIN_EMAIL`/`ADMIN_PASSWORD` are set) and starts the server.

1. New Project → **Deploy from GitHub repo** → pick this repository/branch.
2. **+ New → Database → PostgreSQL** and **+ New → Database → Redis**.
3. On the app service → **Variables**: `DATABASE_URL=${{Postgres.DATABASE_URL}}`,
   `REDIS_URL=${{Redis.REDIS_URL}}`, `AUTH_SECRET=<long random string>`, `NODE_ENV=production`, `TRUST_PROXY=true`,
   `ADMIN_EMAIL`, `ADMIN_PASSWORD` (and optionally `SEED_DEMO_USERS=true`).
4. **Settings → Networking → Generate Domain**, then set `APP_URL=https://<that domain>` and redeploy.

Any Docker host works the same way — see [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md). Vercel's serverless
model cannot host the long-lived Socket.IO server (crash + chat).

## Documentation

| Topic | Doc |
|---|---|
| Architecture, request lifecycle, directory structure | [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) |
| Database models, constraints, conventions | [docs/DATABASE.md](docs/DATABASE.md) |
| Wallet ledger, idempotency, rewards | [docs/WALLET.md](docs/WALLET.md) |
| Blackjack, Baccarat, Roulette, Crash, Slot engines | [docs/GAMES.md](docs/GAMES.md) |
| Slot math, paytables, simulation results | [docs/SLOT_MATH.md](docs/SLOT_MATH.md) |
| Provable fairness + independent verification | [docs/FAIRNESS.md](docs/FAIRNESS.md) |
| WebSockets, realtime events, chat | [docs/REALTIME.md](docs/REALTIME.md) |
| Responsible play: limits, breaks, self-exclusion | [docs/RESPONSIBLE_PLAY.md](docs/RESPONSIBLE_PLAY.md) |
| Security decisions | [docs/SECURITY.md](docs/SECURITY.md) |
| Design system: tokens, motion, components, sound | [docs/DESIGN_SYSTEM.md](docs/DESIGN_SYSTEM.md) |
| Deployment | [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) |

## Tech stack

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS 4 · Framer Motion · TanStack Query ·
Zustand · Radix primitives · PostgreSQL + Prisma 6 · Redis (ioredis) · Socket.IO · Zod 4 · Argon2id ·
pino · Vitest + Testing Library · Playwright · Docker.

## Quality status

* 578 Vitest tests (unit, component, integration against PostgreSQL) and 23 Playwright end-to-end tests
  cover every required flow; `tsc` and `next build` are clean.
* A dedicated adversarial QA pass covered every game (payouts vs ledger, duplicate/concurrent requests,
  refresh/reconnect, limits and breaks), realtime (multi-user crash races, chat moderation), and security
  (CSRF, authorization, XSS, secret leakage, rate limits). Bugs found were fixed with regression tests.

## Known limitations

* No real-money features of any kind (by design).
* Avatars are generated presets (no uploads). Password-reset emails are printed to the server console in
  development — plug a mailer into `requestPasswordReset` for production.
* Single global chat room; chat keeps the latest 50 messages on join (no "load older"). The blocked-word
  list is a code file, not an admin setting.
* Slot free spins play automatically once started. Phone landscape places the slot reels below the fold.
* Double/Split/Insurance buttons stay visible when they would be rejected (the server rejects them with a
  friendly message). Baccarat allows betting Player and Banker together.
* Responsible-play unlock times display in the browser's timezone (not labelled with the RP timezone).
* Scaling Socket.IO past one node needs `@socket.io/redis-adapter`; presence and crash already coordinate
  through Redis.
* Docker image build was validated step-by-step (install, prisma generate, production build, production
  start); a full `docker build` could not be run in the authoring environment due to registry rate limits.
