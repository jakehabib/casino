import type { ReactNode } from 'react';

function Code({ children }: { children: string }) {
  return (
    <pre className="mt-2.5 overflow-x-auto whitespace-pre-wrap break-words rounded-lg border border-line bg-bg-raised px-3.5 py-3 font-mono text-[12px] leading-relaxed text-fg-muted">
      <code>{children.trim()}</code>
    </pre>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <div className="relative pl-10">
      <span className="tabular absolute left-0 top-0 flex h-7 w-7 items-center justify-center rounded-full border border-line-strong bg-surface-2 text-xs font-semibold text-fg-muted">{n}</span>
      <h3 className="text-[14px] font-semibold text-fg">{title}</h3>
      <div className="mt-1 text-[13px] leading-relaxed text-fg-muted">{children}</div>
    </div>
  );
}

function GameCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="min-w-0 rounded-xl border border-line bg-surface-1 p-4">
      <h4 className="text-[13px] font-semibold text-fg">{title}</h4>
      <div className="mt-1 text-[13px] leading-relaxed text-fg-muted">{children}</div>
    </div>
  );
}

export function FairnessExplainer() {
  return (
    <div className="space-y-6">
      <div className="grid gap-6 rounded-xl border border-line bg-surface-1 p-4 sm:p-6 lg:grid-cols-3">
        <Step n={1} title="We commit">
          Before you play, we generate a secret <em>server seed</em> and show you only its SHA-256 hash. The hash locks the seed in — it can’t be changed later without the hash changing.
        </Step>
        <Step n={2} title="You contribute">
          Your <em>client seed</em> is mixed into every result, and each round uses the next <em>nonce</em> (0, 1, 2…). You can change your client seed whenever you rotate.
        </Step>
        <Step n={3} title="We reveal, you verify">
          Rotating reveals the old server seed. Hash it to confirm it matches the commitment, then re-derive any round with the verifier above — it runs entirely in your browser.
        </Step>
      </div>

      <div className="rounded-xl border border-line bg-surface-1 p-4 sm:p-6">
        <h3 className="text-[14px] font-semibold text-fg">The random stream</h3>
        <p className="mt-1 text-[13px] leading-relaxed text-fg-muted">
          Each round turns (serverSeed, clientSeed, nonce) into a stream of floats. Every 32-byte HMAC block yields eight floats of four bytes each; when a block is used up, the round counter increments.
        </p>
        <Code>{`
block(round) = HMAC_SHA256(key = serverSeed, message = \`\${clientSeed}:\${nonce}:\${round}\`)

float = b0/256 + b1/256² + b2/256³ + b3/256⁴      // 4 bytes → [0, 1)
int(n) = floor(float × n)
`}</Code>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <GameCard title="Roulette">
          One float per spin: <code className="font-mono text-fg">number = floor(float₀ × 37)</code> → 0–36 on a single-zero wheel.
        </GameCard>
        <GameCard title="Blackjack & Baccarat">
          Each shoe is an ordered multi-deck pack (deck by deck, suits ♠♥♦♣, ranks A–K) shuffled once with Fisher–Yates using the nonce reserved when the shoe was created. Rounds deal sequential positions; your round details show which ones.
          <Code>{`
for i = n−1 … 1:
  j = int(i + 1)
  swap(cards[i], cards[j])
`}</Code>
        </GameCard>
        <GameCard title="Crash (Launch)">
          Shared by everyone in the round, so it uses a per-round seed: the hash is published before betting opens and the seed is revealed when the round ends.
          <Code>{`
h = first 52 bits of HMAC_SHA256(roundSeed, salt)
crash = floor(99 × 2^52 / (2^52 − h)) / 100
// ≥ 1.00×, 1% house edge
`}</Code>
        </GameCard>
        <GameCard title="Slots">
          Every cell is a weighted draw from its reel’s published weights, in a fixed documented order (grid, modifiers, then cascade refills). Free spins carry a bonus state between spins, shown in each round’s details so any spin can be replayed exactly.
        </GameCard>
      </div>
    </div>
  );
}
