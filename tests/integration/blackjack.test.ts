import { describe, it, expect } from 'vitest';
import { prisma } from '@/server/db';
import { setForcedOutcome } from '@/server/services/dev/forced-outcomes';
import { act, deal, getActive, getRoundData } from '@/server/services/blackjack/blackjack-service';
import { createExclusion } from '@/server/services/responsible-play/exclusions';
import { verifyWalletIntegrity } from '@/server/services/wallet/wallet-service';
import { verifyBlackjackShoe } from '@/engines/blackjack/verify';
import { createTestUser, balanceOf, rid } from './helpers';

const force = (userId: string, cards: string[]) => setForcedOutcome('blackjack', userId, { cards });

async function ledger(userId: string) {
  return prisma.walletTransaction.findMany({ where: { userId, referenceType: 'BLACKJACK_GAME' }, orderBy: { createdAt: 'asc' } });
}

describe('Blackjack service', () => {
  it('deal debits the bet and GET active hides the hole card', async () => {
    const u = await createTestUser();
    await force(u.id, ['9S', '5D', '7H', 'KC']);
    const r = await deal(u.id, { bet: 1_000, requestId: rid() });
    expect(r.balance).toBe(99_000);
    expect(await balanceOf(u.id)).toBe(99_000);
    expect(r.game.status).toBe('PLAYER_TURN');
    expect(r.game.dealer.cards[1]).toEqual({ c: null, i: 3 });
    expect(r.game.legal).toEqual(['HIT', 'STAND', 'DOUBLE']);

    const active = await getActive(u.id);
    expect(active.game?.id).toBe(r.game.id);
    expect(active.game?.dealer.cards.map((c) => c.c)).toEqual(['5D', null]);
    expect(JSON.stringify(active)).not.toContain('KC');
    expect(active.config.minBet).toBeGreaterThan(0);
    expect(active.shoe.remaining).toBe(active.shoe.total - active.shoe.dealt);
  });

  it('a duplicate deal requestId returns the same game without charging twice', async () => {
    const u = await createTestUser();
    const requestId = rid();
    const a = await deal(u.id, { bet: 2_000, requestId });
    const b = await deal(u.id, { bet: 2_000, requestId });
    expect(b.game.id).toBe(a.game.id);
    expect(b.replayed).toBe(true);
    expect(await prisma.blackjackGame.count({ where: { userId: u.id } })).toBe(1);
    const bets = (await ledger(u.id)).filter((t) => t.type === 'BET');
    expect(bets).toHaveLength(1);
  });

  it('cannot deal while a hand is open', async () => {
    const u = await createTestUser();
    await force(u.id, ['9S', '5D', '7H', 'KC']);
    await deal(u.id, { bet: 1_000, requestId: rid() });
    await expect(deal(u.id, { bet: 1_000, requestId: rid() })).rejects.toMatchObject({ code: 'ROUND_IN_PROGRESS' });
    expect(await balanceOf(u.id)).toBe(99_000);
  });

  it('duplicate action requestId applies once (sequential and concurrent)', async () => {
    const u = await createTestUser();
    await force(u.id, ['2S', '5D', '3H', 'KC', '4D', '2C', '9H']);
    const g = await deal(u.id, { bet: 1_000, requestId: rid() });
    const hitId = rid();
    const [h1, h2] = await Promise.all([
      act(u.id, { gameId: g.game.id, action: 'HIT', requestId: hitId }),
      act(u.id, { gameId: g.game.id, action: 'HIT', requestId: hitId }),
    ]);
    expect(h1.game.hands[0].cards.map((c) => c.c)).toEqual(['2S', '3H', '4D']);
    expect(h2.game.hands[0].cards).toHaveLength(3);
    const h3 = await act(u.id, { gameId: g.game.id, action: 'HIT', requestId: hitId });
    expect(h3.replayed).toBe(true);
    expect(h3.game.hands[0].cards).toHaveLength(3);
    expect(await prisma.blackjackAction.count({ where: { gameId: g.game.id, action: 'HIT' } })).toBe(1);
  });

  it('double charges an extra wager, is idempotent, and settles exactly once', async () => {
    const u = await createTestUser();
    // P 6,5 vs D 9 up / 7 hole → double gets T (21); dealer 16 draws T → bust
    await force(u.id, ['6S', '9D', '5H', '7C', 'TH', 'TD']);
    const g = await deal(u.id, { bet: 1_000, requestId: rid() });
    const requestId = rid();
    const r = await act(u.id, { gameId: g.game.id, action: 'DOUBLE', requestId });
    expect(r.game.settled).toBe(true);
    expect(r.game.hands[0]).toMatchObject({ doubled: true, bet: 2_000, outcome: 'WIN', payout: 4_000 });
    expect(r.balance).toBe(100_000 - 2_000 + 4_000);
    const again = await act(u.id, { gameId: g.game.id, action: 'DOUBLE', requestId });
    expect(again.replayed).toBe(true);
    expect(await balanceOf(u.id)).toBe(102_000);
    await expect(act(u.id, { gameId: g.game.id, action: 'HIT', requestId: rid() })).rejects.toMatchObject({ code: 'ACTION_UNAVAILABLE' });

    const rows = await ledger(u.id);
    expect(rows.map((t) => t.idempotencyKey).sort()).toEqual(
      [`bj:${g.game.id}:bet`, `bj:${g.game.id}:double:0`, `bj:${g.game.id}:settle`].sort(),
    );
    const hist = await prisma.gameHistory.findMany({ where: { userId: u.id, game: 'BLACKJACK' } });
    expect(hist).toHaveLength(1);
    expect(Number(hist[0].wager)).toBe(2_000);
    expect(Number(hist[0].payout)).toBe(4_000);
    const stats = await prisma.playerStats.findUniqueOrThrow({ where: { userId: u.id } });
    expect(stats).toMatchObject({ bjHands: 1, bjWins: 1, bjLosses: 0, playsBlackjack: 1 });
    expect((await verifyWalletIntegrity(u.id)).ok).toBe(true);
  });

  it('split charges an extra wager per split and settles each hand', async () => {
    const u = await createTestUser();
    // P 8,8 vs D 6 up / T hole. Split: h0 8+3 → stand(11)… use 8+T=18 stand; h1 8+9=17 stand; dealer 16 + 5 = 21
    await force(u.id, ['8S', '6D', '8H', 'TC', 'TS', '9D', '5C']);
    const g = await deal(u.id, { bet: 1_000, requestId: rid() });
    expect(g.game.legal).toContain('SPLIT');
    const s1 = await act(u.id, { gameId: g.game.id, action: 'SPLIT', requestId: rid() });
    expect(s1.game.hands).toHaveLength(2);
    expect(s1.balance).toBe(98_000);
    await act(u.id, { gameId: g.game.id, action: 'STAND', requestId: rid() });
    const done = await act(u.id, { gameId: g.game.id, action: 'STAND', requestId: rid() });
    expect(done.game.settled).toBe(true);
    expect(done.game.dealer.cards.map((c) => c.c)).toEqual(['6D', 'TC', '5C']);
    expect(done.game.hands.map((h) => h.outcome)).toEqual(['LOSS', 'LOSS']);
    expect(await balanceOf(u.id)).toBe(98_000);
    const keys = (await ledger(u.id)).map((t) => t.idempotencyKey);
    expect(keys).toContain(`bj:${g.game.id}:split:1`);
    const hands = await prisma.blackjackHand.findMany({ where: { gameId: g.game.id }, orderBy: { index: 'asc' } });
    expect(hands.map((h) => [h.outcome, h.fromSplit])).toEqual([
      ['LOSS', true],
      ['LOSS', true],
    ]);
    const stats = await prisma.playerStats.findUniqueOrThrow({ where: { userId: u.id } });
    expect(stats).toMatchObject({ bjHands: 2, bjLosses: 2 });
  });

  it('natural blackjack settles at deal and pays 3:2', async () => {
    const u = await createTestUser();
    await force(u.id, ['AS', '9D', 'KH', '7C']);
    const r = await deal(u.id, { bet: 1_000, requestId: rid() });
    expect(r.game.settled).toBe(true);
    expect(r.game.hands[0]).toMatchObject({ outcome: 'BLACKJACK', payout: 2_500 });
    expect(r.game.dealer.cards.map((c) => c.c)).toEqual(['9D', '7C']);
    expect(r.balance).toBe(101_500);
    const stats = await prisma.playerStats.findUniqueOrThrow({ where: { userId: u.id } });
    expect(stats.bjBlackjacks).toBe(1);
    expect(Number(stats.bjLargestBlackjackWin)).toBe(2_500);
  });

  it('insurance: charged as a wager and pays 2:1 against dealer blackjack', async () => {
    const u = await createTestUser();
    await force(u.id, ['TS', 'AD', '9H', 'KC']);
    const g = await deal(u.id, { bet: 1_000, requestId: rid() });
    expect(g.game.status).toBe('INSURANCE_OFFERED');
    expect(g.game.legal).toEqual(['INSURANCE', 'DECLINE_INSURANCE']);
    expect(g.game.dealer.cards[1].c).toBeNull();
    const r = await act(u.id, { gameId: g.game.id, action: 'INSURANCE', requestId: rid() });
    expect(r.game.settled).toBe(true);
    expect(r.game.insurance).toMatchObject({ taken: true, bet: 500, payout: 1_500 });
    expect(r.game.hands[0].outcome).toBe('LOSS');
    expect(await balanceOf(u.id)).toBe(100_000);
    const keys = (await ledger(u.id)).map((t) => t.idempotencyKey);
    expect(keys).toEqual(expect.arrayContaining([`bj:${g.game.id}:insurance`, `bj:${g.game.id}:insurance:win`]));
  });

  it('declined insurance without dealer blackjack continues the hand', async () => {
    const u = await createTestUser();
    await force(u.id, ['TS', 'AD', '9H', '6C', 'TD']);
    const g = await deal(u.id, { bet: 1_000, requestId: rid() });
    const r = await act(u.id, { gameId: g.game.id, action: 'DECLINE_INSURANCE', requestId: rid() });
    expect(r.game.status).toBe('PLAYER_TURN');
    expect(r.game.dealer.cards[1].c).toBeNull();
    const done = await act(u.id, { gameId: g.game.id, action: 'STAND', requestId: rid() });
    // dealer A6 soft 17 stands (S17) → player 19 wins
    expect(done.game.hands[0].outcome).toBe('WIN');
    expect(await balanceOf(u.id)).toBe(101_000);
  });

  it('self-excluded user cannot deal or double but can finish an open hand', async () => {
    const u = await createTestUser();
    await force(u.id, ['6S', '9D', '5H', '7C', '2D', 'TC']);
    const g = await deal(u.id, { bet: 1_000, requestId: rid() });
    await createExclusion(u.id, 'COOLDOWN_24H');
    await expect(act(u.id, { gameId: g.game.id, action: 'DOUBLE', requestId: rid() })).rejects.toMatchObject({ code: 'COOLDOWN_ACTIVE' });
    const hit = await act(u.id, { gameId: g.game.id, action: 'HIT', requestId: rid() });
    expect(hit.game.hands[0].cards).toHaveLength(3);
    const stand = await act(u.id, { gameId: g.game.id, action: 'STAND', requestId: rid() });
    expect(stand.game.settled).toBe(true);
    await expect(deal(u.id, { bet: 1_000, requestId: rid() })).rejects.toMatchObject({ code: 'COOLDOWN_ACTIVE' });
  });

  it('shoe persists across hands, matches the verifier, and reshuffles at the cut card', async () => {
    const u = await createTestUser();
    const first = await deal(u.id, { bet: 100, requestId: rid() });
    if (!first.game.settled) await act(u.id, { gameId: first.game.id, action: 'STAND', requestId: rid() });
    const shoe1 = await prisma.cardShoe.findFirstOrThrow({ where: { userId: u.id, status: 'ACTIVE' } });
    const consumed = shoe1.position;
    expect(consumed).toBeGreaterThanOrEqual(4);

    // The stored order is exactly the verifier's output.
    const seed = await prisma.serverSeed.findUniqueOrThrow({ where: { id: shoe1.serverSeedId } });
    const verified = verifyBlackjackShoe(seed.seed, seed.clientSeed, shoe1.nonce, shoe1.decks);
    expect(verified).toEqual(shoe1.cards);

    // The round's dealt cards are exactly shoe[from, to).
    const detail = await getRoundData(u.id, first.game.id);
    const [seg] = detail.data.segments;
    expect(seg).toMatchObject({ shoeId: shoe1.id, from: 0, to: consumed });
    expect(detail.data.dealOrder).toEqual(verified.slice(seg.from, seg.to));

    const second = await deal(u.id, { bet: 100, requestId: rid() });
    if (!second.game.settled) await act(u.id, { gameId: second.game.id, action: 'STAND', requestId: rid() });
    const shoe1b = await prisma.cardShoe.findUniqueOrThrow({ where: { id: shoe1.id } });
    expect(shoe1b.status).toBe('ACTIVE');
    expect(shoe1b.position).toBeGreaterThan(consumed);
    expect(shoe1b.roundsDealt).toBe(2);
    const g2 = await prisma.blackjackGame.findUniqueOrThrow({ where: { id: second.game.id } });
    expect(g2.shoeId).toBe(shoe1.id);

    // Reach the cut card → the next deal retires the shoe and opens a fresh one.
    await prisma.cardShoe.update({ where: { id: shoe1.id }, data: { position: shoe1.cutCard } });
    const info = await getActive(u.id);
    expect(info.shoe.reshuffleNext).toBe(true);
    const third = await deal(u.id, { bet: 100, requestId: rid() });
    const g3 = await prisma.blackjackGame.findUniqueOrThrow({ where: { id: third.game.id } });
    expect(g3.shoeId).not.toBe(shoe1.id);
    expect((await prisma.cardShoe.findUniqueOrThrow({ where: { id: shoe1.id } })).status).toBe('RETIRED');
    expect(await prisma.cardShoe.count({ where: { userId: u.id, status: 'ACTIVE' } })).toBe(1);
    expect(third.shoe.number).toBe(2);
  });

  it('rejects bets outside table limits and insufficient balance without side effects', async () => {
    const u = await createTestUser({ balance: 5_000 });
    await expect(deal(u.id, { bet: 50, requestId: rid() })).rejects.toMatchObject({ code: 'BET_TOO_LOW' });
    await expect(deal(u.id, { bet: 6_000, requestId: rid() })).rejects.toMatchObject({ code: 'INSUFFICIENT_BALANCE' });
    expect(await prisma.blackjackGame.count({ where: { userId: u.id } })).toBe(0);
    expect(await prisma.cardShoe.count({ where: { userId: u.id } })).toBe(0);
    expect(await balanceOf(u.id)).toBe(5_000);
  });

  it('only the owner can read a round', async () => {
    const a = await createTestUser();
    const b = await createTestUser();
    await force(a.id, ['AS', '9D', 'KH', '7C']);
    const r = await deal(a.id, { bet: 100, requestId: rid() });
    await expect(getRoundData(b.id, r.game.id)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    const own = await getRoundData(a.id, r.game.id);
    expect(own.forced).toBe(true);
    expect(own.data.hands[0].outcome).toBe('BLACKJACK');
    await expect(act(b.id, { gameId: r.game.id, action: 'HIT', requestId: rid() })).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});
