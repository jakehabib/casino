'use client';
import { useEffect, useMemo, useState } from 'react';
import { ArrowDownRight, ArrowUpRight, CalendarClock, Info } from 'lucide-react';
import { cn } from '@/lib/cn';
import { formatCredits } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from '@/components/ui/toast';
import { Panel } from '@/components/wallet/page-frame';
import { formatLongDateTime } from './options';
import { useCancelChange, useSetLimit, type LimitKind, type PendingChange, type RpSummary } from './use-rp';

const PRESETS = [1_000, 5_000, 10_000, 25_000, 50_000, 100_000];
const MAX = 10_000_000_000;

const COPY: Record<LimitKind, { title: string; body: string; noun: string }> = {
  DAILY_WAGER: {
    title: 'Daily wager limit',
    body: 'The most Credits you can wager in one day, win or lose.',
    noun: 'daily wager limit',
  },
  DAILY_LOSS: {
    title: 'Daily loss limit',
    body: 'The most Credits you can lose in one day (wagered minus returned).',
    noun: 'daily loss limit',
  },
};

function limitText(v: number | null) {
  return v === null ? 'No limit' : `${formatCredits(v)} Credits`;
}

/** More restrictive = lower, or adding a limit where there was none. Mirrors the server rule. */
function isDecrease(current: number | null, next: number | null) {
  if (next === null) return false;
  if (current === null) return true;
  return next < current;
}

function PendingNotice({ change, onCancel, cancelling }: { change: PendingChange; onCancel: () => void; cancelling: boolean }) {
  return (
    <div className="rounded-lg border border-line-strong/70 bg-surface-2 p-3.5" data-testid={`pending-${change.limitType}`}>
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-fg-subtle">
        <CalendarClock size={13} /> Pending change
      </div>
      <dl className="mt-2.5 grid grid-cols-1 gap-x-4 gap-y-2 text-[13px] sm:grid-cols-3">
        <div>
          <dt className="text-xs text-fg-subtle">Current limit</dt>
          <dd className="tabular font-medium text-fg">{limitText(change.oldValue)}</dd>
        </div>
        <div>
          <dt className="text-xs text-fg-subtle">Requested new limit</dt>
          <dd className="tabular font-medium text-fg">{limitText(change.newValue)}</dd>
        </div>
        <div>
          <dt className="text-xs text-fg-subtle">Takes effect</dt>
          <dd className="font-medium text-fg">{formatLongDateTime(change.effectiveAt)}</dd>
        </div>
      </dl>
      <div className="mt-3 flex flex-col gap-2 border-t border-line pt-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-fg-subtle">Until then, your current limit applies.</p>
        <Button size="sm" variant="secondary" loading={cancelling} onClick={onCancel} data-testid={`cancel-${change.limitType}`}>
          Cancel request
        </Button>
      </div>
    </div>
  );
}

function LimitCard({ kind, current, pending, delayHours }: { kind: LimitKind; current: number | null; pending: PendingChange | null; delayHours: number }) {
  const copy = COPY[kind];
  const setLimit = useSetLimit();
  const cancel = useCancelChange();
  const [raw, setRaw] = useState('');
  const [noLimit, setNoLimit] = useState(false);

  // Reset the form whenever the server state changes underneath it.
  useEffect(() => {
    setRaw('');
    setNoLimit(false);
  }, [current, pending?.id]);

  const parsed = raw === '' ? undefined : Number(raw.replace(/[^\d]/g, ''));
  const next: number | null | undefined = noLimit ? null : parsed;
  const invalid = next !== undefined && next !== null && (!Number.isSafeInteger(next) || next <= 0 || next > MAX);
  const unchanged = next !== undefined && next === current;
  const canSubmit = next !== undefined && !invalid && !(unchanged && !pending);
  const decrease = next !== undefined && isDecrease(current, next);
  const effective = useMemo(() => new Date(Date.now() + delayHours * 3600_000), [delayHours, next]); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = () => {
    if (!canSubmit || next === undefined) return;
    setLimit.mutate(
      { limitType: kind, value: next },
      {
        onSuccess: (r) => {
          if (unchanged) toast.success('Request withdrawn', `Your ${copy.noun} stays at ${limitText(current)}.`);
          else if (r.applied) toast.success('Limit updated', `Your ${copy.noun} is now ${limitText(next)}, effective immediately.`);
          else toast.info('Change scheduled', `Your ${copy.noun} will change to ${limitText(next)} on ${formatLongDateTime(r.change!.effectiveAt)}.`);
        },
      },
    );
  };

  return (
    <Panel className="flex flex-col p-4 sm:p-5" as="article">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className="text-[15px] font-semibold tracking-tight">{copy.title}</h3>
          <p className="mt-0.5 text-[13px] text-fg-muted">{copy.body}</p>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-2xs font-semibold uppercase tracking-[0.12em] text-fg-subtle">Current</div>
          <div className="tabular mt-0.5 text-[15px] font-semibold" data-testid={`current-${kind}`}>
            {current === null ? <span className="text-fg-muted">No limit</span> : formatCredits(current)}
          </div>
        </div>
      </div>

      {pending ? (
        <div className="mt-4">
          <PendingNotice change={pending} cancelling={cancel.isPending} onCancel={() => cancel.mutate(pending.id)} />
        </div>
      ) : null}

      <form
        className="mt-4 flex flex-1 flex-col"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <label htmlFor={`limit-${kind}`} className="text-[13px] font-medium text-fg-muted">
          {current === null ? 'Set a limit' : 'New limit'}
        </label>
        <Input
          id={`limit-${kind}`}
          className="mt-1.5"
          inputMode="numeric"
          autoComplete="off"
          placeholder={noLimit ? 'No limit' : 'Enter Credits'}
          value={noLimit ? '' : raw === '' ? '' : formatCredits(Number(raw))}
          disabled={noLimit}
          invalid={invalid}
          onChange={(e) => {
            const digits = e.target.value.replace(/[^\d]/g, '').slice(0, 11);
            setRaw(digits.replace(/^0+/, ''));
          }}
          trailing={<span className="text-xs font-medium text-fg-subtle">Credits</span>}
          data-testid={`input-${kind}`}
        />
        <div className="mt-2 flex flex-wrap gap-1.5">
          {PRESETS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => {
                setNoLimit(false);
                setRaw(String(p));
              }}
              className={cn(
                'tabular h-7 rounded-md border px-2.5 text-xs font-medium transition-colors',
                !noLimit && parsed === p ? 'border-fg-muted/60 bg-surface-3 text-fg' : 'border-line bg-surface-2 text-fg-muted hover:border-line-strong hover:text-fg',
              )}
            >
              {p >= 1000 ? `${p / 1000}K` : p}
            </button>
          ))}
          <button
            type="button"
            onClick={() => {
              setNoLimit((v) => !v);
              setRaw('');
            }}
            aria-pressed={noLimit}
            className={cn(
              'h-7 rounded-md border px-2.5 text-xs font-medium transition-colors',
              noLimit ? 'border-fg-muted/60 bg-surface-3 text-fg' : 'border-line bg-surface-2 text-fg-muted hover:border-line-strong hover:text-fg',
            )}
            data-testid={`nolimit-${kind}`}
          >
            No limit
          </button>
        </div>

        <div className="mt-3 min-h-[40px] text-xs leading-relaxed" aria-live="polite">
          {invalid ? (
            <p className="text-loss">Enter a whole number of Credits between 1 and {formatCredits(MAX)}.</p>
          ) : next === undefined ? (
            <p className="flex gap-1.5 text-fg-subtle">
              <Info size={13} className="mt-px shrink-0" /> Lowering a limit applies immediately. Raising or removing it takes effect after {delayHours} hours.
            </p>
          ) : unchanged ? (
            <p className="text-fg-subtle">{pending ? 'Saving your current value withdraws the pending change.' : 'This is already your limit.'}</p>
          ) : decrease ? (
            <p className="flex gap-1.5 text-fg-muted">
              <ArrowDownRight size={14} className="mt-px shrink-0" /> More restrictive — applies immediately.
            </p>
          ) : (
            <p className="flex gap-1.5 text-fg-muted">
              <ArrowUpRight size={14} className="mt-px shrink-0" />
              <span>
                {next === null ? 'Removing your limit' : 'Raising your limit'} takes effect after {delayHours} hours, on{' '}
                <span className="font-medium text-fg">{formatLongDateTime(effective)}</span>.{pending ? ' This replaces the pending request.' : ''}
              </span>
            </p>
          )}
        </div>

        <div className="mt-3 flex justify-end">
          <Button type="submit" variant={canSubmit ? 'primary' : 'secondary'} disabled={!canSubmit} loading={setLimit.isPending} className="w-full sm:w-auto" data-testid={`save-${kind}`}>
            {next === undefined || unchanged ? 'Save limit' : decrease ? 'Apply limit now' : next === null ? 'Request removal' : 'Request increase'}
          </Button>
        </div>
      </form>
    </Panel>
  );
}

export function LimitsPanel({ data }: { data: RpSummary }) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <LimitCard kind="DAILY_WAGER" current={data.limits.dailyWager.limit} pending={data.limits.dailyWager.pending} delayHours={data.rules.limitIncreaseDelayHours} />
      <LimitCard kind="DAILY_LOSS" current={data.limits.dailyLoss.limit} pending={data.limits.dailyLoss.pending} delayHours={data.rules.limitIncreaseDelayHours} />
    </div>
  );
}

export function AccountingRules({ delayHours }: { delayHours: number }) {
  const rules = [
    ['Wagers count when accepted', 'A stake is added to today’s total the moment the game accepts it — not when the round ends.'],
    ['Loss = wagered − returned', 'Returns include your stake back plus any winnings. A good round reduces today’s loss; it never goes below zero.'],
    ['The whole stake is checked', 'A wager is only accepted if it fits within both limits in full, so you can never cross a limit mid-round.'],
    ['Accepted rounds always settle', 'If you reach a limit or start a break, rounds already in play still finish and pay out normally.'],
    [`Lower now, raise in ${delayHours}h`, `Tightening a limit is instant. Raising or removing one waits ${delayHours} hours, and you can cancel it any time before then.`],
    ['Resets at local midnight', 'Totals restart at midnight in your chosen timezone.'],
  ];
  return (
    <Panel className="p-4 sm:p-5">
      <h3 className="text-[13px] font-semibold text-fg">How limits are counted</h3>
      <dl className="mt-3 grid gap-x-8 gap-y-3.5 sm:grid-cols-2 lg:grid-cols-3">
        {rules.map(([t, b]) => (
          <div key={t}>
            <dt className="text-[13px] font-medium text-fg">{t}</dt>
            <dd className="mt-0.5 text-xs leading-relaxed text-fg-muted">{b}</dd>
          </div>
        ))}
      </dl>
    </Panel>
  );
}
