# Provable fairness

Every NOVA result is derived from seeds that are committed **before** the
player acts and revealed **afterwards**, so anyone can re-derive it. The
in-app verifier (`/fairness`) runs the exact engine code in the browser using a
pure-JS SHA-256/HMAC (`src/engines/fairness/sha256.ts`); the server uses
`node:crypto`. Unit tests assert both produce identical bytes and that the
engines agree with the standalone snippet at the end of this document
(`tests/unit/fairness/verifier.test.ts`).

## 1. Commit – reveal

| Step | What happens |
| --- | --- |
| Commit | The server generates a random 32-byte **server seed** (hex) and publishes only `sha256(serverSeed)` (hex). |
| Contribute | The player’s **client seed** (1–64 printable ASCII chars, editable) is mixed into every result. Each round reserves the next **nonce** (0, 1, 2…) atomically in the round’s DB transaction. |
| Reveal | *Rotate seed* (`POST /api/fairness/rotate`) reveals the server seed, commits a new one and optionally sets a new client seed. |
| Verify | Check `sha256(serverSeed) === committedHash`, then re-derive any round. |

Rotating **retires the player’s active Blackjack/Baccarat shoes** (their
remaining order would otherwise become computable) and is **refused while a
Blackjack hand is unfinished** (`ROUND_IN_PROGRESS`). Active seeds are never
sent to clients; round detail endpoints include `serverSeed` only once its pair
is `REVEALED`.

## 2. The random stream (`FairRng`, `src/engines/fairness/rng.ts`)

```
block(round) = HMAC_SHA256(key = serverSeed, message = `${clientSeed}:${nonce}:${round}`)   round = 0, 1, 2…
float        = b0/256 + b1/256² + b2/256³ + b3/256⁴        (4 bytes per float, 8 floats per block)
int(n)       = floor(float × n)
```

Engines never call `Math.random()`; they consume this stream in a fixed,
documented order.

## 3. Games

### Roulette (single zero)
`winningNumber = int(37)` — the first float of the stream × 37, floored.

### Blackjack & Baccarat (shoes)
A shoe is an ordered pack of `decks` decks — deck by deck, suits `S H D C`,
ranks `A 2 … 9 T J Q K` — shuffled **once**, with the nonce reserved when the
shoe was created, by Fisher–Yates:

```
for i = n−1 down to 1:  j = int(i + 1);  swap(cards[i], cards[j])
```

Rounds deal sequential positions. A round’s details expose `positions: [from, to)`
(deal order: Blackjack P1, dealer up, P2, dealer hole, then draws; Baccarat P1,
B1, P2, B2, then third cards). `shoe.slice(from, to)` must equal the dealt cards;
for Baccarat `resolveBaccarat(cards)` re-plays the tableau.

Verifier API: `verifyBlackjackShoe(serverSeed, clientSeed, nonce, decks)`,
`verifyBaccaratShoe(...)` + `resolveBaccarat(cards)`.

### Crash (Launch) — shared rounds
Crash is multiplayer, so it uses a per-**round** seed instead of the player’s
pair. The round’s `seedHash` is published before betting opens and the seed is
revealed when the round crashes. The salt is public and fixed (`nova-launch-v1`).

```
h     = first 52 bits (13 hex chars) of HMAC_SHA256(key = roundSeed, message = salt)
crash = max(1.00, floor(99 × 2^52 / (2^52 − h)) / 100)
```

`P(crash ≥ m) = 0.99 / m` → a 1% edge for every cash-out target.
Verifier API: `verifyCrash(seed, salt) → { crashPointX100, seedHash }`.

### Slots
`verifySlotSpin(slotId, serverSeed, clientSeed, nonce, betLevel, bonusStateBefore)`
re-runs the engine. Draw order (see `src/engines/slots/engine.ts`): landed grid
(reels left→right, rows top→bottom, one weighted draw per cell), base-game
modifiers, deterministic transforms, then cascade refills. Free spins carry a
`bonusState` between spins (no RNG state); it is published in each spin’s
fairness `extra` so any spin can be replayed exactly. Dev-forced rounds are
flagged `forced` and are not seed-derived by design.

## 4. Verifying in the app

* `/history` → open a round → **Verify result** opens `/fairness` prefilled via
  query parameters (`game, serverSeed, clientSeed, nonce, seedHash, decks, from,
  to, salt, slotId, betLevel, bonusState`) and computes immediately.
* If the server seed is still secret, rotate your seed pair first (`/fairness#seeds`).

## 5. Verify independently (Node ≥ 18, no dependencies)

```js
// verify.mjs — node verify.mjs
import { createHash, createHmac } from 'node:crypto';

function floats(serverSeed, clientSeed, nonce, count) {
  const out = [];
  for (let round = 0; out.length < count; round++) {
    const b = createHmac('sha256', serverSeed).update(`${clientSeed}:${nonce}:${round}`).digest();
    for (let i = 0; i < 32 && out.length < count; i += 4)
      out.push(b[i] / 256 + b[i + 1] / 256 ** 2 + b[i + 2] / 256 ** 3 + b[i + 3] / 256 ** 4);
  }
  return out;
}

const sha256 = (s) => createHash('sha256').update(s).digest('hex');
const roulette = (s, c, n) => Math.floor(floats(s, c, n, 1)[0] * 37);

function shoe(s, c, n, decks) {
  const cards = [];
  for (let d = 0; d < decks; d++) for (const suit of 'SHDC') for (const r of 'A23456789TJQK') cards.push(r + suit);
  const f = floats(s, c, n, cards.length - 1);
  for (let i = cards.length - 1, k = 0; i > 0; i--, k++) {
    const j = Math.floor(f[k] * (i + 1));
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }
  return cards;
}

function crash(seed, salt = 'nova-launch-v1') {
  const h = BigInt('0x' + createHmac('sha256', seed).update(salt).digest('hex').slice(0, 13));
  const e = 2n ** 52n;
  return Math.max(100, Number((99n * e) / (e - h))) / 100;
}

const serverSeed = process.argv[2] ?? '<revealed server seed>';
console.log('hash      ', sha256(serverSeed));
console.log('roulette  ', roulette(serverSeed, '<client seed>', 0));
console.log('6-deck shoe', shoe(serverSeed, '<client seed>', 0, 6).slice(0, 10).join(' '), '…');
console.log('crash     ', crash(serverSeed) + '×');
```

This snippet is mirrored verbatim (as a reference implementation) in the unit
tests, which compare it against every game’s verifier.
