# Game engines

Every game follows the same split: a **pure engine** in `src/engines/<game>` (deterministic, no I/O,
exhaustively unit-tested, also used by the browser verifier), a **service** in
`src/server/services/<game>` (one DB transaction per request, wallet through `wagering.ts`), thin
**API routes**, and a **UI** that animates server results. All rounds store their fairness triple and
can be inspected via `GET /api/games/<game>/rounds/[id]` (standard `RoundDetail`, `src/lib/round-detail.ts`).

## Blackjack (`engines/blackjack`, `services/blackjack`)

* Rules (admin-configurable): 6 decks, dealer stands on soft 17, blackjack 3:2 (or 6:5), double any two,
  double after split, split up to 4 hands, split aces get one card (no hit, no resplit by default; ace+10 =
  21 not blackjack), insurance 2:1 when dealer shows an Ace, dealer peeks on A/10 upcards.
* State machine: `INSURANCE_OFFERED → PLAYER_TURN → DEALER_TURN → SETTLED`. Legal actions are computed by the
  engine; the UI shows only those. Hole card is never sent until revealed.
* Shoe: per-user `CardShoe`, shuffled with the fairness RNG at creation (`buildShoe`), cut card from
  penetration, reshuffled only **between rounds** at the cut card or after a seed rotation. Each game stores
  the shoe positions it consumed.
* Money: deal `bj:<id>:bet`; double/split/insurance are extra wagers through `placeWager` (so limits and
  self-exclusion apply); hit/stand never need eligibility so accepted hands always finish. One settlement
  credit `bj:<id>:settle` (+ `insurance:win`). Actions deduplicated by `BlackjackAction(gameId, requestId)`.
* Endpoints: `GET active`, `POST deal`, `POST action`, `GET rounds/[id]`, dev `GET dev/shoe`.

## Baccarat — Punto Banco (`engines/baccarat`, `services/baccarat`)

* Card values A=1, 2–9 face, 10/J/Q/K=0, totals mod 10. Naturals 8/9 stand. Player draws 0–5. If the player
  stands, banker draws 0–5. Otherwise the exact banker tableau (banker 3 draws unless P3=8; 4 on P3 2–7;
  5 on P3 4–7; 6 on P3 6–7; 7 stands; 0–2 draw) — tested for every banker total × every third card.
* Payouts: Player 1:1; Banker 1:1 less commission (`floor(bet × (10000 − bps) / 10000)` winnings, default
  5%); Tie 8:1 (configurable); Player/Banker push on a tie. Side-bet types exist in the engine for later.
* Shoe: per-user 8-deck shoe, cut card from penetration, reshuffle between rounds; bead plate for the current
  shoe. Endpoints: `GET state`, `POST deal`, `GET rounds/[id]`, dev `GET dev/shoe`.

## European Roulette (`engines/roulette`, `services/roulette`)

* Single zero. Canonical catalogue of all 157 legal bets (straight, split, street incl. 0-1-2/0-2-3, corner incl.
  first four, six line, dozens, columns, red/black, odd/even, 1–18/19–36); submitted bets must match exactly.
* `winningNumber = rng.int(37)` (first draw). Payout = stake × (odds + 1).
* One request per spin (`POST spin`): validate → one wager → number → settle every bet → one credit.
  The client receives the number and animates the wheel and an independently moving ball to that pocket.

## Crash — “Launch” (`engines/crash`, `services/crash`)

* Round loop `WAITING (5s betting) → BETTING_LOCKED → RUNNING → CRASHED → SETTLED`, run by exactly one process
  (Redis leader lock `crash:leader`). Every step re-reads the DB, so restarting the loop is recovery.
* Commit–reveal per round: `seedHash` published at WAITING, `crashPoint = floor(99·2⁵²/(2⁵²−h))/100` with
  `h` = first 52 bits of `HMAC_SHA256(seed, "nova-launch-v1")`; P(crash ≥ m) = 0.99/m. Seed revealed after
  the crash. Multiplier `m(t) = e^(0.00006·t ms)`.
* Bets/cash-outs over Socket.IO (`crash:bet`, `crash:cashout`, acked). The multiplier for a cash-out is taken
  from the **server clock**; cash-out at/after the crash point is rejected; auto cash-out pays exactly at the
  target. Conditional status updates + ledger keys `crash:<betId>:bet|cashout|refund` → no double settlement.
* Reconnect: `crash:join` returns a snapshot with your bets so the UI restores a valid cash-out button.

## Slots (`engines/slots`, `services/slots`) — see SLOT_MATH.md

* One `SlotEngine` supporting lines, ways and cluster evaluation, wilds (substituting, expanding, multiplier),
  scatters, free spins with retriggers, cascades with gravity refill, multiplier ladders, random modifiers,
  persistent bonus state and a max-win cap. Machine definitions are pure config in `engines/slots/definitions`.
* `npm run simulate` validates RTP/hit rate/bonus frequency/volatility over millions of spins.
* Paid spins wager through `placeWager`; free spins use the bet locked in `SlotGame.bonusState` and only need
  `assertPlayAllowed` (they are blocked, but preserved, during a break).
