'use client';
import Link from 'next/link';
import { useState, type ReactNode } from 'react';
import { Info, ShieldCheck, Volume2, VolumeX, Users } from 'lucide-react';
import { IconButton } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { Tooltip } from '@/components/ui/tooltip';
import { PlayDisabled, ConnectionBanner } from '@/components/ui/states';
import { usePlayStatus } from '@/hooks/use-play-status';
import { useGamePresence, usePresenceDetail, useConnectionState } from '@/hooks/use-socket';
import { useAudioPrefs } from '@/audio/use-audio';
import { formatDateTime } from '@/lib/format';
import { cn } from '@/lib/cn';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';

/**
 * GameShell — the shared frame for every game:
 *
 *   ┌ header: title · category · players · rules · fairness · sound ┐
 *   │ [controls 320px] [stage ..........................................] │  (desktop)
 *   │ [stage] / [controls] stacked                                       │  (mobile)
 *   └ footer slot (history strip / table)                                ┘
 *
 * It also enforces the UI side of the play gate: if the account cannot wager
 * (cooldown, self-exclusion, suspension, maintenance) the stage is replaced
 * by <PlayDisabled/>. The server enforces independently on every wager.
 */
export function GameShell({
  gameId,
  title,
  subtitle,
  rules,
  controls,
  stage,
  footer,
  className,
  stageClassName,
  controlsPosition = 'left',
  requireAuth = true,
  allowSpectate = false,
  blockedNote,
}: {
  gameId: string;
  title: string;
  subtitle?: string;
  rules: ReactNode;
  controls: ReactNode;
  stage: ReactNode;
  footer?: ReactNode;
  className?: string;
  stageClassName?: string;
  controlsPosition?: 'left' | 'bottom';
  requireAuth?: boolean;
  /** Crash: guests and locked users may watch the round but not bet. */
  allowSpectate?: boolean;
  /** Extra copy shown on the play-gate card (e.g. "your free spins are saved"). */
  blockedNote?: ReactNode;
}) {
  useGamePresence(gameId);
  const presence = usePresenceDetail();
  const conn = useConnectionState();
  const { loading, signedIn, play } = usePlayStatus();
  const [rulesOpen, setRulesOpen] = useState(false);
  const { prefs, setPrefs } = useAudioPrefs();
  const players = presence?.games?.[gameId] ?? 0;

  const blocked = signedIn && play && !play.canPlay;
  let body: ReactNode;
  if (loading) {
    body = (
      <div className="grid gap-3 lg:grid-cols-[320px_1fr]">
        <Skeleton className="h-[420px] rounded-xl" />
        <Skeleton className="h-[420px] rounded-xl" />
      </div>
    );
  } else if (requireAuth && !signedIn && !allowSpectate) {
    body = (
      <div className="mx-auto flex max-w-md flex-col items-center rounded-2xl border border-line bg-surface-1 px-6 py-12 text-center">
        <div className="text-lg font-semibold">Sign in to play {title}</div>
        <p className="mt-1.5 text-sm text-fg-muted">Create a free account and get 100,000 play-money Credits.</p>
        <div className="mt-5 flex gap-2">
          <Link href={`/login?next=/casino`}><Button variant="secondary">Sign in</Button></Link>
          <Link href="/register"><Button>Create account</Button></Link>
        </div>
      </div>
    );
  } else if (blocked && !allowSpectate) {
    body = <PlayDisabled code={play!.code!} until={play!.until} label={'label' in play! ? (play as { label?: string }).label : undefined} note={blockedNote} />;
  } else {
    body = (
      <div className={cn('grid gap-3', controlsPosition === 'left' ? 'lg:grid-cols-[320px_minmax(0,1fr)]' : 'grid-cols-1')}>
        <div className={cn('order-2 min-w-0', controlsPosition === 'left' && 'lg:order-1')}>
          {blocked ? <PlayDisabledCompact code={play!.code!} until={play!.until} /> : controls}
        </div>
        <div className={cn('order-1 min-w-0', controlsPosition === 'left' && 'lg:order-2', stageClassName)}>{stage}</div>
      </div>
    );
  }

  return (
    <div className={cn('mx-auto w-full max-w-[1320px] px-3 pt-3 sm:px-5 sm:pt-5', className)}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="truncate text-lg font-semibold tracking-tight sm:text-xl">{title}</h1>
          {subtitle ? <p className="truncate text-xs text-fg-subtle sm:text-[13px]">{subtitle}</p> : null}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {players > 0 ? (
            <span className="mr-1 hidden items-center gap-1.5 rounded-md bg-surface-2 px-2 py-1 text-xs font-medium text-fg-muted sm:flex">
              <span className="h-1.5 w-1.5 rounded-full bg-win" />
              <Users size={12} /> {players}
            </span>
          ) : null}
          <Tooltip content="How to play">
            <IconButton label="Rules and payouts" tone="filled" size="sm" onClick={() => setRulesOpen(true)}>
              <Info size={16} />
            </IconButton>
          </Tooltip>
          <Tooltip content="Provably fair">
            <Link href={`/fairness?game=${gameId}`}>
              <IconButton label="Fairness" tone="filled" size="sm">
                <ShieldCheck size={16} />
              </IconButton>
            </Link>
          </Tooltip>
          <Tooltip content={prefs.muted ? 'Unmute' : 'Mute'}>
            <IconButton label={prefs.muted ? 'Unmute sound' : 'Mute sound'} tone="filled" size="sm" onClick={() => setPrefs({ muted: !prefs.muted })} data-testid="game-mute">
              {prefs.muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
            </IconButton>
          </Tooltip>
        </div>
      </div>
      {conn !== 'connected' ? (
        <div className="mb-3">
          <ConnectionBanner state={conn} />
        </div>
      ) : null}
      {body}
      {footer && !(blocked && !allowSpectate) && !loading ? <div className="mt-3">{footer}</div> : null}
      <Modal open={rulesOpen} onOpenChange={setRulesOpen} title={`${title} — rules & payouts`} size="lg">
        <div className="prose-nova space-y-3 text-sm leading-relaxed text-fg-muted">{rules}</div>
      </Modal>
    </div>
  );
}

function PlayDisabledCompact({ code, until }: { code: string; until: string | null }) {
  return (
    <div className="rounded-xl border border-line bg-surface-1 p-4 text-sm">
      <div className="font-semibold">Betting disabled</div>
      <div className="mt-1 text-fg-muted">
        {code === 'COOLDOWN_ACTIVE' ? 'Your break is active' : code === 'SELF_EXCLUDED' ? 'Your self-exclusion is active' : 'Your account cannot place bets'}
        {until ? ` until ${formatDateTime(until)}` : ''}. You can still watch.
      </div>
      <Link href="/responsible-play" className="mt-2 inline-block text-[13px] font-medium text-accent">Manage account</Link>
    </div>
  );
}

/** Standard left-hand controls panel container. */
export function ControlsPanel({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('surface-panel flex flex-col gap-4 rounded-xl p-4', className)}>{children}</div>;
}

/** Standard stage container (the table / reels / chart). */
export function Stage({ children, className, style }: { children: ReactNode; className?: string; style?: React.CSSProperties }) {
  return (
    <div className={cn('relative overflow-hidden rounded-xl border border-line bg-surface-1', className)} style={style}>
      {children}
    </div>
  );
}

export function RulesSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="mb-1.5 text-[13px] font-semibold uppercase tracking-wider text-fg">{title}</h3>
      <div className="space-y-1.5">{children}</div>
    </section>
  );
}

export function PayTable({ rows }: { rows: [string, string][] }) {
  return (
    <div className="overflow-hidden rounded-lg border border-line">
      {rows.map(([a, b]) => (
        <div key={a} className="flex items-center justify-between border-b border-line-soft px-3 py-2 text-[13px] last:border-0">
          <span className="text-fg-muted">{a}</span>
          <span className="tabular font-semibold text-fg">{b}</span>
        </div>
      ))}
    </div>
  );
}
