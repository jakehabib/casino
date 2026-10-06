import { describe, it, expect } from 'vitest';
import { prisma } from '@/server/db';
import { deal, getState, getRoundDetail, getDevShoe } from '@/server/services/baccarat/baccarat-service';
import { setForcedOutcome } from '@/server/services/dev/forced-outcomes';
import { createExclusion } from '@/server/services/responsible-play/exclusions';
import { requestLimitChange } from '@/server/services/responsible-play/settings';
import { verifyWalletIntegrity } from '@/server/services/wallet/wallet-service';
import { verifyBaccaratShoe, resolveBaccarat } from '@/engines/baccarat/verify';
import { createTestUser, balanceOf, rid } from './helpers';

const force = (userId: string, cards: string[]) => setForcedOutcome('baccarat', userId, { cards });

// P9 v B5 (player natural), P7 v B8 (banker natural), 9 v 9 tie
const PLAYER_WINS = ['4S', '2H', '5D', '3C'];
const BANKER_WINS = ['3S', '4H', '4D', '4C'];
const TIE = ['9S', '9H', 'KD', 'KC'];

describe('Baccarat service', () => {
  it('settles a Player win 1:1 and records stats + history', async () => {
    const u = await createTestUser();
    await force(u.id, PLAYER_WINS);
    const r = await deal(u.id, { bets: { PLAYER: 1_000 }, requestId: rid() });
    expect(r.outcome).toBe('PLAYER');
    expect(r.natural).toBe(true);
    expect(r.forced).toBe(true);
    expect(r.bets).toEqual([{ type: 'PLAYER', amount: 1_000, payout: 2_000, outcome: 'WIN' }]);
    expect(r.balance).toBe(101_000);
    expect(await balanceOf(u.id)).toBe(101_000);
    const stats = await prisma.playerStats.findUniqueOrThrow({ where: { userId: u.id } });
    expect(stats.bacHands).toBe(1);
    expect(stats.bacPlayerWins).toBe(1);
    expect(stats.playsBaccarat).toBe(1);
    const hist = await prisma.gameHistory.findMany({ where: { userId: u.id, game: 'BACCARAT' } });
    expect(hist).toHaveLength(1);
    expect(hist[0].net).toBe(1_000n);
    expect((await verifyWalletIntegrity(u.id)).ok).toBe(true);
  });

  it('settles a Banker win with integer commission (floor of winnings)', async () => {
    const u = await createTestUser();
    await force(u.id, BANKER_WINS);
    const r = await deal(u.id, { bets: { BANKER: 150, PLAYER: 100 }, requestId: rid() });
    // Banker 150 → winnings floor(142.5) = 142 → 292. Player 100 lost.
    expect(r.outcome).toBe('BANKER');
    expect(r.bets.find((b) => b.type === 'BANKER')).toMatchObject({ payout: 292, outcome: 'WIN' });
    expect(r.bets.find((b) => b.type === 'PLAYER')).toMatchObject({ payout: 0, outcome: 'LOSS' });
    expect(r.totalWagered).toBe(250);
    expect(r.totalPayout).toBe(292);
    expect(await balanceOf(u.id)).toBe(100_000 - 250 + 292);
    const stats = await prisma.playerStats.findUniqueOrThrow({ where: { userId: u.id } });
    expect(stats.bacBankerWins).toBe(1);
  });

  it('pays Tie 8:1 and pushes Player/Banker bets on a tie', async () => {
    const u = await createTestUser();
    await force(u.id, TIE);
    const r = await deal(u.id, { bets: { PLAYER: 1_000, BANKER: 2_000, TIE: 500 }, requestId: rid() });
    expect(r.outcome).toBe('TIE');
    expect(r.bets).toEqual([
      { type: 'PLAYER', amount: 1_000, payout: 1_000, outcome: 'PUSH' },
      { type: 'BANKER', amount: 2_000, payout: 2_000, outcome: 'PUSH' },
      { type: 'TIE', amount: 500, payout: 4_500, outcome: 'WIN' },
    ]);
    expect(await balanceOf(u.id)).toBe(100_000 - 3_500 + 7_500);
    const stats = await prisma.playerStats.findUniqueOrThrow({ where: { userId: u.id } });
    expect(stats.bacTies).toBe(1);
  });

  it('pure push returns the stake with exactly one BET and one WIN ledger entry', async () => {
    const u = await createTestUser();
    await force(u.id, TIE);
    const r = await deal(u.id, { bets: { BANKER: 700 }, requestId: rid() });
    expect(r.net).toBe(0);
    expect(await balanceOf(u.id)).toBe(100_000);
    const txs = await prisma.walletTransaction.findMany({ where: { userId: u.id, referenceId: r.id } });
    expect(txs.map((t) => [t.type, Number(t.amount), t.idempotencyKey]).sort()).toEqual([
      ['BET', -700, `bac:${r.id}:bet`],
      ['WIN', 700, `bac:${r.id}:settle`],
    ]);
  });

  it('a losing round writes no WIN entry', async () => {
    const u = await createTestUser();
    await force(u.id, PLAYER_WINS);
    const r = await deal(u.id, { bets: { TIE: 100 }, requestId: rid() });
    expect(r.totalPayout).toBe(0);
    const txs = await prisma.walletTransaction.findMany({ where: { userId: u.id, referenceId: r.id } });
    expect(txs).toHaveLength(1);
    expect(await balanceOf(u.id)).toBe(99_900);
  });

  it('third-card rounds from forced cards follow the tableau', async () => {
    const u = await createTestUser();
    // P: K+Q = 0 → draws 6. B: 3+3 = 6, P3 = 6 → banker draws 2 → 8.
    await force(u.id, ['KS', '3H', 'QD', '3C', '6S', '2D']);
    const r = await deal(u.id, { bets: { PLAYER: 100 }, requestId: rid() });
    expect(r.playerCards).toEqual(['KS', 'QD', '6S']);
    expect(r.bankerCards).toEqual(['3H', '3C', '2D']);
    expect(r.deal.map((d) => d.step)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(r.bankerTotal).toBe(8);
    expect(r.outcome).toBe('BANKER');
  });

  it('duplicate requestId: no double charge or payout, same result', async () => {
    const u = await createTestUser();
    await force(u.id, PLAYER_WINS);
    const id = rid();
    const a = await deal(u.id, { bets: { PLAYER: 1_000 }, requestId: id });
    const b = await deal(u.id, { bets: { PLAYER: 1_000 }, requestId: id });
    // Even with different bets in the replay body, the stored game wins.
    const c = await deal(u.id, { bets: { BANKER: 5_000 }, requestId: id });
    expect(b.id).toBe(a.id);
    expect(c.id).toBe(a.id);
    expect(c.playerCards).toEqual(a.playerCards);
    expect(await balanceOf(u.id)).toBe(101_000);
    expect(await prisma.baccaratGame.count({ where: { userId: u.id } })).toBe(1);
    expect(await prisma.walletTransaction.count({ where: { userId: u.id, referenceType: 'BACCARAT_GAME' } })).toBe(2);
  });

  it('concurrent duplicate requests settle once', async () => {
    const u = await createTestUser();
    const id = rid();
    const results = await Promise.all(Array.from({ length: 5 }, () => deal(u.id, { bets: { BANKER: 1_000 }, requestId: id })));
    expect(new Set(results.map((r) => r.id)).size).toBe(1);
    expect(await prisma.baccaratGame.count({ where: { userId: u.id } })).toBe(1);
    const expected = 100_000 - 1_000 + results[0].totalPayout;
    expect(await balanceOf(u.id)).toBe(expected);
    expect((await verifyWalletIntegrity(u.id)).ok).toBe(true);
  });

  it('enforces per-bet table limits', async () => {
    const u = await createTestUser();
    await expect(deal(u.id, { bets: { PLAYER: 99 }, requestId: rid() })).rejects.toMatchObject({ code: 'BET_TOO_LOW' });
    await expect(deal(u.id, { bets: { BANKER: 250_001 }, requestId: rid() })).rejects.toMatchObject({ code: 'BET_TOO_HIGH' });
    await expect(deal(u.id, { bets: {}, requestId: rid() })).rejects.toMatchObject({ code: 'BET_TOO_LOW' });
    // Each bet within max is accepted even though the total exceeds a single max.
    const rich = await createTestUser({ balance: 1_000_000 });
    const r = await deal(rich.id, { bets: { PLAYER: 250_000, BANKER: 250_000 }, requestId: rid() });
    expect(r.totalWagered).toBe(500_000);
    expect(await balanceOf(u.id)).toBe(100_000);
  });

  it('checks balance and daily limits against the TOTAL stake', async () => {
    const u = await createTestUser({ balance: 1_500 });
    await expect(deal(u.id, { bets: { PLAYER: 1_000, BANKER: 1_000 }, requestId: rid() })).rejects.toMatchObject({ code: 'INSUFFICIENT_BALANCE' });
    expect(await balanceOf(u.id)).toBe(1_500);

    const v = await createTestUser();
    await requestLimitChange(v.id, 'DAILY_WAGER', 3_000n);
    await expect(deal(v.id, { bets: { PLAYER: 2_000, TIE: 2_000 }, requestId: rid() })).rejects.toMatchObject({ code: 'DAILY_WAGER_LIMIT' });
    await deal(v.id, { bets: { PLAYER: 2_000, TIE: 1_000 }, requestId: rid() });
    await expect(deal(v.id, { bets: { PLAYER: 100 }, requestId: rid() })).rejects.toMatchObject({ code: 'DAILY_WAGER_LIMIT' });
  });

  it('rejects self-excluded players without charging', async () => {
    const u = await createTestUser();
    await createExclusion(u.id, 'EXCLUSION_1M');
    await expect(deal(u.id, { bets: { PLAYER: 1_000 }, requestId: rid() })).rejects.toMatchObject({ code: 'SELF_EXCLUDED' });
    expect(await balanceOf(u.id)).toBe(100_000);
    expect(await prisma.baccaratGame.count({ where: { userId: u.id } })).toBe(0);
  });

  it('persists the shoe between games and the cards are verifiable', async () => {
    const u = await createTestUser();
    const a = await deal(u.id, { bets: { PLAYER: 100 }, requestId: rid() });
    const b = await deal(u.id, { bets: { BANKER: 100 }, requestId: rid() });
    const games = await prisma.baccaratGame.findMany({ where: { userId: u.id }, orderBy: { createdAt: 'asc' } });
    expect(games[0].shoeId).toBe(games[1].shoeId);
    expect(games.map((g) => g.shoeRound)).toEqual([1, 2]);
    const shoe = await prisma.cardShoe.findUniqueOrThrow({ where: { id: games[0].shoeId } });
    expect(shoe.roundsDealt).toBe(2);
    expect(shoe.position).toBe(a.deal.length + b.deal.length);
    expect(b.shoe).toMatchObject({ shoeNumber: 1, cardsDealt: shoe.position, cardsRemaining: 416 - shoe.position, roundsDealt: 2 });

    // Verify round B from the seed (reveal by reading the secret directly in the test).
    const seed = await prisma.serverSeed.findUniqueOrThrow({ where: { id: shoe.serverSeedId } });
    const detail = await getRoundDetail(u.id, b.id);
    expect(detail.fairness?.revealed).toBe(false);
    expect(detail.fairness?.serverSeed).toBeNull();
    const [from, to] = detail.fairness!.extra!.positions as [number, number];
    const cards = verifyBaccaratShoe(seed.seed, seed.clientSeed, shoe.nonce, 8);
    const replay = resolveBaccarat(cards.slice(from, to));
    expect(replay.playerCards).toEqual(b.playerCards);
    expect(replay.bankerCards).toEqual(b.bankerCards);
    expect(replay.outcome).toBe(b.outcome);

    // Bead plate for the current shoe.
    const st = await getState(u.id);
    expect(st.beadPlate).toHaveLength(2);
    expect(st.beadPlate[1]).toEqual({ outcome: b.outcome, playerTotal: b.playerTotal, bankerTotal: b.bankerTotal, natural: b.natural });
    expect(st.lastGame?.id).toBe(b.id);
    expect(JSON.stringify(st)).not.toContain(seed.seed);

    // Another user cannot read the round.
    const other = await createTestUser();
    await expect(getRoundDetail(other.id, b.id)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('reshuffles into a new shoe only after the cut card is reached', async () => {
    const u = await createTestUser();
    await deal(u.id, { bets: { PLAYER: 100 }, requestId: rid() });
    const first = await prisma.cardShoe.findFirstOrThrow({ where: { userId: u.id, game: 'BACCARAT', status: 'ACTIVE' } });
    // Advance to just before the cut card: the next round still uses this shoe (and may cross it).
    await prisma.cardShoe.update({ where: { id: first.id }, data: { position: first.cutCard - 1 } });
    const crossing = await deal(u.id, { bets: { PLAYER: 100 }, requestId: rid() });
    expect(crossing.shoe?.shoeNumber).toBe(1);
    expect(crossing.shoe?.cutCardReached).toBe(true);
    expect((await getState(u.id)).shoe?.cutCardReached).toBe(true);
    const sameShoe = await prisma.cardShoe.findUniqueOrThrow({ where: { id: first.id } });
    expect(sameShoe.status).toBe('ACTIVE');

    const next = await deal(u.id, { bets: { PLAYER: 100 }, requestId: rid() });
    const retired = await prisma.cardShoe.findUniqueOrThrow({ where: { id: first.id } });
    expect(retired.status).toBe('RETIRED');
    const fresh = await prisma.cardShoe.findFirstOrThrow({ where: { userId: u.id, game: 'BACCARAT', status: 'ACTIVE' } });
    expect(fresh.id).not.toBe(first.id);
    expect(fresh.nonce).not.toBe(first.nonce);
    expect(next.shoeRound).toBe(1);
    expect(next.shoe).toMatchObject({ shoeNumber: 2, roundsDealt: 1, cutCardReached: false });
    // Bead plate resets on the new shoe.
    expect((await getState(u.id)).beadPlate).toHaveLength(1);
  });

  it('dev shoe endpoint exposes the next cards (dev tools only)', async () => {
    const u = await createTestUser();
    await deal(u.id, { bets: { PLAYER: 100 }, requestId: rid() });
    const d = await getDevShoe(u.id);
    expect(d.shoe?.nextCards).toHaveLength(12);
    await force(u.id, d.shoe!.nextCards);
    // Forced cards equal to the real next cards produce the same result as the shoe would.
    const expected = resolveBaccarat(d.shoe!.nextCards);
    const r = await deal(u.id, { bets: { PLAYER: 100 }, requestId: rid() });
    expect(r.playerCards).toEqual(expected.playerCards);
  });
});
