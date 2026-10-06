import { PayTable, RulesSection } from '@/components/games/shared/game-shell';
import type { BaccaratConfigDto } from '@/server/services/baccarat/types';

export function BaccaratRules({ cfg }: { cfg?: BaccaratConfigDto }) {
  const bps = cfg?.bankerCommissionBps ?? 500;
  const tie = cfg?.tiePayout ?? 8;
  const decks = cfg?.decks ?? 8;
  return (
    <>
      <RulesSection title="The game">
        <p>
          Punto Banco dealt from a {decks}-deck shoe. Bet on the hand you think will finish closer to 9 — <b className="text-fg">Player</b> or{' '}
          <b className="text-fg">Banker</b> — or on a <b className="text-fg">Tie</b>. You can back any combination in one deal. Every card is drawn by fixed rules; there are no decisions to make.
        </p>
        <p>Aces count 1, 2–9 count face value, tens and pictures count 0. Only the last digit of a total counts (7 + 8 = 5).</p>
      </RulesSection>
      <RulesSection title="Payouts">
        <PayTable
          rows={[
            ['Player', '1 : 1'],
            ['Banker', `1 : 1 less ${bps / 100}% commission`],
            ['Tie', `${tie} : 1`],
            ['Player / Banker on a tie', 'Push (stake returned)'],
          ]}
        />
        <p className="text-xs">
          Banker commission is taken from the winnings and rounded down to a whole Credit: a 150 bet returns 150 + 142 = 292.
        </p>
      </RulesSection>
      <RulesSection title="Drawing rules">
        <p>Cards are dealt Player, Banker, Player, Banker. If either hand totals 8 or 9 (a natural), both stand.</p>
        <p>Otherwise the Player draws a third card on 0–5 and stands on 6–7. If the Player stands, the Banker draws on 0–5 and stands on 6–7.</p>
        <p>If the Player drew, the Banker acts on the Player’s third card:</p>
        <PayTable
          rows={[
            ['Banker 0–2', 'Always draws'],
            ['Banker 3', 'Draws unless Player’s third card is 8'],
            ['Banker 4', 'Draws on Player’s third card 2–7'],
            ['Banker 5', 'Draws on Player’s third card 4–7'],
            ['Banker 6', 'Draws on Player’s third card 6–7'],
            ['Banker 7', 'Stands'],
          ]}
        />
      </RulesSection>
      <RulesSection title="Shoe & fairness">
        <p>
          Your shoe is shuffled once from your provably-fair seed pair and dealt in order. The cut card sits at {Math.round((cfg?.penetration ?? 0.8) * 100)}% of the shoe; when it comes out, the hand finishes and the next deal starts a freshly shuffled shoe. The bead plate tracks the current shoe.
        </p>
        <p>Limits apply to each bet: {(cfg?.minBet ?? 100).toLocaleString('en-US')} – {(cfg?.maxBet ?? 250_000).toLocaleString('en-US')} Credits. Keyboard: Space deals (or rebets), Backspace undoes the last chip.</p>
      </RulesSection>
    </>
  );
}
