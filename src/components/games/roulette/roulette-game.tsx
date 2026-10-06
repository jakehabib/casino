'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useMutation } from '@tanstack/react-query';
import { Undo2, Trash2, Repeat2, ChevronsUp } from 'lucide-react';
import { GameShell, Stage, RulesSection, PayTable } from '@/components/games/shared/game-shell';
import { useGameErrorHandler } from '@/components/games/shared/use-game-action';
import { ChipSelector } from '@/components/ui/chip-selector';
import { CHIP_DENOMS } from '@/components/ui/casino-chip';
import { Button } from '@/components/ui/button';
import { Kbd, useHotkeys } from '@/components/ui/bet-controls';
import { AnimatedNumber } from '@/components/ui/animated-number';
import { CreditIcon } from '@/components/ui/credit-icon';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/states';
import { Tooltip } from '@/components/ui/tooltip';
import { toast } from '@/components/ui/toast';
import { api, ApiError, requestId } from '@/lib/api';
import { cn } from '@/lib/cn';
import { formatCredits } from '@/lib/format';
import { SPRING } from '@/lib/motion';
import { useBalance, useDisplayBalance } from '@/stores/balance-store';
import { playSound } from '@/audio/audio-manager';
import { getSpot, spotId, PAYOUT_ODDS, type BetSpot, type BetType } from '@/engines/roulette/bets';
import { colorOf } from '@/engines/roulette/wheel';
import type { RouletteSpinResult, RouletteState } from '@/engines/roulette/api-types';
import { RouletteWheel, type RouletteWheelHandle } from './wheel';
import { RouletteBoard, type SettledView } from './board';
import { HistoryStrip, NumberPill, RecentStats } from './history';
import { total, useRouletteState, useRouletteTable, type BetMap } from './use-roulette-table';

const CHIP_KEY = 'nova:roulette:chip';

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.round(e.contentRect.width)));
    ro.observe(el);
    setW(el.getBoundingClientRect().width);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

function toPayload(slip: BetMap) {
  return Object.entries(slip).map(([id, amount]) => {
    const s = getSpot(id)!;
    return { type: s.type, numbers: [...s.numbers], amount };
  });
}

export function RouletteGame() {
  return (
    <GameShell
      gameId="roulette"
      title="European Roulette"
      subtitle="Single zero · Inside & outside bets · Provably fair"
      rules={<Rules />}
      controlsPosition="bottom"
      stage={<RouletteTable />}
      controls={null}
    />
  );
}

/** Everything inside the shell: stage + controls share state, so both live here. */
function RouletteTable() {
  const { data: state, isLoading, isError, refetch } = useRouletteState();
  if (isError) return <ErrorState title="Couldn’t load the table" onRetry={() => void refetch()} />;
  if (isLoading || !state) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-[460px] rounded-xl" />
        <Skeleton className="h-[84px] rounded-xl" />
      </div>
    );
  }
  return <RouletteTableLoaded state={state} />;
}

function RouletteTableLoaded({ state }: { state: RouletteState }) {
  const table = useRouletteTable(state);
  const onError = useGameErrorHandler();
  const wheelRef = useRef<RouletteWheelHandle>(null);
  const wheelBoxRef = useRef<HTMLDivElement>(null);
  const payoutRef = useRef<HTMLDivElement>(null);
  const [stageRef, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<BetSpot | null>(null);
  const [shown, setShown] = useState<number | null>(state.lastRound?.winningNumber ?? null);
  const [highlight, setHighlight] = useState(state.lastRound !== null);
  const [chip, setChipState] = useState<number>(1_000);
  const balance = useDisplayBalance();

  useEffect(() => {
    try {
      const v = Number(localStorage.getItem(CHIP_KEY));
      if ((CHIP_DENOMS as readonly number[]).includes(v)) setChipState(v);
    } catch {
      /* ignore */
    }
  }, []);
  const setChip = useCallback((v: number) => {
    setChipState(v);
    try {
      localStorage.setItem(CHIP_KEY, String(v));
    } catch {
      /* ignore */
    }
  }, []);

  // Refresh restore: the ball rests in the last result's pocket.
  useEffect(() => {
    if (state.lastRound) wheelRef.current?.rest(state.lastRound.winningNumber);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const mutation = useMutation({
    mutationFn: (v: { slip: BetMap; requestId: string }) =>
      api.post<RouletteSpinResult>('/api/games/roulette/spin', { bets: toPayload(v.slip), requestId: v.requestId }),
    // Same requestId on retry → the server replays instead of double-charging.
    retry: (count, err) => count < 2 && err instanceof ApiError && err.status === 0,
    retryDelay: 700,
  });

  const spinning = table.phase === 'spinning';
  const hasDraft = table.draftTotal > 0 && table.phase !== 'result';
  const rebet = !hasDraft && !!table.lastBets;
  const slipForSpin = hasDraft ? table.bets : table.lastBets;
  const stakeShown = spinning ? total(table.bets) : hasDraft ? table.draftTotal : 0;

  const spin = useCallback(async () => {
    if (spinning || mutation.isPending) return;
    const slip = slipForSpin;
    if (!slip || !Object.keys(slip).length) {
      toast.info('Place your bets', 'Choose a chip and tap the layout to bet.');
      return;
    }
    const err = table.checkSlip(slip);
    if (err) {
      onError(new ApiError('BET_TOO_HIGH', err, 400));
      return;
    }
    const rid = requestId();
    const bal = useBalance.getState().balance;
    if (bal !== null) useBalance.getState().hold(bal - total(slip));
    table.onSpinStart(slip);
    setHighlight(false);
    // Bring the wheel into view on small screens.
    const box = wheelBoxRef.current?.getBoundingClientRect();
    if (box && (box.top < 56 || box.bottom > window.innerHeight - 160)) {
      wheelBoxRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    try {
      const r = await mutation.mutateAsync({ slip, requestId: rid });
      useBalance.getState().set(r.balance);
      await wheelRef.current?.spinTo(r.winningNumber);
      useBalance.getState().release();
      table.onReveal(r);
      setShown(r.winningNumber);
      setHighlight(true);
      if (r.totalPayout > 0) playSound(r.totalPayout >= r.totalWagered * 10 ? 'bigWin' : 'win');
      else playSound('loss');
    } catch (e) {
      onError(e);
      table.onSpinFailed();
    }
  }, [spinning, mutation, slipForSpin, table, onError]);

  useHotkeys({
    Space: () => void spin(),
    Backspace: table.undo,
    u: table.undo,
    c: table.clear,
    r: table.repeat,
    d: table.double,
  });

  const placeChip = useCallback((spot: BetSpot) => table.place(spot, chip), [table, chip]);

  const settled: SettledView | null = useMemo(() => {
    const r = table.result;
    if (!r) return null;
    const bets: SettledView['bets'] = {};
    for (const b of r.bets) bets[spotId(b.type as BetType, b.numbers)] = { amount: b.amount, payout: b.payout };
    return { winningNumber: r.winningNumber, bets };
  }, [table.result]);

  const orientation = width === 0 || width >= 600 ? 'horizontal' : 'vertical';
  const wide = width >= 980;
  const info = hover ?? table.focusSpot;
  const result = table.result;
  const recent = state.recent;

  const wheel = (
    <div ref={wheelBoxRef} className={cn('relative mx-auto aspect-square w-full', wide ? 'max-w-[400px]' : 'max-w-[300px]')}>
      <div className="absolute inset-[-6%] rounded-full bg-[radial-gradient(closest-side,rgba(0,0,0,0.55),transparent)]" aria-hidden />
      <RouletteWheel ref={wheelRef} winning={shown} highlight={highlight} className="relative drop-shadow-[0_18px_30px_rgba(0,0,0,0.55)]" />
      <AnimatePresence>
        {highlight && shown !== null ? (
          <motion.div
            key={`${shown}-${result?.roundId}`}
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8, transition: { duration: 0.15 } }}
            transition={SPRING.soft}
            className="pointer-events-none absolute inset-0 flex items-center justify-center"
          >
            <div
              className={cn(
                'tabular flex aspect-square w-[24%] items-center justify-center rounded-full text-[clamp(22px,4.5vw,40px)] font-bold text-white shadow-[0_0_0_3px_rgba(255,255,255,0.85),0_12px_36px_rgba(0,0,0,0.6)]',
                colorOf(shown) === 'red' && 'bg-roulette-red',
                colorOf(shown) === 'black' && 'bg-roulette-black',
                colorOf(shown) === 'green' && 'bg-roulette-green',
              )}
              data-testid="roulette-result"
            >
              {shown}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );

  const infoLine = (
    <div className="flex min-h-[24px] items-center justify-between gap-3 text-xs">
      <div className="min-w-0 truncate text-fg-muted" aria-live="polite">
        {info ? (
          <>
            <span className="font-semibold text-fg">{info.label}</span>
            <span className="mx-1.5 text-fg-faint">·</span>
            pays <span className="font-semibold text-fg">{PAYOUT_ODDS[info.type]}:1</span>
            <span className="mx-1.5 text-fg-faint">·</span>
            max {formatCredits(state.betLimits[info.type].max)}
            {table.bets[info.id] ? (
              <>
                <span className="mx-1.5 text-fg-faint">·</span>
                on spot <span className="tabular font-semibold text-fg">{formatCredits(table.bets[info.id])}</span>
              </>
            ) : null}
          </>
        ) : (
          <span className="text-fg-subtle">
            {orientation === 'horizontal' ? 'Click' : 'Tap'} a number for a straight bet · edges for splits &amp; streets · corners for corners &amp; six lines
          </span>
        )}
      </div>
      <span className="hidden shrink-0 text-fg-subtle sm:inline">
        Limits {formatCredits(state.limits.minBet)}–{formatCredits(state.limits.maxBet)}
      </span>
    </div>
  );

  const board = (
    <RouletteBoard
      orientation={orientation}
      bets={table.bets}
      settled={settled}
      disabled={spinning}
      onPlace={placeChip}
      onHover={setHover}
      payoutTarget={payoutRef}
    />
  );

  // After a refresh the latest round (from /state) is shown until the next spin.
  const shownRound = spinning ? null : (result ?? state.lastRound);
  const outcome = shownRound ? (
    <motion.div key={shownRound.roundId} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-2 text-sm">
      <NumberPill n={shownRound.winningNumber} />
      {shownRound.totalPayout > 0 ? (
        <span className={cn('font-semibold', shownRound.totalPayout >= shownRound.totalWagered * 10 ? 'text-gold-bright' : 'text-win')}>
          Won {formatCredits(shownRound.totalPayout)}
        </span>
      ) : (
        <span className="text-fg-muted">No win this spin</span>
      )}
    </motion.div>
  ) : null;

  return (
    <div className="space-y-3">
      <Stage className="overflow-visible bg-[radial-gradient(120%_70%_at_50%_0%,#1a1e27_0%,#13161c_55%,#111318_100%)]">
        <div ref={stageRef} className={cn('relative', wide ? 'grid grid-cols-[minmax(300px,380px)_minmax(0,1fr)] gap-7 p-5' : 'space-y-3 p-3 sm:p-4')}>
          {wide ? (
            <>
              <div className="flex items-center">{wheel}</div>
              <div className="flex min-w-0 flex-col justify-center gap-3">
                <div className="flex items-center justify-between gap-3">
                  <HistoryStrip recent={recent} />
                  <div className="shrink-0">{outcome}</div>
                </div>
                <div className="py-1">{board}</div>
                {infoLine}
                <RecentStats recent={recent} row />
              </div>
            </>
          ) : (
            <>
              <div className={cn('grid items-center', orientation === 'horizontal' ? 'grid-cols-[minmax(0,260px)_minmax(0,1fr)] gap-6' : 'grid-cols-[56%_minmax(0,1fr)] gap-3')}>
                {wheel}
                <div className="flex min-w-0 flex-col gap-3">
                  <div className="min-h-[28px]">{outcome ?? <span className="text-sm text-fg-subtle">Place your bets</span>}</div>
                  {orientation === 'horizontal' ? (
                    <>
                      <HistoryStrip recent={recent} />
                      <RecentStats recent={recent} />
                    </>
                  ) : (
                    <MiniHistory recent={recent} />
                  )}
                </div>
              </div>
              <div className={cn(orientation === 'vertical' && 'px-1 pb-1')}>{board}</div>
              {infoLine}
            </>
          )}
        </div>
      </Stage>

      <Controls
        layout={width >= 1100 ? 'wide' : width >= 600 ? 'medium' : 'compact'}
        chip={chip}
        setChip={setChip}
        balance={balance}
        stake={stakeShown}
        lastWin={shownRound?.totalPayout ?? null}
        payoutRef={payoutRef}
        spinning={spinning}
        pending={mutation.isPending}
        rebet={rebet}
        canSpin={!!slipForSpin && Object.keys(slipForSpin).length > 0}
        canUndo={table.canUndo}
        canClear={hasDraft}
        canRepeat={!!table.lastBets}
        canDouble={hasDraft || (table.phase === 'result' && !!table.lastBets)}
        maxChip={state.limits.maxOutsideBet}
        onSpin={() => void spin()}
        onUndo={table.undo}
        onClear={table.clear}
        onRepeat={table.repeat}
        onDouble={table.double}
      />
    </div>
  );
}

function MiniHistory({ recent }: { recent: RouletteState['recent'] }) {
  if (!recent.length) return <p className="text-xs leading-relaxed text-fg-subtle">Your last results will appear here.</p>;
  return (
    <div>
      <div className="mb-1.5 text-[10px] font-medium uppercase tracking-wider text-fg-subtle">Last results</div>
      <div className="flex flex-wrap gap-1">
        {recent.slice(0, 12).map((r, i) => (
          <NumberPill key={r.id} n={r.winningNumber} size="sm" className={i === 0 ? 'ring-2 ring-white/60' : 'opacity-90'} />
        ))}
      </div>
    </div>
  );
}

type ControlsLayout = 'compact' | 'medium' | 'wide';

function Controls(p: {
  layout: ControlsLayout;
  chip: number;
  setChip: (v: number) => void;
  balance: number | null;
  stake: number;
  lastWin: number | null;
  payoutRef: React.RefObject<HTMLDivElement | null>;
  spinning: boolean;
  pending: boolean;
  rebet: boolean;
  canSpin: boolean;
  canUndo: boolean;
  canClear: boolean;
  canRepeat: boolean;
  canDouble: boolean;
  maxChip: number;
  onSpin: () => void;
  onUndo: () => void;
  onClear: () => void;
  onRepeat: () => void;
  onDouble: () => void;
}) {
  const busy = p.spinning || p.pending;
  const compact = p.layout === 'compact';
  const act = compact ? 'h-12 w-12 px-0' : 'h-11 gap-1.5 px-3';
  const actions = (
    <div className="flex items-center gap-1.5">
      <ActionButton className={act} label="Undo" kbd="U" onClick={p.onUndo} disabled={!p.canUndo || busy} icon={<Undo2 size={17} />} showLabel={!compact} />
      <ActionButton className={act} label="Clear" kbd="C" onClick={p.onClear} disabled={!p.canClear || busy} icon={<Trash2 size={17} />} showLabel={!compact} />
      <ActionButton className={act} label="Repeat" kbd="R" onClick={p.onRepeat} disabled={!p.canRepeat || busy} icon={<Repeat2 size={17} />} showLabel={!compact} />
      <ActionButton className={act} label="Double" kbd="D" onClick={p.onDouble} disabled={!p.canDouble || busy} icon={<ChevronsUp size={17} />} showLabel={!compact} />
    </div>
  );
  const spinButton = (
    <Button
      size="lg"
      className={cn('h-12 px-6 text-[15px]', compact ? 'min-w-0 flex-1' : 'min-w-[168px]')}
      onClick={p.onSpin}
      disabled={busy || !p.canSpin}
      loading={p.pending && !p.spinning}
      data-testid="roulette-spin"
    >
      <span className="flex flex-col items-center leading-tight">
        <span>{p.spinning ? 'Spinning…' : p.rebet ? 'Rebet & Spin' : 'Spin'}</span>
        {compact && p.stake > 0 ? <span className="tabular text-[11px] font-medium opacity-80">{formatCredits(p.stake)}</span> : null}
      </span>
      {!p.spinning ? <Kbd>Space</Kbd> : null}
    </Button>
  );
  const readouts = (
    <div className="flex items-center gap-5">
      {compact ? null : <Readout label="Balance" value={p.balance} />}
      <Readout label="Total bet" value={p.stake} />
      <div ref={p.payoutRef}>
        <Readout label="Win" value={p.lastWin} tone={p.lastWin ? 'win' : undefined} />
      </div>
    </div>
  );
  const chips = <ChipSelector value={p.chip} onChange={p.setChip} size={compact ? 38 : 40} disabledAbove={p.maxChip} className="min-w-0 px-0.5" />;

  return (
    <div
      className={cn(
        'surface-panel z-20 rounded-xl',
        compact
          ? 'sticky bottom-[calc(56px+env(safe-area-inset-bottom))] p-2.5 shadow-[0_-14px_32px_-10px_rgba(0,0,0,0.8)] lg:bottom-3'
          : 'p-3',
      )}
    >
      {p.layout === 'wide' ? (
        <div className="flex items-center gap-4">
          {chips}
          <div className="h-9 w-px bg-line" />
          {actions}
          <div className="ml-auto">{readouts}</div>
          {spinButton}
        </div>
      ) : p.layout === 'medium' ? (
        <div className="space-y-2.5">
          <div className="flex items-center justify-between gap-4">
            {chips}
            {readouts}
          </div>
          <div className="flex items-center justify-between gap-3">
            {actions}
            {spinButton}
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0 flex-1">{chips}</div>
          </div>
          <div className="flex items-center gap-1.5">
            {actions}
            {spinButton}
          </div>
        </div>
      )}
    </div>
  );
}

function ActionButton({ label, kbd, icon, onClick, disabled, className, showLabel }: { label: string; kbd: string; icon: React.ReactNode; onClick: () => void; disabled: boolean; className: string; showLabel: boolean }) {
  return (
    <Tooltip content={<span>{label} <Kbd>{kbd}</Kbd></span>}>
      <Button variant="subtle" className={className} onClick={onClick} disabled={disabled} aria-label={label}>
        {icon}
        {showLabel ? <span>{label}</span> : null}
      </Button>
    </Tooltip>
  );
}

function Readout({ label, value, tone }: { label: string; value: number | null; tone?: 'win' }) {
  return (
    <div className="min-w-0 text-right lg:text-left">
      <div className="whitespace-nowrap text-[10px] font-medium uppercase tracking-wider text-fg-subtle">{label}</div>
      <div className={cn('tabular flex items-center justify-end gap-1 text-sm font-semibold lg:justify-start', tone === 'win' ? 'text-win' : 'text-fg')}>
        <CreditIcon size={13} />
        {value === null ? '—' : <AnimatedNumber value={value} duration={0.5} />}
      </div>
    </div>
  );
}

function Rules() {
  return (
    <>
      <RulesSection title="How to play">
        <p>
          Choose a chip, then place bets on the layout. Click a number for a straight-up bet, the line between two numbers for a split, the
          outer edge of a column for a street, an intersection for a corner, and the outer edge between two streets for a six line. Outside
          bets cover dozens, columns, colour, parity and high/low.
        </p>
        <p>Press Spin. The result is generated by the server from your provably-fair seed pair before the wheel animates to it.</p>
      </RulesSection>
      <RulesSection title="Payouts">
        <PayTable
          rows={[
            ['Straight (1 number)', '35:1'],
            ['Split (2 numbers)', '17:1'],
            ['Street / Trio (3 numbers)', '11:1'],
            ['Corner / First Four (4 numbers)', '8:1'],
            ['Six Line (6 numbers)', '5:1'],
            ['Dozen / Column (12 numbers)', '2:1'],
            ['Red / Black · Odd / Even · 1–18 / 19–36', '1:1'],
          ]}
        />
      </RulesSection>
      <RulesSection title="Zero">
        <p>
          The wheel has a single green zero (37 pockets, house edge 2.70%). Zero can be bet straight, as a split with 1, 2 or 3, in the trios
          0-1-2 and 0-2-3, or in the First Four (0-1-2-3). When zero wins, all outside bets lose.
        </p>
      </RulesSection>
      <RulesSection title="Limits & shortcuts">
        <p>Each bet must meet the table minimum. Inside bets and outside bets have separate per-spot maximums, and the total per spin is capped.</p>
        <p>Space spin · U / Backspace undo · C clear · R repeat · D double.</p>
      </RulesSection>
    </>
  );
}
