# Security decisions

* **Server authority.** Cards, shoe order, roulette numbers, crash points, cash-out validity, slot
  grids, payouts, balances, reward and limit eligibility are computed server-side. The client sends
  intents (`bet`, `hit`, `cashout`) only.
* **Sessions.** Random 256-bit tokens in an `HttpOnly`, `SameSite=Lax` (`Secure` in production)
  cookie; only the SHA-256 hash is stored (`Session.tokenHash`). Sessions are revocable; password reset
  revokes all sessions. `Account` model is Auth.js-compatible for future OAuth providers.
* **Passwords.** Argon2id (`@node-rs/argon2`, m=19 MiB, t=2, p=1). Login timing is equalised for
  unknown users. Login/registration/reset are rate-limited per IP and per identifier.
* **CSRF.** State-changing requests must carry an `Origin` matching the host/APP_URL and a JSON body;
  combined with SameSite cookies.
* **Validation.** Every route uses Zod schemas; bodies are size-capped (64 KB). Socket payloads are
  validated in their handlers.
* **Authorization.** `route({ auth: 'ADMIN' })` role checks; admins cannot act on equal/higher roles;
  self-exclusion overrides are restricted to SUPER_ADMIN reinstatement of indefinite exclusions after a
  waiting period. Sensitive admin actions write `AdminAuditLog` (before/after/IP).
* **XSS.** React text rendering only; chat content is sanitised server-side (control/zero-width chars
  stripped), never rendered as HTML; links restricted to http(s). Strict-ish CSP via `next.config.ts`.
* **Secure headers.** CSP, `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`,
  COOP, HSTS (production).
* **Rate limiting.** Redis fixed windows on auth, wagers, chat, rewards. Fails open (wallet safety
  never depends on it).
* **Secrets.** Unrevealed server seeds never leave the server (not in APIs, logs or sockets). Logger
  redacts passwords, tokens, cookies and seeds by path.
* **Dev tools.** `/dev` and `/api/dev/*` return 404 unless `NODE_ENV !== 'production'` *and*
  `ENABLE_DEV_TOOLS=true`. Forced outcomes are read through a guard that is hard-disabled in
  production, and forced rounds are flagged.
* **Concurrency.** Row locks + unique constraints + conditional updates make double spends, double
  settlements and duplicate claims impossible even under concurrent retries (see WALLET.md).
