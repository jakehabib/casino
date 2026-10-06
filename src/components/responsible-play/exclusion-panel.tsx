'use client';
import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, ChevronDown, Lock, Minus, PauseCircle, ShieldAlert } from 'lucide-react';
import { cn } from '@/lib/cn';
import { DUR, EASE } from '@/lib/motion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { toast } from '@/components/ui/toast';
import { useNow } from '@/components/layout/rewards-popover';
import { Panel } from '@/components/wallet/page-frame';
import {
  ALLOWED_FEATURES,
  BLOCKED_FEATURES,
  EXCLUSION_BY_TYPE,
  EXCLUSION_LIST,
  computeEndsAt,
  confirmPhrase,
  formatLongDateTime,
  formatRemaining,
  type ExclusionOption,
  type ExclusionType,
} from './options';
import { useCreateExclusion, useRequestReinstatement, type RpSummary } from './use-rp';

type ActiveExclusion = NonNullable<RpSummary['exclusion']>;

function FeatureLists({ compact }: { compact?: boolean }) {
  return (
    <div className={cn('grid gap-4', compact ? 'sm:grid-cols-2' : 'sm:grid-cols-2')}>
      <div>
        <div className="text-xs font-semibold text-fg">While it’s active</div>
        <ul className="mt-2 space-y-1.5">
          {BLOCKED_FEATURES.map((f) => (
            <li key={f} className="flex gap-2 text-[13px] text-fg-muted">
              <Minus size={14} className="mt-0.5 shrink-0 text-fg-subtle" />
              {f}
            </li>
          ))}
        </ul>
      </div>
      <div>
        <div className="text-xs font-semibold text-fg">You can still</div>
        <ul className="mt-2 space-y-1.5">
          {ALLOWED_FEATURES.map((f) => (
            <li key={f} className="flex gap-2 text-[13px] text-fg-muted">
              <Check size={14} className="mt-0.5 shrink-0 text-fg-subtle" />
              {f}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function ConfirmExclusionModal({ option, onClose, waitDays }: { option: ExclusionOption | null; onClose: () => void; waitDays: number }) {
  const create = useCreateExclusion();
  const [phrase, setPhrase] = useState('');
  const [ack, setAck] = useState(false);
  const now = useNow(15_000);
  const type = option?.type;
  const endsAt = useMemo(() => (type ? computeEndsAt(type, new Date(now)) : null), [type, now]);
  if (!option) return <Modal open={false} onOpenChange={() => undefined}>{null}</Modal>;

  const expected = confirmPhrase(option.type);
  const isSelfExclusion = option.kind === 'SELF_EXCLUSION';
  const valid = phrase.trim().toUpperCase() === expected && (!isSelfExclusion || ack);
  const close = () => {
    setPhrase('');
    setAck(false);
    onClose();
  };
  const submit = () => {
    if (!valid) return;
    create.mutate(
      { type: option.type, confirmation: expected },
      {
        onSuccess: (r) => {
          if (r.created) {
            toast.info(`${r.exclusion.label} started`, r.exclusion.endsAt ? `Casino play is disabled until ${formatLongDateTime(r.exclusion.endsAt)}.` : 'Casino play is disabled indefinitely.');
          } else {
            toast.info('Already covered', 'You already have a restriction in place that lasts at least as long.');
          }
          close();
        },
      },
    );
  };

  return (
    <Modal
      open
      onOpenChange={(o) => (!o ? close() : undefined)}
      tone="serious"
      size="lg"
      title={option.title}
      description={isSelfExclusion ? 'Self-exclusion is a firm commitment. Please read this carefully.' : 'A break pauses all casino play on your account.'}
      footer={
        <>
          <Button variant="ghost" onClick={close}>
            Not now
          </Button>
          <Button variant="primary" disabled={!valid} loading={create.isPending} onClick={submit} data-testid="exclusion-submit">
            {isSelfExclusion ? 'Start self-exclusion' : option.type === 'LOCK_1W' ? 'Lock my account' : 'Start break'}
          </Button>
        </>
      }
    >
      <form
        className="space-y-5"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <div className="rounded-lg border border-line-strong bg-surface-2 p-4" data-testid="exclusion-statement">
          <div className="flex items-start gap-3">
            <Lock size={17} className="mt-0.5 shrink-0 text-fg-muted" />
            <p className="text-[15px] font-medium leading-relaxed text-fg">
              {endsAt ? (
                <>
                  Casino play will be disabled until <span className="whitespace-nowrap font-semibold">{formatLongDateTime(endsAt)}</span>.
                </>
              ) : (
                <>Casino play will be disabled indefinitely.</>
              )}
            </p>
          </div>
          <p className="mt-2 pl-[29px] text-[13px] leading-relaxed text-fg-muted">
            {endsAt
              ? 'Once started, it can’t be cancelled, paused or shortened. It ends automatically at that time.'
              : `It can’t be cancelled. Play can only be restored after you request a review, a ${waitDays}-day waiting period, and approval by our support team.`}
          </p>
        </div>

        <FeatureLists />

        {isSelfExclusion ? (
          <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-line bg-bg-raised p-3.5 text-[13px] leading-relaxed text-fg-muted">
            <input
              type="checkbox"
              checked={ack}
              onChange={(e) => setAck(e.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-[var(--color-accent)]"
              data-testid="exclusion-ack"
            />
            <span>
              I understand that this self-exclusion can’t be undone{endsAt ? `, and that I won’t be able to play until ${formatLongDateTime(endsAt)}` : ', and that play stays disabled until a support review'}.
            </span>
          </label>
        ) : null}

        <div>
          <label htmlFor="exclusion-phrase" className="text-[13px] font-medium text-fg-muted">
            Type <span className="font-mono font-semibold tracking-wider text-fg">{expected}</span> to confirm
          </label>
          <Input
            id="exclusion-phrase"
            className="mt-1.5"
            value={phrase}
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            placeholder={expected}
            onChange={(e) => setPhrase(e.target.value)}
            data-testid="exclusion-phrase"
          />
        </div>
      </form>
    </Modal>
  );
}

function OptionCard({ option, onSelect, extendLabel }: { option: ExclusionOption; onSelect: () => void; extendLabel?: boolean }) {
  const isSelf = option.kind === 'SELF_EXCLUSION';
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'group flex h-full flex-col rounded-xl border bg-surface-1 p-4 text-left transition-colors hover:bg-surface-2',
        isSelf ? 'border-line-strong' : 'border-line hover:border-line-strong',
      )}
      data-testid={`option-${option.type}`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-2xs font-semibold uppercase tracking-[0.12em] text-fg-subtle">{isSelf ? 'Exclusion' : option.type === 'LOCK_1W' ? 'Cooldown' : 'Break'}</span>
        <span className="tabular shrink-0 whitespace-nowrap rounded bg-surface-3 px-1.5 py-0.5 text-[11px] font-medium text-fg-muted">{option.duration}</span>
      </div>
      <div className="mt-3 text-[15px] font-semibold tracking-tight text-fg">{extendLabel ? (option.type === 'EXCLUSION_INDEFINITE' ? 'Extend indefinitely' : `Extend to ${option.duration}`) : option.title}</div>
      <p className="mt-1 flex-1 text-[13px] leading-relaxed text-fg-muted">{option.blurb}</p>
      <span className="mt-4 text-[13px] font-medium text-fg-muted transition-colors group-hover:text-fg">Review & confirm →</span>
    </button>
  );
}

function ActiveRestriction({ ex, waitDays }: { ex: ActiveExclusion; waitDays: number }) {
  const now = useNow(1000);
  const reinstate = useRequestReinstatement();
  const end = ex.endsAt ? new Date(ex.endsAt).getTime() : null;
  const start = new Date(ex.startsAt).getTime();
  const pct = end ? Math.min(100, Math.max(0, ((now - start) / (end - start)) * 100)) : null;
  const indefinite = ex.type === 'EXCLUSION_INDEFINITE';
  const requested = ex.status === 'REINSTATEMENT_REQUESTED';
  const earliestReview = ex.reinstatementRequestedAt ? new Date(new Date(ex.reinstatementRequestedAt).getTime() + waitDays * 86_400_000) : null;

  return (
    <Panel className="overflow-hidden border-line-strong" as="section">
      <div className="flex items-start gap-3.5 px-4 py-4 sm:px-5 sm:py-5" data-testid="active-restriction">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface-3 text-fg-muted">
          {ex.kind === 'SELF_EXCLUSION' ? <ShieldAlert size={19} /> : <PauseCircle size={19} />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-2xs font-semibold uppercase tracking-[0.14em] text-fg-subtle">Active now · Play disabled</div>
          <h2 className="mt-1 text-lg font-semibold tracking-tight text-fg">{ex.label}</h2>
          <p className="mt-1 text-sm text-fg-muted">
            {ex.endsAt ? (
              <>
                Casino play is disabled until <span className="font-medium text-fg">{formatLongDateTime(ex.endsAt)}</span>.
              </>
            ) : (
              'Casino play is disabled with no end date.'
            )}{' '}
            It can’t be cancelled or shortened.
          </p>
        </div>
      </div>
      <dl className="grid grid-cols-1 gap-px border-t border-line-soft bg-line-soft sm:grid-cols-3">
        <div className="bg-surface-1 px-4 py-3 sm:px-5">
          <dt className="text-xs text-fg-subtle">Started</dt>
          <dd className="mt-0.5 text-[13px] font-medium text-fg">{formatLongDateTime(ex.startsAt)}</dd>
        </div>
        <div className="bg-surface-1 px-4 py-3 sm:px-5">
          <dt className="text-xs text-fg-subtle">Ends</dt>
          <dd className="mt-0.5 text-[13px] font-medium text-fg">{ex.endsAt ? formatLongDateTime(ex.endsAt) : 'No end date'}</dd>
        </div>
        <div className="bg-surface-1 px-4 py-3 sm:px-5">
          <dt className="text-xs text-fg-subtle">Remaining</dt>
          <dd className="tabular mt-0.5 text-[13px] font-semibold text-fg" data-testid="restriction-remaining">
            {end ? formatRemaining(end - now) : '—'}
          </dd>
        </div>
      </dl>
      {pct !== null ? (
        <div className="h-1 bg-surface-3" aria-hidden>
          <div className="h-full bg-fg-subtle/60 transition-[width] duration-1000" style={{ width: `${pct}%` }} />
        </div>
      ) : null}
      {indefinite ? (
        <div className="border-t border-line-soft px-4 py-4 sm:px-5">
          <h3 className="text-[13px] font-semibold text-fg">Restoring access</h3>
          <ol className="mt-2 space-y-1.5 text-[13px] leading-relaxed text-fg-muted">
            <li>1. Request a review below when you feel ready.</li>
            <li>2. A mandatory {waitDays}-day waiting period starts from your request.</li>
            <li>3. Our support team reviews it and may contact you. Play stays disabled throughout.</li>
          </ol>
          <div className="mt-3.5 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            {requested ? (
              <p className="text-[13px] text-fg-muted" data-testid="review-requested">
                Review requested on <span className="font-medium text-fg">{formatLongDateTime(ex.reinstatementRequestedAt!)}</span>
                {earliestReview ? <> · earliest decision {formatLongDateTime(earliestReview)}</> : null}.
              </p>
            ) : (
              <p className="text-[13px] text-fg-subtle">There’s no rush. Your exclusion stays in place until you ask.</p>
            )}
            {!requested ? (
              <Button variant="secondary" size="sm" loading={reinstate.isPending} onClick={() => reinstate.mutate()} data-testid="request-review">
                Request review
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}
      <div className="border-t border-line-soft bg-bg-raised/40 px-4 py-4 sm:px-5">
        <FeatureLists compact />
      </div>
    </Panel>
  );
}

export function ExclusionPanel({ data }: { data: RpSummary }) {
  const [selected, setSelected] = useState<ExclusionType | null>(null);
  const [showMore, setShowMore] = useState(false);
  const active = data.exclusion;
  const waitDays = data.rules.reinstatementWaitDays;

  // While restricted, only options that would extend the restriction are offered.
  const activeEnd = active ? (active.endsAt ? new Date(active.endsAt).getTime() : Infinity) : null;
  const now = Date.now();
  const offered = EXCLUSION_LIST.filter((o) => {
    if (activeEnd === null) return true;
    const end = computeEndsAt(o.type, new Date(now));
    // Only offer options that extend meaningfully (by more than an hour).
    return (end?.getTime() ?? Infinity) > activeEnd + 3600_000;
  });
  const primary = active ? offered : offered.filter((o) => !o.extended);
  const extended = active ? [] : offered.filter((o) => o.extended);

  return (
    <div className="space-y-4">
      {active ? <ActiveRestriction ex={active} waitDays={waitDays} /> : null}

      {active && offered.length ? (
        <div>
          <h3 className="mb-2 text-[13px] font-semibold text-fg">Extend your restriction</h3>
          <p className="mb-3 text-[13px] text-fg-muted">You can make it longer at any time. It can never be made shorter.</p>
        </div>
      ) : null}

      {primary.length ? (
        <div className={cn('grid gap-3 sm:grid-cols-2', primary.length >= 4 ? 'lg:grid-cols-4' : 'lg:grid-cols-3')}>
          {primary.map((o) => (
            <OptionCard key={o.type} option={o} extendLabel={!!active} onSelect={() => setSelected(o.type)} />
          ))}
        </div>
      ) : null}

      {extended.length ? (
        <div className="rounded-xl border border-line bg-surface-1">
          <button
            type="button"
            className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left sm:px-5"
            aria-expanded={showMore}
            onClick={() => setShowMore((v) => !v)}
            data-testid="longer-exclusion"
          >
            <span>
              <span className="block text-[13px] font-semibold text-fg">Longer self-exclusion</span>
              <span className="block text-xs text-fg-subtle">3 months, 6 months, 1 year or indefinite</span>
            </span>
            <ChevronDown size={16} className={cn('shrink-0 text-fg-subtle transition-transform', showMore && 'rotate-180')} />
          </button>
          <AnimatePresence initial={false}>
            {showMore ? (
              <motion.div
                key="more"
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: DUR.standard, ease: EASE.out }}
                className="overflow-hidden"
              >
                <div className="grid gap-3 border-t border-line-soft p-3 sm:grid-cols-2 sm:p-4 lg:grid-cols-4">
                  {extended.map((o) => (
                    <OptionCard key={o.type} option={o} onSelect={() => setSelected(o.type)} />
                  ))}
                </div>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>
      ) : null}

      <ConfirmExclusionModal option={selected ? EXCLUSION_BY_TYPE[selected] : null} onClose={() => setSelected(null)} waitDays={waitDays} />
    </div>
  );
}

export function RestrictionHistory({ data }: { data: RpSummary }) {
  const past = data.history.filter((h) => h.id !== data.exclusion?.id);
  if (!past.length) return null;
  return (
    <Panel className="overflow-hidden">
      <div className="border-b border-line-soft px-4 py-3 text-[13px] font-semibold sm:px-5">Previous breaks & exclusions</div>
      <ul className="divide-y divide-line-soft">
        {past.map((h) => (
          <li key={h.id} className="flex flex-col gap-0.5 px-4 py-2.5 text-[13px] sm:flex-row sm:items-center sm:justify-between sm:px-5">
            <span className="font-medium text-fg">{h.label}</span>
            <span className="text-xs text-fg-subtle">
              {formatLongDateTime(h.startsAt)} → {h.endsAt ? formatLongDateTime(h.endsAt) : 'no end date'} ·{' '}
              {h.status === 'REINSTATED'
                ? 'reinstated'
                : h.endsAt && new Date(h.endsAt).getTime() <= Date.now()
                  ? 'completed'
                  : 'covered by a longer restriction'}
            </span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
