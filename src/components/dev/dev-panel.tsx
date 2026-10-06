'use client';
import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Wrench,
  Wallet,
  Gift,
  Spade,
  Diamond,
  CircleDot,
  Rocket,
  Gem,
  KeyRound,
  HeartHandshake,
  Copy,
  Eye,
  X,
  Zap,
  Timer,
  RotateCcw,
  FlaskConical,
} from 'lucide-react';
import { api, ApiError, requestId } from '@/lib/api';
import { cn } from '@/lib/cn';
import { formatCredits, timeAgo } from '@/lib/format';
import type { DevStatus } from '@/server/services/admin/dev-tools';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CreditIcon } from '@/components/ui/credit-icon';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState, ErrorState } from '@/components/ui/states';
import { toast } from '@/components/ui/toast';
import { useBalance } from '@/stores/balance-store';

type Game = 'blackjack' | 'baccarat' | 'roulette' | 'crash' | 'slots';

/* ── Presets ────────────────────────────────────────────── */

/** Blackjack deal order: P1, D-up, P2, D-hole, then subsequent draws. */
const BJ_PRESETS: { label: string; cards: string[]; note: string }[] = [
  { label: 'Player blackjack', cards: ['AS', '9D', 'KH', '7C'], note: 'A♠ K♥ vs 9♦' },
  { label: 'Dealer blackjack', cards: ['9S', 'AH', '7D', 'KC'], note: '16 vs A♥ K♣' },
  { label: 'Splittable 8s', cards: ['8S', '6D', '8H', 'TC', '3D', '2C'], note: '8♠ 8♥ vs 6♦' },
  { label: 'Split aces', cards: ['AS', '6D', 'AH', 'TC', '9D', 'KS'], note: 'A♠ A♥ vs 6♦' },
  { label: 'Dealer bust', cards: ['TS', '6D', '8H', 'TC', 'KD'], note: '18 vs 16 → K' },
  { label: 'Soft 17', cards: ['TS', 'AD', '8H', '6C', '5S'], note: '18 vs A♦ 6♣' },
  { label: 'Insurance', cards: ['TS', 'AD', '9H', '7C'], note: '19 vs A♦ up' },
];

/** Baccarat deal order: P1, B1, P2, B2, then any third cards. */
const BAC_PRESETS: { label: string; cards: string[]; note: string }[] = [
  { label: 'Player natural 9', cards: ['4S', '3D', '5H', '2C'], note: 'P 9 · B 5' },
  { label: 'Banker natural 8', cards: ['2S', '5D', '3H', '3C'], note: 'P 5 · B 8' },
  { label: 'Tie', cards: ['TS', '7D', '7H', 'KC'], note: 'P 7 · B 7' },
  { label: 'Banker draws, P3 = 6', cards: ['2S', '4D', '2H', '2C', '6S', 'KD'], note: 'P 4→0 · B 6→6' },
  { label: 'Player draws, banker stands', cards: ['3S', 'TD', '2H', '7C', '4D'], note: 'P 5→9 · B 7' },
];

const RED = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
const SLOTS = [
  { id: 'gilded-vault', name: 'Gilded Vault' },
  { id: 'overcharge', name: 'Overcharge' },
  { id: 'starforged-relics', name: 'Starforged Relics' },
] as const;

/* ── Small pieces ───────────────────────────────────────── */

const SUIT: Record<string, string> = { S: '♠', H: '♥', D: '♦', C: '♣' };
export function MiniCard({ code }: { code: string }) {
  const red = code[1] === 'H' || code[1] === 'D';
  return (
    <span className={cn('tabular inline-flex h-6 min-w-[30px] items-center justify-center rounded-[5px] bg-[#fbfaf7] px-1 text-[12px] font-bold leading-none shadow-1', red ? 'text-[#c62f3d]' : 'text-[#16181d]')}>
      {code[0] === 'T' ? '10' : code[0]}
      {SUIT[code[1]] ?? '?'}
    </span>
  );
}

function Card({ icon, title, children, armed, onDisarm, className }: { icon: ReactNode; title: string; children: ReactNode; armed?: ReactNode; onDisarm?: () => void; className?: string }) {
  return (
    <section className={cn('flex flex-col rounded-xl border border-line bg-surface-1', className)}>
      <header className="flex items-center justify-between gap-2 border-b border-line-soft px-4 py-2.5">
        <h2 className="flex items-center gap-2 text-[13px] font-semibold tracking-tight text-fg">
          <span className="text-fg-subtle">{icon}</span>
          {title}
        </h2>
        {armed ? (
          <span className="inline-flex h-6 items-center gap-1.5 rounded-md border border-warn/30 bg-warn/10 pl-2 pr-1 text-[11px] font-semibold text-warn">
            <Zap size={11} /> Armed: {armed}
            {onDisarm ? (
              <button type="button" onClick={onDisarm} aria-label="Clear forced outcome" className="rounded p-0.5 hover:bg-warn/20">
                <X size={11} />
              </button>
            ) : null}
          </span>
        ) : null}
      </header>
      <div className="flex-1 space-y-3 p-4">{children}</div>
    </section>
  );
}

function Chip({ children, onClick, active, title, disabled }: { children: ReactNode; onClick: () => void; active?: boolean; title?: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      disabled={disabled}
      className={cn(
        'inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-[12.5px] font-medium transition-colors disabled:opacity-40',
        active ? 'border-accent/60 bg-accent-soft text-fg' : 'border-line bg-surface-2 text-fg-muted hover:border-line-strong hover:text-fg',
      )}
    >
      {children}
    </button>
  );
}

function Label({ children }: { children: ReactNode }) {
  return <div className="text-2xs font-semibold uppercase tracking-[0.12em] text-fg-subtle">{children}</div>;
}

function CopyRow({ label, value, secret }: { label: string; value: string | number; secret?: boolean }) {
  const [shown, setShown] = useState(!secret);
  const text = String(value);
  return (
    <div className="min-w-0">
      <div className="mb-1 flex items-center justify-between">
        <Label>{label}</Label>
        <div className="flex items-center gap-1">
          {secret ? (
            <button type="button" onClick={() => setShown((s) => !s)} className="rounded p-1 text-fg-subtle hover:bg-surface-3 hover:text-fg" aria-label={shown ? 'Hide' : 'Reveal'}>
              <Eye size={12} />
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => {
              void navigator.clipboard?.writeText(text);
              toast.info(`${label} copied`);
            }}
            className="rounded p-1 text-fg-subtle hover:bg-surface-3 hover:text-fg"
            aria-label={`Copy ${label}`}
          >
            <Copy size={12} />
          </button>
        </div>
      </div>
      <div className={cn('break-all rounded-md border border-line bg-bg-raised px-2.5 py-1.5 font-mono text-[11.5px] leading-relaxed', secret && !shown ? 'select-none text-fg-faint blur-[3px]' : 'text-fg-muted')}>
        {text}
      </div>
    </div>
  );
}

function describeForced(game: Game, v: unknown): string | null {
  if (!v) return null;
  const o = v as Record<string, unknown>;
  switch (game) {
    case 'blackjack':
    case 'baccarat':
      return `${(o.cards as string[]).length} cards`;
    case 'roulette':
      return String(o.number);
    case 'crash':
      return `${((o.crashPointX100 as number) / 100).toFixed(2)}×`;
    case 'slots':
      return `${String(o.trigger).replace('_', ' ').toLowerCase()}`;
  }
}

/* ── Shoe inspector (endpoints owned by the table-game services) ── */

interface ShoeInfo {
  position?: number;
  cutCard?: number;
  remaining?: number;
  decks?: number;
  roundsDealt?: number;
  next?: string[];
  nextCards?: string[];
  [k: string]: unknown;
}

function ShoeInspector({ game }: { game: 'blackjack' | 'baccarat' }) {
  const [open, setOpen] = useState(false);
  const q = useQuery({
    queryKey: ['dev', 'shoe', game],
    queryFn: () => api.get<ShoeInfo | { shoe: ShoeInfo | null }>(`/api/games/${game}/dev/shoe`),
    enabled: open,
    retry: false,
  });
  const raw = q.data as (ShoeInfo & { shoe?: ShoeInfo | null }) | undefined;
  const shoe: ShoeInfo | null | undefined = raw && 'shoe' in raw ? raw.shoe : raw;
  const next = shoe?.next ?? shoe?.nextCards ?? [];
  return (
    <div className="rounded-lg border border-line-soft bg-surface-2/40 p-3">
      <div className="flex items-center justify-between">
        <Label>Active shoe</Label>
        <Button size="xs" variant="ghost" onClick={() => (open ? q.refetch() : setOpen(true))} loading={q.isFetching} sound={false}>
          {open ? 'Refresh' : 'Inspect'}
        </Button>
      </div>
      {!open ? null : q.isError ? (
        <p className="mt-2 text-xs text-fg-subtle">
          {q.error instanceof ApiError && q.error.status === 404 ? 'No shoe endpoint or no active shoe yet — play a hand first.' : 'Could not load the shoe.'}
        </p>
      ) : shoe === null ? (
        <p className="mt-2 text-xs text-fg-subtle">No active shoe yet — one is built on your first hand.</p>
      ) : shoe ? (
        <div className="mt-2 space-y-2.5">
          <div className="grid grid-cols-3 gap-2 text-xs">
            {[
              ['Position', shoe.position],
              ['Cut card', shoe.cutCard],
              ['Remaining', shoe.remaining],
            ].map(([k, v]) => (
              <div key={k as string} className="rounded-md bg-bg-raised px-2 py-1.5">
                <div className="text-fg-subtle">{k as string}</div>
                <div className="tabular font-semibold text-fg">{v === undefined ? '—' : String(v)}</div>
              </div>
            ))}
          </div>
          {next.length ? (
            <div>
              <div className="mb-1.5 text-[11px] text-fg-subtle">Next {next.length} cards</div>
              <div className="flex flex-wrap gap-1">
                {next.map((c, i) => (
                  <MiniCard key={i} code={c} />
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/* ── Panel ──────────────────────────────────────────────── */

export function DevPanel() {
  const qc = useQueryClient();
  const status = useQuery({
    queryKey: ['dev', 'status'],
    queryFn: () => api.get<DevStatus>('/api/dev/status'),
    retry: (n, e) => !(e instanceof ApiError && e.status === 404) && n < 2,
  });
  const [busy, setBusy] = useState<string | null>(null);
  const [grant, setGrant] = useState('');
  const [bjCards, setBjCards] = useState('');
  const [bacCards, setBacCards] = useState('');
  const [crashX, setCrashX] = useState('');
  const [slotId, setSlotId] = useState<string>('gilded-vault');

  const run = async (key: string, fn: () => Promise<unknown>, success?: string) => {
    setBusy(key);
    try {
      const res = (await fn()) as { balance?: number } | undefined;
      if (res && typeof res.balance === 'number') useBalance.getState().set(res.balance);
      if (success) toast.success(success);
      await qc.invalidateQueries({ queryKey: ['dev', 'status'] });
      void qc.invalidateQueries({ queryKey: ['me'] });
    } catch (e) {
      toast.error(e instanceof ApiError ? e.title : 'Something went wrong', e instanceof ApiError ? e.message : undefined);
    } finally {
      setBusy(null);
    }
  };
  const force = (game: Game, value: unknown, label?: string) =>
    run(`force-${game}`, () => api.post('/api/dev/force', { game, value }), value === null ? 'Forced outcome cleared' : `Next ${game} round forced${label ? `: ${label}` : ''}`);
  const parseCards = (s: string) =>
    s
      .toUpperCase()
      .replace(/10/g, 'T')
      .split(/[\s,]+/)
      .filter(Boolean);

  if (status.isError) {
    const disabled = status.error instanceof ApiError && status.error.status === 404;
    return (
      <div className="mx-auto max-w-lg px-4 pt-16">
        <div className="rounded-2xl border border-line bg-surface-1" data-testid="dev-disabled">
          {disabled ? (
            <EmptyState
              icon={<Wrench size={20} />}
              title="Dev tools disabled"
              body="The development panel is only available in local development with ENABLE_DEV_TOOLS=true, and requires a signed-in account. It is always off in production."
              action={
                <Link href="/">
                  <Button variant="secondary" size="sm">
                    Back to lobby
                  </Button>
                </Link>
              }
            />
          ) : (
            <ErrorState onRetry={() => status.refetch()} />
          )}
        </div>
      </div>
    );
  }

  const s = status.data;
  return (
    <div className="@container mx-auto max-w-[1400px] px-4 pb-12 pt-5 sm:px-6">
      <div className="mb-5 flex flex-col gap-3 rounded-xl border border-warn/30 bg-[repeating-linear-gradient(-45deg,#f2b84b0d_0_10px,transparent_10px_20px)] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-warn/15 text-warn">
            <FlaskConical size={18} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-[15px] font-semibold tracking-tight">Dev panel</h1>
              <span className="rounded bg-warn px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em] text-[#2a1d05]">Development only</span>
            </div>
            <p className="mt-0.5 text-xs text-fg-muted">Acts on your own account. Forced rounds are flagged and are not fairness-verifiable. Hard-disabled in production.</p>
          </div>
        </div>
        {s ? (
          <div className="flex items-center gap-2 rounded-lg border border-line bg-surface-1 px-3 py-1.5">
            <CreditIcon size={16} />
            <span className="tabular text-sm font-semibold">{formatCredits(s.balance)}</span>
          </div>
        ) : null}
      </div>

      {!s ? (
        <div className="grid gap-4 @2xl:grid-cols-2 @5xl:grid-cols-3">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-56 rounded-xl" />
          ))}
        </div>
      ) : (
        <div className="grid gap-4 @2xl:grid-cols-2 @5xl:grid-cols-3">
          {/* Wallet */}
          <Card icon={<Wallet size={14} />} title="Wallet">
            <div className="flex flex-wrap gap-1.5">
              {[10_000, 100_000, 1_000_000, 10_000_000].map((v) => (
                <Chip key={v} disabled={!!busy} onClick={() => run('grant', () => api.post('/api/dev/wallet', { op: 'grant', amount: v, requestId: requestId() }), `Granted ${formatCredits(v)} Credits`)}>
                  + {formatCredits(v, { compact: true })}
                </Chip>
              ))}
            </div>
            <div className="flex gap-2">
              <Input
                leading={<CreditIcon size={14} />}
                inputMode="numeric"
                placeholder="Custom amount"
                value={grant}
                onChange={(e) => setGrant(e.target.value.replace(/[^\d]/g, ''))}
                className="h-9 flex-1"
                aria-label="Grant amount"
              />
              <Button
                size="sm"
                className="h-9"
                disabled={!Number(grant)}
                loading={busy === 'grant-custom'}
                onClick={() => run('grant-custom', () => api.post('/api/dev/wallet', { op: 'grant', amount: Number(grant), requestId: requestId() }), 'Credits granted').then(() => setGrant(''))}
              >
                Grant
              </Button>
            </div>
            <Button
              size="sm"
              variant="subtle"
              block
              className="text-loss hover:text-loss"
              loading={busy === 'clear'}
              disabled={s.balance === 0}
              onClick={() => run('clear', () => api.post('/api/dev/wallet', { op: 'clear', requestId: requestId() }), 'Balance cleared')}
            >
              Clear balance to 0
            </Button>
            <p className="text-[11px] text-fg-subtle">Ledgered as ADMIN_ADJUSTMENT with metadata {'{ dev: true }'}.</p>
          </Card>

          {/* Rewards */}
          <Card icon={<Gift size={14} />} title="Rewards">
            {s.rewards.length ? (
              <ul className="space-y-1.5 text-xs">
                {s.rewards.map((r, i) => (
                  <li key={i} className="flex justify-between rounded-md bg-surface-2 px-2.5 py-1.5">
                    <span className="text-fg-muted">{r.type === 'DAILY' ? 'Daily credits' : 'Emergency refill'}</span>
                    <span className="text-fg-subtle">{timeAgo(r.createdAt)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-fg-subtle">No daily or refill claims on record — both are claimable.</p>
            )}
            <Button size="sm" variant="secondary" block leftIcon={<RotateCcw size={13} />} loading={busy === 'rewards'} onClick={() => run('rewards', () => api.post('/api/dev/rewards/reset'), 'Daily & refill cooldowns reset')}>
              Reset daily reward & refill
            </Button>
          </Card>

          {/* Seeds */}
          <Card icon={<KeyRound size={14} />} title="Fairness seeds">
            {s.seed ? (
              <>
                <CopyRow label="Active server seed (dev only)" value={s.seed.serverSeed} secret />
                <CopyRow label="Server seed hash" value={s.seed.seedHash} />
                <div className="grid grid-cols-[1fr_auto] gap-3">
                  <CopyRow label="Client seed" value={s.seed.clientSeed} />
                  <div>
                    <div className="mb-1 pt-1">
                      <Label>Nonce</Label>
                    </div>
                    <div className="tabular rounded-md border border-line bg-bg-raised px-2.5 py-1.5 font-mono text-[11.5px] text-fg">{s.seed.nonce}</div>
                  </div>
                </div>
              </>
            ) : (
              <p className="text-xs text-fg-subtle">No active seed yet — one is created on your first round.</p>
            )}
          </Card>

          {/* Blackjack */}
          <Card icon={<Spade size={14} />} title="Blackjack" armed={describeForced('blackjack', s.forced.blackjack)} onDisarm={() => force('blackjack', null)}>
            <div className="flex flex-wrap gap-1.5">
              {BJ_PRESETS.map((p) => (
                <Chip key={p.label} title={`${p.note} · ${p.cards.join(' ')}`} disabled={!!busy} onClick={() => force('blackjack', { cards: p.cards }, p.label)}>
                  {p.label}
                </Chip>
              ))}
            </div>
            <div className="flex gap-2">
              <Input placeholder="AS 9D KH 7C …" value={bjCards} onChange={(e) => setBjCards(e.target.value)} className="h-9 flex-1 font-mono" aria-label="Blackjack card list" />
              <Button size="sm" className="h-9" disabled={!bjCards.trim()} onClick={() => force('blackjack', { cards: parseCards(bjCards) }, 'custom cards')}>
                Force
              </Button>
            </div>
            <p className="text-[11px] text-fg-subtle">Deal order: player 1, dealer up, player 2, dealer hole, then draws.</p>
            <ShoeInspector game="blackjack" />
          </Card>

          {/* Baccarat */}
          <Card icon={<Diamond size={14} />} title="Baccarat" armed={describeForced('baccarat', s.forced.baccarat)} onDisarm={() => force('baccarat', null)}>
            <div className="flex flex-wrap gap-1.5">
              {BAC_PRESETS.map((p) => (
                <Chip key={p.label} title={`${p.note} · ${p.cards.join(' ')}`} disabled={!!busy} onClick={() => force('baccarat', { cards: p.cards }, p.label)}>
                  {p.label}
                </Chip>
              ))}
            </div>
            <div className="flex gap-2">
              <Input placeholder="4S 3D 5H 2C …" value={bacCards} onChange={(e) => setBacCards(e.target.value)} className="h-9 flex-1 font-mono" aria-label="Baccarat card list" />
              <Button size="sm" className="h-9" disabled={!bacCards.trim()} onClick={() => force('baccarat', { cards: parseCards(bacCards) }, 'custom cards')}>
                Force
              </Button>
            </div>
            <p className="text-[11px] text-fg-subtle">Deal order: P1, B1, P2, B2, then third cards (4–6 cards).</p>
            <ShoeInspector game="baccarat" />
          </Card>

          {/* Roulette */}
          <Card icon={<CircleDot size={14} />} title="Roulette" armed={describeForced('roulette', s.forced.roulette)} onDisarm={() => force('roulette', null)}>
            <Label>Next winning number</Label>
            <div className="grid grid-cols-[repeat(13,minmax(0,1fr))] gap-1">
              <button
                type="button"
                onClick={() => force('roulette', { number: 0 }, '0')}
                className={cn('row-span-3 rounded-md bg-roulette-green text-[11px] font-bold text-white transition-[filter] hover:brightness-125', (s.forced.roulette as { number?: number } | null)?.number === 0 && 'ring-2 ring-fg')}
              >
                0
              </button>
              {Array.from({ length: 36 }, (_, i) => {
                // Table layout: rows top→bottom are 3,2,1 offsets.
                const col = Math.floor(i / 3);
                const row = i % 3;
                const nmb = col * 3 + (3 - row);
                return { nmb, i };
              })
                .sort((a, b) => (a.i % 3) - (b.i % 3) || a.i - b.i)
                .map(({ nmb }) => (
                  <button
                    key={nmb}
                    type="button"
                    onClick={() => force('roulette', { number: nmb }, String(nmb))}
                    className={cn(
                      'tabular aspect-square rounded-md text-[10.5px] font-bold text-white transition-[filter] hover:brightness-125',
                      RED.has(nmb) ? 'bg-roulette-red' : 'border border-line-strong bg-roulette-black',
                      (s.forced.roulette as { number?: number } | null)?.number === nmb && 'ring-2 ring-fg',
                    )}
                  >
                    {nmb}
                  </button>
                ))}
            </div>
          </Card>

          {/* Crash */}
          <Card icon={<Rocket size={14} />} title="Crash (global)" armed={describeForced('crash', s.forced.crash)} onDisarm={() => force('crash', null)}>
            <Label>Next crash point · affects everyone</Label>
            <div className="flex flex-wrap gap-1.5">
              {[100, 150, 200, 500, 1000, 10000].map((x) => (
                <Chip key={x} disabled={!!busy} onClick={() => force('crash', { crashPointX100: x }, `${(x / 100).toFixed(2)}×`)}>
                  {(x / 100).toFixed(2)}×
                </Chip>
              ))}
            </div>
            <div className="flex gap-2">
              <Input placeholder="e.g. 3.25" inputMode="decimal" value={crashX} onChange={(e) => setCrashX(e.target.value.replace(/[^\d.]/g, ''))} trailing={<span className="text-xs text-fg-subtle">×</span>} className="h-9 flex-1" aria-label="Crash point" />
              <Button
                size="sm"
                className="h-9"
                disabled={!(Number(crashX) >= 1)}
                onClick={() => force('crash', { crashPointX100: Math.round(Number(crashX) * 100) }, `${Number(crashX).toFixed(2)}×`)}
              >
                Force
              </Button>
            </div>
            <div className="flex items-center justify-between gap-2 rounded-lg border border-line-soft bg-surface-2/40 px-3 py-2">
              <div className="flex items-center gap-2 text-xs text-fg-muted">
                <Timer size={13} className="text-fg-subtle" />
                Countdown {s.crashCountdownMs ? <span className="font-semibold text-warn">{s.crashCountdownMs / 1000}s (override)</span> : <span>from settings</span>}
              </div>
              {s.crashCountdownMs ? (
                <Button size="xs" variant="ghost" loading={busy === 'cd'} onClick={() => run('cd', () => api.post('/api/dev/crash-countdown', { ms: null }), 'Countdown restored')}>
                  Clear
                </Button>
              ) : (
                <Button size="xs" variant="secondary" loading={busy === 'cd'} onClick={() => run('cd', () => api.post('/api/dev/crash-countdown', { ms: 2000 }), 'Countdown set to 2s')}>
                  Speed up · 2s
                </Button>
              )}
            </div>
          </Card>

          {/* Slots */}
          <Card icon={<Gem size={14} />} title="Slots" armed={describeForced('slots', s.forced.slots)} onDisarm={() => force('slots', null)}>
            <Label>Machine</Label>
            <div className="grid grid-cols-3 gap-1.5">
              {SLOTS.map((m) => (
                <Chip key={m.id} active={slotId === m.id} onClick={() => setSlotId(m.id)}>
                  <span className="truncate">{m.name}</span>
                </Chip>
              ))}
            </div>
            <Label>Next spin</Label>
            <div className="grid grid-cols-3 gap-1.5">
              {(['FREE_SPINS', 'BIG_WIN', 'LOSS'] as const).map((t) => (
                <Button key={t} size="sm" variant="secondary" disabled={!!busy} onClick={() => force('slots', { slotId, trigger: t }, `${t.replace('_', ' ').toLowerCase()}`)}>
                  {t === 'FREE_SPINS' ? 'Free spins' : t === 'BIG_WIN' ? 'Big win' : 'Loss'}
                </Button>
              ))}
            </div>
          </Card>

          {/* Responsible play */}
          <Card icon={<HeartHandshake size={14} />} title="Responsible play">
            <div className="grid grid-cols-2 gap-2 text-xs">
              {[
                ['Wager limit', s.responsiblePlay.dailyWagerLimit === null ? 'None' : formatCredits(s.responsiblePlay.dailyWagerLimit)],
                ['Loss limit', s.responsiblePlay.dailyLossLimit === null ? 'None' : formatCredits(s.responsiblePlay.dailyLossLimit)],
                ['Exclusions (all)', String(s.responsiblePlay.exclusions)],
                ['Pending changes', String(s.responsiblePlay.pendingChanges)],
              ].map(([k, v]) => (
                <div key={k} className="rounded-md bg-surface-2 px-2.5 py-1.5">
                  <div className="text-fg-subtle">{k}</div>
                  <div className="tabular font-semibold text-fg">{v}</div>
                </div>
              ))}
            </div>
            <Button
              size="sm"
              variant="subtle"
              block
              className="text-loss hover:text-loss"
              leftIcon={<RotateCcw size={13} />}
              loading={busy === 'rp'}
              onClick={() => run('rp', () => api.post('/api/dev/responsible-play/reset'), 'Responsible-play state reset')}
            >
              Reset RP test state
            </Button>
            <p className="text-[11px] text-fg-subtle">Deletes your breaks/exclusions, limit changes and today’s play totals; clears both limits.</p>
          </Card>
        </div>
      )}
    </div>
  );
}
