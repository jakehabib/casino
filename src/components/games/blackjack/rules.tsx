import { PayTable, RulesSection } from '@/components/games/shared/game-shell';
import { formatCredits } from '@/lib/format';
import type { BlackjackTableConfig } from '@/server/services/blackjack/blackjack-service';

export function BlackjackRules({ config }: { config: BlackjackTableConfig | null }) {
  const c = config;
  const bj = c?.blackjackPayout === '6:5' ? '6 to 5' : '3 to 2';
  return (
    <>
      <RulesSection title="Objective">
        <p>Beat the dealer by finishing closer to 21 without going over. Number cards count their value, J/Q/K count 10, and an Ace counts 1 or 11. Soft totals (an Ace counted as 11) are shown as “7 / 17”.</p>
      </RulesSection>
      <RulesSection title="Payouts">
        <PayTable
          rows={[
            ['Blackjack (Ace + ten-value, first two cards)', bj],
            ['Win', '1 to 1'],
            ['Push (tie)', 'Stake returned'],
            ['Insurance (dealer has blackjack)', '2 to 1'],
          ]}
        />
        <p className="text-[12px] text-fg-subtle">Payouts are whole Credits; fractional amounts are rounded down.</p>
      </RulesSection>
      <RulesSection title="Table rules">
        <ul className="list-disc space-y-1 pl-5">
          <li>{c?.decks ?? 6}-deck shoe, reshuffled when the cut card is reached (between rounds only).</li>
          <li>Dealer {c?.dealerHitsSoft17 ? 'hits' : 'stands on'} soft 17 and peeks for blackjack with an Ace or ten-value up-card. A dealer blackjack ends the round immediately; a player blackjack pushes against it.</li>
          <li>Double down on any first two cards{c?.doubleAfterSplit === false ? '' : ', including after a split'}. A doubled hand receives exactly one card.</li>
          {c?.allowSplit !== false ? (
            <li>Split pairs of identical rank (K-K, not K-Q) up to {c?.maxHands ?? 4} hands. Split Aces receive one card each{c?.hitSplitAces ? '' : ' and cannot be hit'}{c?.resplitAces ? '; Aces may be re-split' : ''}. A split Ace + ten counts as 21, not blackjack.</li>
          ) : null}
          {c?.insurance !== false ? <li>Insurance is offered when the dealer shows an Ace. It costs half your bet and pays 2 to 1 if the dealer has blackjack.</li> : null}
          <li>If every hand busts, the dealer reveals the hole card without drawing.</li>
        </ul>
      </RulesSection>
      <RulesSection title="Limits & controls">
        <p>
          Bets from {formatCredits(c?.minBet ?? 100)} to {formatCredits(c?.maxBet ?? 250_000)} Credits. Keyboard: Space deal / rebet, H hit, S stand, D double, P split, Y / N insurance.
        </p>
      </RulesSection>
      <RulesSection title="Fairness">
        <p>
          Your personal shoe is shuffled once from your server seed, client seed and nonce, then dealt in order. Each round records the shoe positions it used, so after rotating your seed you can rebuild the exact shoe on the Fairness page and check every card.
        </p>
      </RulesSection>
    </>
  );
}
