'use client';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, Clock, Rocket, X } from 'lucide-react';
import { emitAck } from '@/lib/socket-client';
import { requestId as newRequestId } from '@/lib/api';
import { cn } from '@/lib/cn';
import { formatCredits } from '@/lib/format';
import { DUR, EASE } from '@/lib/motion';
import { multiplierX100At } from '@/engines/crash/crash-math';
import type { CrashMyBet } from '@/engines/crash/types';
import { Button } from '@/components/ui/button';
import { BetField, Kbd, useHotkeys } from '@/components/ui/bet-controls';
import { Switch } from '@/components/ui/switch';
import { CreditIcon } from '@/components/ui/credit-icon';
import { useDisplayBalance } from '@/stores/balance-store';
import { useGameErrorHandler } from '@/components/games/shared/use-game-action';
import { serverNow, useCrash } from './crash-store';
import { phaseOf } from './crash-stage';

const SLOT_LABEL = ['A', 'B'] as const;

function readPref<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function writePref(key: string, v: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(v));
  } catch {
    /* private mode */
  }
}

/** Auto cash-out multiplier input (×100 integer under the hood). */
function AutoCashoutInput({
  value,
  onChange,
  max,
  disabled,
  enabled,
  onToggle,
}: {
  value: number;
  onChange: (x100: number) => void;
  max: number;
  disabled?: boolean;
  enabled: boolean;
  onToggle: (v: boolean) => void;
}) {
  const [text, setText] = useState((value / 100).toFixed(2));
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (!focused) setText((value / 100).toFixed(2));
  }, [value, focused]);
  const commit = () => {
    const n = Math.round(parseFloat(text.replace(',', '.')) * 100);
    const v = Number.isFinite(n) ? Math.max(101, Math.min(max, n)) : value;
    onChange(v);
    setText((v / 100).toFixed(2));
  };
  const nudge = (d: number) => onChange(Math.max(101, Math.min(max, Math.round(value + d))));
  const btn =
    'h-11 min-w-[40px] rounded-lg border border-line bg-surface-2 px-2 text-[13px] font-semibold text-fg-muted transition-colors hover:bg-surface-3 hover:text-fg active:scale-95 disabled:opacity-40';
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs font-medium text-fg-subtle">
        <span>Auto cash-out</span>
        <Switch checked={enabled} onCheckedChange={onToggle} label="Auto cash-out" disabled={disabled} />
      </div>
      <div className={cn('flex gap-1.5 transition-opacity', !enabled && 'opacity-45')}>
        <div className="flex h-11 min-w-0 flex-1 items-center gap-2 rounded-lg border border-line bg-bg-raised pl-3 pr-3 transition-[border,box-shadow] focus-within:border-accent/70 focus-within:shadow-[0_0_0_3px_#7c5cff22]">
          <input
            aria-label="Auto cash-out multiplier"
            inputMode="decimal"
            disabled={disabled || !enabled}
            value={text}
            onFocus={(e) => {
              setFocused(true);
              requestAnimationFrame(() => e.target.select());
            }}
            onBlur={() => {
              setFocused(false);
              commit();
            }}
            onChange={(e) => setText(e.target.value.replace(/[^\d.,]/g, '').slice(0, 9))}
            onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
            className="tabular h-full min-w-0 flex-1 bg-transparent text-[15px] font-semibold text-fg outline-none"
          />
          <span className="text-sm font-semibold text-fg-subtle">×</span>
        </div>
        <button type="button" className={btn} disabled={disabled || !enabled} onClick={() => nudge(-(value > 200 ? 50 : 10))} aria-label="Decrease auto cash-out">
          −
        </button>
        <button type="button" className={btn} disabled={disabled || !enabled} onClick={() => nudge(value >= 200 ? 50 : 10)} aria-label="Increase auto cash-out">
          +
        </button>
      </div>
    </div>
  );
}

/** Live "Cash out 1,240" amount — written per frame without re-rendering. */
function LiveCashout({ amount, startedAt }: { amount: number; startedAt: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const multRef = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    let raf = 0;
    const loop = () => {
      const m = multiplierX100At(serverNow() - startedAt);
      const v = Math.floor((amount * m) / 100);
      if (ref.current) ref.current.textContent = formatCredits(v);
      if (multRef.current) multRef.current.textContent = `${(m / 100).toFixed(2)}×`;
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [amount, startedAt]);
  return (
    <span className="flex w-full items-center justify-between gap-3">
      <span className="text-[15px]">Cash out</span>
      <span className="flex items-baseline gap-2">
        <span ref={ref} className="tabular text-lg font-bold">
          {formatCredits(amount)}
        </span>
        <span ref={multRef} className="tabular text-xs font-semibold opacity-70" />
      </span>
    </span>
  );
}

export function BetPanel({ slot, signedIn, hotkeys, compact }: { slot: 0 | 1; signedIn: boolean; hotkeys?: boolean; compact?: boolean }) {
  const round = useCrash((s) => s.round);
  const mine = useCrash((s) => s.mine[slot]);
  const config = useCrash((s) => s.config);
  const balance = useDisplayBalance();
  const onError = useGameErrorHandler();
  const minBet = config?.minBet ?? 100;
  const maxBet = config?.maxBet ?? 250_000;
  const maxAuto = config?.maxAutoCashoutX100 ?? 1_000_000;

  const prefKey = `nova.crash.slot${slot}`;
  const [amount, setAmount] = useState(1_000);
  const [autoOn, setAutoOn] = useState(slot === 1);
  const [auto, setAuto] = useState(200);
  const [queued, setQueued] = useState(false);
  const [busy, setBusy] = useState<'bet' | 'cashout' | null>(null);
  const pendingBetRid = useRef<string | null>(null);
  const placingFor = useRef<string | null>(null);

  useEffect(() => {
    const p = readPref(prefKey, { amount: 1_000, autoOn: slot === 1, auto: 200 });
    setAmount(p.amount);
    setAutoOn(p.autoOn);
    setAuto(p.auto);
  }, [prefKey, slot]);
  useEffect(() => writePref(prefKey, { amount, autoOn, auto }), [prefKey, amount, autoOn, auto]);

  const phase = phaseOf(round);
  // Re-evaluate the phase when the countdown elapses locally.
  const [, force] = useState(0);
  useEffect(() => {
    if (!round || round.status !== 'WAITING') return;
    const left = round.bettingEndsAt - serverNow();
    if (left <= 0) return;
    const t = setTimeout(() => force((n) => n + 1), left + 20);
    return () => clearTimeout(t);
  }, [round]);

  const myBet: CrashMyBet | null = mine && round && mine.roundId === round.id ? mine : null;
  const active = myBet?.status === 'ACTIVE';
  const canBetNow = phase === 'waiting' && !myBet;

  const place = useCallback(async () => {
    const r = useCrash.getState().round;
    if (!r) return;
    const rid = pendingBetRid.current ?? newRequestId();
    pendingBetRid.current = rid;
    setBusy('bet');
    try {
      const res = await emitAck<{ bet: CrashMyBet }>('crash:bet', {
        slot,
        amount,
        autoCashout: autoOn ? auto : null,
        requestId: rid,
      });
      pendingBetRid.current = null;
      useCrash.getState().applyMyBet(res.bet);
    } catch (err) {
      // Keep the requestId only for transport failures so a retry is idempotent.
      if ((err as { code?: string }).code !== 'TIMEOUT') pendingBetRid.current = null;
      onError(err);
    } finally {
      setBusy(null);
    }
  }, [slot, amount, autoOn, auto, onError]);

  const doCashout = useCallback(async () => {
    setBusy('cashout');
    try {
      const res = await emitAck<{ bet: CrashMyBet }>('crash:cashout', { slot, requestId: newRequestId() });
      useCrash.getState().applyMyBet(res.bet);
    } catch (err) {
      onError(err);
    } finally {
      setBusy(null);
    }
  }, [slot, onError]);

  // "Bet next round": auto-place as soon as the next round opens.
  useEffect(() => {
    if (!queued || !round || phase !== 'waiting' || myBet) return;
    if (placingFor.current === round.id) return;
    placingFor.current = round.id;
    setQueued(false);
    void place();
  }, [queued, round, phase, myBet, place]);

  const primary = () => {
    if (!signedIn || busy) return;
    if (active && phase === 'running') return void doCashout();
    if (canBetNow) return void place();
    if (!myBet || !active) setQueued((q) => !q);
  };
  useHotkeys({ Space: hotkeys ? primary : undefined }, !!hotkeys);

  const inputsLocked = !!myBet && active;

  let button: React.ReactNode;
  if (!signedIn) {
    button = (
      <Link href="/login?next=/casino/crash" className="block">
        <Button size="xl" block>
          Sign in to play
        </Button>
      </Link>
    );
  } else if (active && phase === 'running' && round?.startedAt) {
    button = (
      <Button size="xl" variant="win" block onClick={primary} loading={busy === 'cashout'} data-testid={`crash-cashout-${slot}`} sound={false}>
        <LiveCashout amount={myBet!.amount} startedAt={round.startedAt} />
      </Button>
    );
  } else if (active) {
    button = (
      <Button size="xl" variant="secondary" block disabled className="!opacity-100">
        <span className="flex items-center gap-2 text-fg-muted">
          <Clock size={16} className="animate-pulse-soft" /> Waiting for launch…
        </span>
      </Button>
    );
  } else if (canBetNow) {
    button = (
      <Button size="xl" block onClick={primary} loading={busy === 'bet'} data-testid={`crash-bet-${slot}`}>
        Bet {SLOT_LABEL[slot]}
        {hotkeys ? <Kbd>Space</Kbd> : null}
      </Button>
    );
  } else if (queued) {
    button = (
      <Button size="xl" variant="secondary" block onClick={() => setQueued(false)} leftIcon={<X size={16} />}>
        Queued for next round
      </Button>
    );
  } else {
    button = (
      <Button size="xl" variant="subtle" block onClick={primary} loading={busy === 'bet'} disabled={!!busy}>
        Bet next round
        {hotkeys ? <Kbd>Space</Kbd> : null}
      </Button>
    );
  }

  const result =
    myBet && myBet.status === 'CASHED_OUT' ? (
      <motion.div
        key="won"
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0 }}
        transition={{ duration: DUR.standard, ease: EASE.out }}
        className="flex items-center justify-between rounded-lg border border-win/25 bg-win-soft px-3 py-2 text-[13px]"
      >
        <span className="flex items-center gap-1.5 font-medium text-win">
          <Check size={14} /> Cashed out <span className="tabular">{((myBet.cashoutAt ?? 0) / 100).toFixed(2)}×</span>
        </span>
        <span className="tabular flex items-center gap-1 font-semibold text-win">
          +<CreditIcon size={13} />
          {formatCredits(myBet.payout ?? 0)}
        </span>
      </motion.div>
    ) : myBet && myBet.status === 'LOST' ? (
      <motion.div
        key="lost"
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0 }}
        className="flex items-center justify-between rounded-lg border border-line bg-surface-2/70 px-3 py-2 text-[13px]"
      >
        <span className="font-medium text-fg-muted">Crashed before cash-out</span>
        <span className="tabular font-semibold text-fg-subtle">−{formatCredits(myBet.amount)}</span>
      </motion.div>
    ) : myBet && myBet.status === 'REFUNDED' ? (
      <motion.div key="refunded" className="rounded-lg border border-line bg-surface-2/70 px-3 py-2 text-[13px] text-fg-muted">
        Round voided — stake refunded
      </motion.div>
    ) : null;

  return (
    <div className={cn('surface-panel flex flex-col gap-3.5 rounded-xl p-4', compact && 'gap-3 p-3.5')} data-testid={`crash-panel-${slot}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-[13px] font-semibold text-fg">
          <span className="flex h-5 w-5 items-center justify-center rounded-[5px] bg-surface-4 text-[11px] font-bold text-fg-muted">{SLOT_LABEL[slot]}</span>
          Bet {SLOT_LABEL[slot]}
        </div>
        {myBet && active ? (
          <span className="flex items-center gap-1.5 rounded-md bg-accent-soft px-2 py-0.5 text-[11px] font-semibold text-accent">
            <Rocket size={11} />
            {myBet.autoCashout ? <span className="tabular">Auto {(myBet.autoCashout / 100).toFixed(2)}×</span> : 'In play'}
          </span>
        ) : null}
      </div>
      <BetField
        value={amount}
        onChange={setAmount}
        min={minBet}
        max={maxBet}
        balance={balance}
        disabled={!signedIn || inputsLocked}
        label="Bet amount"
      />
      <AutoCashoutInput value={auto} onChange={setAuto} max={maxAuto} enabled={autoOn} onToggle={setAutoOn} disabled={!signedIn || inputsLocked} />
      <AnimatePresence mode="wait" initial={false}>
        {result}
      </AnimatePresence>
      {button}
    </div>
  );
}
