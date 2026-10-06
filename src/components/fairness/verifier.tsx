'use client';
import { useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { CheckCircle2, CircleDashed, XCircle } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Tabs } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { sha256, toHex, utf8, hmacSha256 } from '@/engines/fairness/sha256';
import { verifyRoulette } from '@/engines/roulette/verify';
import { colorOf } from '@/engines/roulette/wheel';
import { verifyCrash } from '@/engines/crash/verify';
import { CRASH_SALT } from '@/engines/crash/crash-math';
import { verifyBlackjackShoe } from '@/engines/blackjack/verify';
import { verifyBaccaratShoe, resolveBaccarat } from '@/engines/baccarat/verify';
import { formatMultiplier } from '@/lib/format';
import { ShoeList, MiniCard } from './card-list';
import { SlotVerifierResult } from './slot-result';
import { readVerifyParams, type VerifyGame } from './verify-link';

type Form = {
  serverSeed: string;
  clientSeed: string;
  nonce: string;
  seedHash: string;
  decks: string;
  from: string;
  to: string;
  salt: string;
  slotId: string;
  betLevel: string;
  bonusState: string;
};

const TABS: { value: VerifyGame; label: string }[] = [
  { value: 'roulette', label: 'Roulette' },
  { value: 'crash', label: 'Crash' },
  { value: 'blackjack', label: 'Blackjack' },
  { value: 'baccarat', label: 'Baccarat' },
  { value: 'slots', label: 'Slots' },
];

const DEFAULT_DECKS: Partial<Record<VerifyGame, number>> = { blackjack: 6, baccarat: 8 };

function intOrNull(s: string, min = 0, max = Number.MAX_SAFE_INTEGER): number | null {
  if (!/^\d+$/.test(s.trim())) return null;
  const n = Number(s.trim());
  return Number.isSafeInteger(n) && n >= min && n <= max ? n : null;
}

function HashCheck({ computed, provided, label }: { computed: string | null; provided: string; label: string }) {
  const p = provided.trim().toLowerCase();
  const state = !computed ? 'empty' : !p ? 'none' : computed === p ? 'ok' : 'bad';
  return (
    <div
      className={cn(
        'flex items-start gap-2.5 rounded-lg border px-3 py-2.5 text-[13px]',
        state === 'ok' && 'border-win/30 bg-win-soft',
        state === 'bad' && 'border-loss/30 bg-loss-soft',
        (state === 'none' || state === 'empty') && 'border-line bg-surface-2',
      )}
      data-testid="hash-check"
      data-state={state}
    >
      {state === 'ok' ? <CheckCircle2 size={16} className="mt-px shrink-0 text-win" /> : state === 'bad' ? <XCircle size={16} className="mt-px shrink-0 text-loss" /> : <CircleDashed size={16} className="mt-px shrink-0 text-fg-subtle" />}
      <div className="min-w-0">
        <div className={cn('font-medium', state === 'ok' ? 'text-win' : state === 'bad' ? 'text-loss' : 'text-fg-muted')}>
          {state === 'ok' ? `SHA-256(${label}) matches the committed hash` : state === 'bad' ? `SHA-256(${label}) does not match the hash provided` : state === 'none' ? 'Paste the committed hash to check it' : `Enter the ${label} to check its hash`}
        </div>
        {computed ? <code className="mt-0.5 block truncate font-mono text-[11px] text-fg-subtle">sha256 = {computed}</code> : null}
      </div>
    </div>
  );
}

function TextField({ label, value, onChange, placeholder, mono = true, hint, testId, className }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; mono?: boolean; hint?: string; testId?: string; className?: string }) {
  const id = `vf-${label.replace(/\W+/g, '-').toLowerCase()}`;
  return (
    <div className={cn('min-w-0', className)}>
      <label htmlFor={id} className="mb-1.5 block text-xs font-medium text-fg-subtle">
        {label}
      </label>
      <Input id={id} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} spellCheck={false} autoComplete="off" className={cn('h-10', mono && 'font-mono')} data-testid={testId} />
      {hint ? <p className="mt-1 text-[11px] text-fg-faint">{hint}</p> : null}
    </div>
  );
}

function ResultFrame({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-line bg-surface-2/60 p-4" data-testid="verify-output">
      <div className="mb-3 text-2xs font-semibold uppercase tracking-[0.12em] text-fg-subtle">{title}</div>
      {children}
    </div>
  );
}

function Problem({ children }: { children: React.ReactNode }) {
  return <p className="text-[13px] text-fg-subtle">{children}</p>;
}

function RouletteResult({ f }: { f: Form }) {
  const nonce = intOrNull(f.nonce);
  const out = useMemo(() => {
    if (!f.serverSeed || !f.clientSeed || nonce === null) return null;
    const n = verifyRoulette(f.serverSeed, f.clientSeed, nonce);
    const block = hmacSha256(utf8(f.serverSeed), utf8(`${f.clientSeed}:${nonce}:0`));
    const float = block[0] / 256 + block[1] / 65536 + block[2] / 16777216 + block[3] / 4294967296;
    return { n, hex: toHex(block), float };
  }, [f.serverSeed, f.clientSeed, nonce]);
  if (!out) return <ResultFrame title="Result"><Problem>Enter a server seed, client seed and nonce.</Problem></ResultFrame>;
  const color = colorOf(out.n);
  return (
    <ResultFrame title="Winning number">
      <div className="flex items-center gap-4">
        <div
          className={cn(
            'tabular flex h-16 w-16 items-center justify-center rounded-full text-2xl font-bold text-white shadow-2',
            color === 'red' && 'bg-roulette-red',
            color === 'black' && 'bg-roulette-black ring-1 ring-line-strong',
            color === 'green' && 'bg-roulette-green',
          )}
          data-testid="roulette-number"
        >
          {out.n}
        </div>
        <div className="text-[13px] text-fg-muted">
          <div className="font-medium capitalize text-fg">{color}</div>
          {out.n === 0 ? <div>Zero</div> : <div>{out.n % 2 === 0 ? 'Even' : 'Odd'} · {out.n <= 18 ? 'Low (1–18)' : 'High (19–36)'} · Dozen {Math.ceil(out.n / 12)}</div>}
        </div>
      </div>
      <div className="mt-4 space-y-1 rounded-lg bg-bg-raised p-3 font-mono text-[11px] leading-relaxed text-fg-subtle">
        <div className="truncate">HMAC_SHA256(serverSeed, &quot;{f.clientSeed}:{nonce}:0&quot;) = {out.hex}</div>
        <div>float₀ = {out.float.toFixed(10)} → floor(float₀ × 37) = {out.n}</div>
      </div>
    </ResultFrame>
  );
}

function CrashResult({ f }: { f: Form }) {
  const out = useMemo(() => (f.serverSeed ? verifyCrash(f.serverSeed, f.salt || CRASH_SALT) : null), [f.serverSeed, f.salt]);
  if (!out) return <ResultFrame title="Crash point"><Problem>Enter the round seed (revealed when the round ends).</Problem></ResultFrame>;
  return (
    <ResultFrame title="Crash point">
      <div className="tabular text-4xl font-semibold tracking-tight text-fg" data-testid="crash-point">
        {formatMultiplier(out.crashPointX100)}
      </div>
      <div className="mt-3 rounded-lg bg-bg-raised p-3 font-mono text-[11px] leading-relaxed text-fg-subtle">
        h = first 52 bits of HMAC_SHA256(seed, &quot;{f.salt || CRASH_SALT}&quot;) · X = floor(99 · 2⁵² / (2⁵² − h)) / 100
      </div>
    </ResultFrame>
  );
}

function ShoeResult({ f, game }: { f: Form; game: 'blackjack' | 'baccarat' }) {
  const nonce = intOrNull(f.nonce);
  const decks = f.decks.trim() ? intOrNull(f.decks, 1, 8) : DEFAULT_DECKS[game]!;
  const from = f.from.trim() ? intOrNull(f.from) : null;
  const to = f.to.trim() ? intOrNull(f.to) : null;
  const shoe = useMemo(() => {
    if (!f.serverSeed || !f.clientSeed || nonce === null || decks === null) return null;
    return game === 'blackjack' ? verifyBlackjackShoe(f.serverSeed, f.clientSeed, nonce, decks) : verifyBaccaratShoe(f.serverSeed, f.clientSeed, nonce, decks);
  }, [f.serverSeed, f.clientSeed, nonce, decks, game]);
  const range = shoe && from !== null && to !== null && to > from && to <= shoe.length ? ([from, to] as const) : null;
  const bacc = useMemo(() => {
    if (game !== 'baccarat' || !shoe || !range) return null;
    try {
      return resolveBaccarat(shoe.slice(range[0], range[1]));
    } catch {
      return null;
    }
  }, [game, shoe, range?.[0], range?.[1]]); // eslint-disable-line react-hooks/exhaustive-deps

  if (decks === null) return <ResultFrame title="Shoe"><Problem>Decks must be a whole number from 1 to 8.</Problem></ResultFrame>;
  if (!shoe) return <ResultFrame title="Shoe order"><Problem>Enter a server seed, client seed and the shoe’s nonce.</Problem></ResultFrame>;
  return (
    <ResultFrame title="Shoe order">
      {bacc ? (
        <div className="mb-4 grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-center" data-testid="baccarat-result">
          {(['Player', 'Banker'] as const).map((side) => {
            const cards = side === 'Player' ? bacc.playerCards : bacc.bankerCards;
            const total = side === 'Player' ? bacc.playerTotal : bacc.bankerTotal;
            return (
              <div key={side} className="rounded-lg border border-line bg-bg-raised p-2.5">
                <div className="mb-1.5 flex justify-between text-xs">
                  <span className="font-medium text-fg-muted">{side}</span>
                  <span className="tabular font-semibold text-fg">{total}</span>
                </div>
                <div className="flex gap-1">{cards.map((c, i) => <MiniCard key={i} code={c} />)}</div>
              </div>
            );
          })}
          <div className="rounded-lg bg-surface-3 px-3 py-2 text-center text-[13px] font-semibold text-fg">
            {bacc.outcome === 'TIE' ? 'Tie' : `${bacc.outcome === 'PLAYER' ? 'Player' : 'Banker'} wins`}
            {bacc.natural ? <div className="text-[11px] font-medium text-fg-subtle">Natural</div> : null}
          </div>
        </div>
      ) : null}
      <ShoeList cards={shoe} from={range?.[0]} to={range?.[1]} />
    </ResultFrame>
  );
}

export function Verifier() {
  const sp = useSearchParams();
  const initial = useMemo(() => readVerifyParams(new URLSearchParams(sp?.toString() ?? '')), [sp]);
  const [game, setGame] = useState<VerifyGame>((initial.game as VerifyGame) ?? 'roulette');
  const [f, setF] = useState<Form>({
    serverSeed: initial.serverSeed ?? '',
    clientSeed: initial.clientSeed ?? '',
    nonce: initial.nonce ?? '',
    seedHash: initial.seedHash ?? '',
    decks: initial.decks ?? '',
    from: initial.from ?? '',
    to: initial.to ?? '',
    salt: initial.salt ?? '',
    slotId: initial.slotId ?? '',
    betLevel: initial.betLevel ?? '',
    bonusState: initial.bonusState ?? '',
  });
  const set = (k: keyof Form) => (v: string) => setF((s) => ({ ...s, [k]: v }));
  const computedHash = useMemo(() => (f.serverSeed ? toHex(sha256(utf8(f.serverSeed))) : null), [f.serverSeed]);
  const isCrash = game === 'crash';
  const isShoe = game === 'blackjack' || game === 'baccarat';

  return (
    <div className="min-w-0 rounded-xl border border-line bg-surface-1">
      <div className="border-b border-line-soft p-3 sm:px-5">
        <Tabs items={TABS} value={game} onValueChange={(v) => setGame(v as VerifyGame)} listClassName="w-full sm:w-auto" />
      </div>
      <div className="grid gap-6 p-4 sm:p-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        <div className="min-w-0 space-y-3.5">
          <TextField label={isCrash ? 'Round seed' : 'Server seed (revealed)'} value={f.serverSeed} onChange={set('serverSeed')} placeholder="64 hex characters" testId="vf-server-seed" />
          <TextField label={isCrash ? 'Round seed hash' : 'Server seed hash'} value={f.seedHash} onChange={set('seedHash')} placeholder="Committed SHA-256 (optional)" testId="vf-hash" />
          {isCrash ? (
            <TextField label="Salt" value={f.salt} onChange={set('salt')} placeholder={CRASH_SALT} hint={`Public, fixed salt: ${CRASH_SALT}`} />
          ) : (
            <div className="grid grid-cols-[minmax(0,1fr)_96px] sm:grid-cols-[minmax(0,1fr)_120px] gap-3">
              <TextField label="Client seed" value={f.clientSeed} onChange={set('clientSeed')} testId="vf-client-seed" />
              <TextField label={isShoe ? 'Shoe nonce' : 'Nonce'} value={f.nonce} onChange={set('nonce')} placeholder="0" testId="vf-nonce" />
            </div>
          )}
          {isShoe ? (
            <div className="grid grid-cols-3 gap-3">
              <TextField label="Decks" value={f.decks} onChange={set('decks')} placeholder={String(DEFAULT_DECKS[game])} />
              <TextField label="Round from" value={f.from} onChange={set('from')} placeholder="—" />
              <TextField label="Round to" value={f.to} onChange={set('to')} placeholder="—" />
            </div>
          ) : null}
          {game === 'slots' ? (
            <>
              <div className="grid grid-cols-2 gap-3">
                <TextField label="Slot" value={f.slotId} onChange={set('slotId')} placeholder="gilded-vault" />
                <TextField label="Bet level" value={f.betLevel} onChange={set('betLevel')} placeholder="100" />
              </div>
              <TextField label="Bonus state before spin (JSON)" value={f.bonusState} onChange={set('bonusState')} placeholder="null" hint="Only needed for free spins — copy it from the round’s details." />
            </>
          ) : null}
          <HashCheck computed={computedHash} provided={f.seedHash} label={isCrash ? 'round seed' : 'server seed'} />
          {isShoe ? (
            <p className="text-[11px] leading-relaxed text-fg-faint">
              A shoe is shuffled once from the nonce reserved when it was created; each round then deals sequential positions. “Round from/to” highlights the cards a round used.
            </p>
          ) : null}
        </div>
        <div className="min-w-0">
          {game === 'roulette' ? <RouletteResult f={f} /> : null}
          {game === 'crash' ? <CrashResult f={f} /> : null}
          {game === 'blackjack' ? <ShoeResult f={f} game="blackjack" /> : null}
          {game === 'baccarat' ? <ShoeResult f={f} game="baccarat" /> : null}
          {game === 'slots' ? (
            <ResultFrame title="Spin outcome">
              <SlotVerifierResult slotId={f.slotId} serverSeed={f.serverSeed} clientSeed={f.clientSeed} nonce={intOrNull(f.nonce)} betLevel={f.betLevel} bonusState={f.bonusState} />
            </ResultFrame>
          ) : null}
        </div>
      </div>
    </div>
  );
}
