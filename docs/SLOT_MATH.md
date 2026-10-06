# Slot math — NOVA SlotEngine

All three machines run on **one engine** (`src/engines/slots/engine.ts`) driven by pure
configuration (`src/engines/slots/definitions/*.ts`). The numbers below are produced by
`scripts/simulate.ts` using the exact production engine.

```
npm run simulate                                         # all slots, 1,000,000 rounds each
npm run simulate -- --slot gilded-vault --spins 10000000 # one slot
npm run simulate -- --workers 4 --seed 42 --json         # options
```

A **round** is one paid spin plus every free spin it triggers (played out in full), so RTP,
hit frequency and volatility are per paid spin. The simulator uses `FastRng` (mulberry32,
simulation only) and `worker_threads`; live spins use `FairRng` (HMAC-SHA256) from the
player's seed pair. "Volatility (σ)" is the standard deviation of the round return in × bet;
the 95% CI of RTP is `1.96·σ/√n`.

## Shared rules

* **Money is integer.** Paytable values are integers in hundredths of the total bet
  (`250` = 2.5×). Every win is `floor(betLevel × pay × ways × multiplier / 100)`.
* **Grid draws.** Every cell is one weighted draw from its reel's weight table (base or
  free-spin set). Symbols with `maxPerReel` (scatters, Supernova) are excluded from a draw
  once their cap is reached on that reel (still exactly one draw).
* **RNG draw order** (fixed; the verifier depends on it): landed grid reels left→right,
  rows top→bottom → base-game modifier roll (Starforged) → deterministic transforms
  (Supernova, expanding wilds) → cascade refills (reels left→right, new cells top→bottom).
* **Scatters** are counted on the final grid of a spin (after cascades); scatter pays are
  not multiplied.
* **Max win** is enforced per round by the engine: once a round reaches `maxWinX × bet` the
  spin is truncated, `MAX_WIN` is flagged and any remaining free spins end.
* **Bonus state** (free spins left, locked bet level, persistent multiplier, cascade ladder
  level, relics) is persisted between requests in `SlotGame.bonusState`; it contains no RNG
  state — each free spin uses the next fairness nonce.

## Summary (10,000,000 rounds each)

| | Gilded Vault | Overcharge | Starforged Relics |
|---|---:|---:|---:|
| Layout | 5×3, 20 lines | 5×4, 1,024 ways | 6×5, cluster pays (5+) |
| Target RTP | 96.00% | 96.00% | 96.00% |
| **Simulated RTP** | **96.186%** ±0.302 | **95.803%** ±0.549 | **96.270%** ±0.662 |
| Base game / free spins | 69.19% / 26.99% | 62.34% / 33.46% | 52.53% / 43.74% |
| Hit frequency | 46.18% | 36.40% | 36.05% |
| Free-spin trigger | 0.535% (1 in 187) | 0.454% (1 in 220) | 0.376% (1 in 266) |
| Avg bonus win | 50.47× (10.2 spins) | 73.77× (8.4 spins) | 116.20× (22.3 spins) |
| Avg win (winning rounds) | 2.08× | 2.63× | 2.67× |
| Largest simulated win | 442.83× | 2,377.70× | 2,043.40× |
| Volatility σ | 4.88 (medium) | 8.86 (medium-high) | 10.67 (high) |
| Max win cap | 2,500× | 5,000× | 10,000× |
| Seed | 20261006 | 20261006 | 777 |

**Win distribution per round (× bet)**

| Bucket | Gilded Vault | Overcharge | Starforged Relics |
|---|---:|---:|---:|
| 0× | 53.820% | 63.602% | 63.948% |
| <1× | 25.271% | 21.396% | 28.089% |
| 1–2× | 10.834% | 6.472% | 2.117% |
| 2–5× | 7.248% | 5.579% | 2.480% |
| 5–20× | 2.301% | 2.459% | 2.851% |
| 20–100× | 0.475% | 0.384% | 0.340% |
| 100–1000× | 0.051% | 0.109% | 0.175% |
| 1000×+ | 0.000% | 0.0005% (48) | 0.0003% (32) |

Earlier independent runs (5,000,000 rounds, different seeds) measured 96.17% / 96.18% /
96.07%¹ — all within ±0.5% of target. (¹ before the final +1× on the 4-Star-Gate pay.)

Character: Gilded Vault hits on almost every other spin with modest line wins and a frequent,
steady bonus; Overcharge is streakier — fewer hits, cascading chains and a bonus whose
chain multiplier never resets; Starforged Relics pays little in the base game and keeps
almost half its return in a long, upgrading bonus with the largest tail.

---

## 1 · Gilded Vault (`gilded-vault`)

5×3, 20 fixed paylines, left to right from reel 1. Wild (reels 2–4) substitutes for all but
the Vault. **Vault** scatter: 3 / 4 / 5 anywhere pay 2× / 10× / 50× and award
10 / 12 / 15 free spins (same awards retrigger during free spins). During free spins every
landed wild **expands to fill its reel** (transform `EXPANDING_WILD`). Low symbols are
weighted alternately per reel to keep the line hit rate classic but not constant.

Paylines (row index per reel, 0 = top):
`[1,1,1,1,1] [0,0,0,0,0] [2,2,2,2,2] [0,1,2,1,0] [2,1,0,1,2] [0,0,1,2,2] [2,2,1,0,0]
[1,0,0,0,1] [1,2,2,2,1] [1,0,1,2,1] [1,2,1,0,1] [0,1,0,1,0] [2,1,2,1,2] [0,1,1,1,0]
[2,1,1,1,2] [1,1,0,1,1] [1,1,2,1,1] [0,2,0,2,0] [2,0,2,0,2] [0,2,2,2,0]`

**Base game weights** (per cell, per reel; each cell is an independent weighted draw)

| Symbol | Reel 1 | Reel 2 | Reel 3 | Reel 4 | Reel 5 |
|---|---:|---:|---:|---:|---:|
| BAR | 34 | 12 | 30 | 14 | 30 |
| BELL | 12 | 34 | 14 | 30 | 16 |
| DIAMOND | 24 | 9 | 24 | 10 | 22 |
| SEVEN | 9 | 22 | 9 | 22 | 10 |
| CROWN | 6 | 6 | 8 | 6 | 8 |
| WILD | 0 | 3 | 3 | 3 | 0 |
| VAULT | 2 | 3 | 3 | 3 | 2 |
| *total* | 87 | 89 | 91 | 88 | 88 |

**Free spins weights** (per cell, per reel; each cell is an independent weighted draw)

| Symbol | Reel 1 | Reel 2 | Reel 3 | Reel 4 | Reel 5 |
|---|---:|---:|---:|---:|---:|
| BAR | 34 | 12 | 30 | 14 | 30 |
| BELL | 12 | 34 | 14 | 30 | 16 |
| DIAMOND | 24 | 9 | 24 | 10 | 22 |
| SEVEN | 9 | 22 | 9 | 22 | 10 |
| CROWN | 6 | 6 | 8 | 6 | 8 |
| WILD | 0 | 12 | 12 | 12 | 0 |
| VAULT | 2 | 2 | 2 | 2 | 2 |
| *total* | 87 | 97 | 99 | 96 | 88 |

**Paytable** (× total bet, per line; stored as integer hundredths)

| Symbol | 3 | 4 | 5 |
|---|---:|---:|---:|
| BAR | 0.24× | 0.65× | 2.3× |
| BELL | 0.28× | 0.8× | 2.75× |
| DIAMOND | 0.52× | 1.6× | 5.5× |
| SEVEN | 0.85× | 2.75× | 11× |
| CROWN | 1.4× | 5.5× | 23× |

## 2 · Overcharge (`overcharge`)

5×4, 1,024 ways (matching symbols on adjacent reels from reel 1, any row; ways multiply).
Wilds on reels 2–5. **Cascades:** winning symbols are removed, survivors fall, new symbols
drop in from the same weights. The **chain multiplier** climbs 1× → 2× → 3× → 5× → 10× (cap)
per cascade within a spin and resets on the next paid spin. **Free spins:** 3 / 4 / 5 scatters
award 8 / 12 / 20 spins (retrigger 5 / 8 / 10). In free spins the chain multiplier **does
not reset between spins** and ×2 Overcharged Wilds (`WILD2`, count as two ways) can land.
Scatter pays: 3 = 1×, 4 = 5×, 5 = 20×. The low symbols come in two families weighted
alternately per reel (A-heavy / B-heavy), which keeps the ways hit rate in check.

**Base game weights** (per cell, per reel; each cell is an independent weighted draw)

| Symbol | Reel 1 | Reel 2 | Reel 3 | Reel 4 | Reel 5 |
|---|---:|---:|---:|---:|---:|
| CELL | 34 | 8 | 34 | 8 | 21 |
| NODE | 8 | 34 | 8 | 34 | 21 |
| FUSE | 34 | 8 | 34 | 8 | 21 |
| DIODE | 8 | 34 | 8 | 34 | 21 |
| CHIP | 34 | 8 | 34 | 8 | 21 |
| COIL | 8 | 34 | 8 | 34 | 21 |
| CORE | 14 | 14 | 14 | 14 | 14 |
| PLASMA | 10 | 10 | 10 | 10 | 10 |
| REACTOR | 7 | 7 | 7 | 7 | 7 |
| WILD | 0 | 3 | 3 | 3 | 3 |
| SCATTER | 3 | 3 | 3 | 3 | 3 |
| *total* | 160 | 163 | 163 | 163 | 163 |

**Free spins weights** (per cell, per reel; each cell is an independent weighted draw)

| Symbol | Reel 1 | Reel 2 | Reel 3 | Reel 4 | Reel 5 |
|---|---:|---:|---:|---:|---:|
| CELL | 34 | 8 | 34 | 8 | 21 |
| NODE | 8 | 34 | 8 | 34 | 21 |
| FUSE | 34 | 8 | 34 | 8 | 21 |
| DIODE | 8 | 34 | 8 | 34 | 21 |
| CHIP | 34 | 8 | 34 | 8 | 21 |
| COIL | 8 | 34 | 8 | 34 | 21 |
| CORE | 14 | 14 | 14 | 14 | 14 |
| PLASMA | 10 | 10 | 10 | 10 | 10 |
| REACTOR | 7 | 7 | 7 | 7 | 7 |
| WILD | 0 | 7 | 7 | 7 | 7 |
| WILD2 | 0 | 3 | 3 | 3 | 3 |
| SCATTER | 3 | 3 | 3 | 3 | 3 |
| *total* | 160 | 170 | 170 | 170 | 170 |

**Paytable** (× total bet, per way; stored as integer hundredths)

| Symbol | 3 | 4 | 5 |
|---|---:|---:|---:|
| CELL | 0.15× | 0.3× | 0.6× |
| NODE | 0.15× | 0.3× | 0.6× |
| FUSE | 0.15× | 0.3× | 0.6× |
| DIODE | 0.15× | 0.3× | 0.75× |
| CHIP | 0.15× | 0.45× | 0.9× |
| COIL | 0.3× | 0.6× | 1.2× |
| CORE | 0.45× | 1.2× | 2.4× |
| PLASMA | 0.6× | 1.5× | 3.75× |
| REACTOR | 0.75× | 2.25× | 6× |

## 3 · Starforged Relics (`starforged-relics`)

6×5 cluster pays: 5+ orthogonally adjacent identical symbols; wilds join any cluster and can
be shared by clusters of different symbols. Cascades (no ladder). Features:

* **Supernova** (special, max 1 per reel, never drawn by refills): on landing bursts into a
  3×3 block of wilds (clamped to the grid, scatters untouched).
* **Celestial modifiers** — 5% of base spins: **Star Surge** (45%: 5–9 cells become one
  symbol, weighted toward low symbols), **Relic Wilds** (35%: 2–4 wilds added),
  **Orrery** (20%: whole-spin multiplier 2× 50% · 3× 25% · 4× 15% · 5× 10%).
* **Free spins:** 4 / 5 / 6 Star Gates award 10 / 12 / 15 (retrigger 5 / 7 / 10); scatter
  pays 4× / 10× / 50×.
* **Relic tiers:** Relics land only in free spins (weight 50 per cell). Collecting 3 / 7 / 12
  / 18 reaches tiers 1–4: each tier adds +3 free spins and raises the **persistent bonus
  multiplier** to 2× / 3× / 5× / 10× for every later free-spin win.

**Base game weights** (per cell, per reel; each cell is an independent weighted draw)

| Symbol | Reel 1 | Reel 2 | Reel 3 | Reel 4 | Reel 5 | Reel 6 |
|---|---:|---:|---:|---:|---:|---:|
| GEM_TEAL | 200 | 200 | 200 | 200 | 200 | 200 |
| GEM_ROSE | 200 | 200 | 200 | 200 | 200 | 200 |
| GEM_AZURE | 190 | 190 | 190 | 190 | 190 | 190 |
| GEM_AMBER | 180 | 180 | 180 | 180 | 180 | 180 |
| CHALICE | 120 | 120 | 120 | 120 | 120 | 120 |
| ASTROLABE | 90 | 90 | 90 | 90 | 90 | 90 |
| STARCROWN | 60 | 60 | 60 | 60 | 60 | 60 |
| WILD | 20 | 20 | 20 | 20 | 20 | 20 |
| SCATTER | 27 | 27 | 27 | 27 | 27 | 27 |
| SUPERNOVA | 3 | 3 | 3 | 3 | 3 | 3 |
| *total* | 1090 | 1090 | 1090 | 1090 | 1090 | 1090 |

**Free spins weights** (per cell, per reel; each cell is an independent weighted draw)

| Symbol | Reel 1 | Reel 2 | Reel 3 | Reel 4 | Reel 5 | Reel 6 |
|---|---:|---:|---:|---:|---:|---:|
| GEM_TEAL | 200 | 200 | 200 | 200 | 200 | 200 |
| GEM_ROSE | 200 | 200 | 200 | 200 | 200 | 200 |
| GEM_AZURE | 190 | 190 | 190 | 190 | 190 | 190 |
| GEM_AMBER | 180 | 180 | 180 | 180 | 180 | 180 |
| CHALICE | 120 | 120 | 120 | 120 | 120 | 120 |
| ASTROLABE | 90 | 90 | 90 | 90 | 90 | 90 |
| STARCROWN | 60 | 60 | 60 | 60 | 60 | 60 |
| WILD | 20 | 20 | 20 | 20 | 20 | 20 |
| SCATTER | 22 | 22 | 22 | 22 | 22 | 22 |
| SUPERNOVA | 6 | 6 | 6 | 6 | 6 | 6 |
| RELIC | 50 | 50 | 50 | 50 | 50 | 50 |
| *total* | 1138 | 1138 | 1138 | 1138 | 1138 | 1138 |

**Paytable** (× total bet, per cluster; sizes between columns pay the lower column; stored as integer hundredths)

| Symbol | 5+ | 6+ | 7+ | 8+ | 9+ | 10+ | 12+ | 15+ | 20+ |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| GEM_TEAL | 0.1× | 0.14× | 0.19× | 0.28× | 0.43× | 0.71× | 1.42× | 3.8× | 9.5× |
| GEM_ROSE | 0.1× | 0.14× | 0.19× | 0.28× | 0.43× | 0.71× | 1.42× | 3.8× | 9.5× |
| GEM_AZURE | 0.14× | 0.19× | 0.28× | 0.43× | 0.57× | 0.95× | 1.9× | 4.75× | 11.88× |
| GEM_AMBER | 0.14× | 0.19× | 0.28× | 0.43× | 0.57× | 0.95× | 1.9× | 4.75× | 11.88× |
| CHALICE | 0.24× | 0.33× | 0.48× | 0.76× | 1.14× | 1.9× | 3.8× | 9.5× | 23.75× |
| ASTROLABE | 0.38× | 0.48× | 0.71× | 1.14× | 1.71× | 2.85× | 5.7× | 14.25× | 38× |
| STARCROWN | 0.48× | 0.71× | 0.95× | 1.42× | 2.38× | 3.8× | 9.5× | 23.75× | 95× |

## Verification

* Unit tests (`tests/unit/slots`) cover payline/ways/cluster evaluation, wild rules, gravity,
  cascade ladder (incl. persistence), scatter pays/triggers/retriggers, relic tiers,
  modifiers, expanding wilds, Supernova, max-win cap, integer wins, RNG parity between the
  browser (`jsHmac`) and server (`node:crypto`) HMAC, and golden vectors that lock the draw
  order.
* Integration tests (`tests/integration/slots.test.ts`) re-derive stored live spins from the
  revealed seed with `verifySlotSpin` and compare them byte-for-byte.
