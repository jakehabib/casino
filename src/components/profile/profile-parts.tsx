'use client';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { EyeOff, Lock } from 'lucide-react';
import { Avatar } from '@/components/ui/avatar';
import { LevelBadge, RoleBadge } from '@/components/ui/level-badge';
import { StatCard } from '@/components/ui/stat-card';
import { CreditIcon } from '@/components/ui/credit-icon';
import { GAME_ART } from '@/components/brand/game-art';
import { cn } from '@/lib/cn';
import { formatCredits } from '@/lib/format';
import { TIER_LABEL, type LevelTier } from '@/lib/levels';
import type { FavoriteGame } from '@/server/services/profile/privacy';

export function ProfileHero({
  user,
  tier,
  meta,
  actions,
  children,
}: {
  user: { avatarUrl: string | null; username: string; displayName: string; role: string; level: number };
  tier: LevelTier;
  meta?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <section className="relative overflow-hidden rounded-2xl border border-line bg-surface-1" data-testid="profile-hero">
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(90%_140%_at_0%_0%,#7c5cff1c_0%,transparent_55%)]" />
      <div aria-hidden className="noise pointer-events-none absolute inset-0 opacity-60" />
      <div className="relative flex flex-col gap-5 p-5 sm:flex-row sm:items-center sm:p-6">
        <div className="flex min-w-0 flex-1 items-center gap-4">
          <div className="relative shrink-0">
            <Avatar avatarUrl={user.avatarUrl} name={user.username} size={76} className="ring-1 ring-line-strong sm:hidden" />
            <Avatar avatarUrl={user.avatarUrl} name={user.username} size={88} className="hidden ring-1 ring-line-strong sm:inline-flex" />
            <LevelBadge level={user.level} size="md" className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 shadow-2" />
          </div>
          <div className="min-w-0">
            <div className="flex min-w-0 items-center gap-2">
              <h1 className="truncate text-[22px] font-semibold tracking-tight sm:text-2xl">{user.displayName}</h1>
              <RoleBadge role={user.role} />
            </div>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-fg-subtle">
              <span>@{user.username}</span>
              <span className="text-fg-faint">·</span>
              <span className={cn('font-medium', tier === 'neutral' ? 'text-fg-muted' : tier === 'gold' || tier === 'prestige' ? 'text-gold' : 'text-fg-muted')}>{TIER_LABEL[tier]} tier</span>
            </div>
            {meta ? <div className="mt-2.5 flex flex-wrap items-center gap-1.5">{meta}</div> : null}
          </div>
        </div>
        {actions ? <div className="flex shrink-0 gap-2">{actions}</div> : null}
      </div>
      {children ? <div className="relative border-t border-line px-5 py-4 sm:px-6">{children}</div> : null}
    </section>
  );
}

export function MetaChip({ icon, children, href }: { icon?: ReactNode; children: ReactNode; href?: string }) {
  const cls = 'inline-flex h-7 items-center gap-1.5 rounded-md border border-line bg-surface-2 px-2.5 text-xs font-medium text-fg-muted';
  if (href)
    return (
      <Link href={href} className={cn(cls, 'transition-colors hover:border-line-strong hover:text-fg')}>
        {icon}
        {children}
      </Link>
    );
  return (
    <span className={cls}>
      {icon}
      {children}
    </span>
  );
}

export function XpProgress({ level, xpIntoLevel, xpForNext, lifetimeXp }: { level: number; xpIntoLevel: number; xpForNext: number; lifetimeXp: number }) {
  const pct = xpForNext ? Math.min(100, (xpIntoLevel / xpForNext) * 100) : 100;
  return (
    <div data-testid="xp-progress">
      <div className="flex items-end justify-between gap-3">
        <div>
          <div className="text-2xs font-semibold uppercase tracking-[0.12em] text-fg-subtle">Progress to level {xpForNext ? level + 1 : level}</div>
          <div className="tabular mt-1 text-sm font-semibold text-fg">
            {xpForNext ? (
              <>
                {formatCredits(xpIntoLevel)} <span className="font-normal text-fg-subtle">/ {formatCredits(xpForNext)} XP</span>
              </>
            ) : (
              'Max level reached'
            )}
          </div>
        </div>
        <div className="text-right text-xs text-fg-subtle">
          <span className="tabular font-medium text-fg-muted">{formatCredits(lifetimeXp)}</span> lifetime XP
        </div>
      </div>
      <div className="mt-2.5 h-2 overflow-hidden rounded-full bg-surface-4" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)} aria-label="Level progress">
        <div className="h-full rounded-full bg-gradient-to-r from-accent to-[#a48bff] shadow-[0_0_12px_#7c5cff66] transition-[width] duration-700 ease-[var(--ease-out-quint)]" style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-2 text-xs text-fg-subtle">XP is earned from play-money wagering — 1 XP for every 10 Credits wagered. Winning isn’t required.</p>
    </div>
  );
}

export function Credits({ value, sign }: { value: number; sign?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <CreditIcon size={15} className="shrink-0" />
      {formatCredits(value, { sign, compact: Math.abs(value) >= 10_000_000 })}
    </span>
  );
}

export function HiddenStat({ label, reason = 'Hidden by player' }: { label: string; reason?: string }) {
  return (
    <StatCard
      label={label}
      tone="muted"
      value={
        <span className="inline-flex items-center gap-1.5 text-base text-fg-faint">
          <EyeOff size={15} /> Hidden
        </span>
      }
      sub={reason}
    />
  );
}

export function FavoriteGameCard({ game, sub }: { game: FavoriteGame | null; sub?: ReactNode }) {
  const Art = game ? GAME_ART[game.id] : undefined;
  if (!game) return <StatCard label="Favourite game" value={<span className="text-fg-subtle">—</span>} sub="Play a few rounds" />;
  return (
    <Link href={game.href} className="group flex items-center gap-3 rounded-xl border border-line bg-surface-1 p-3 pr-4 transition-colors hover:border-line-strong hover:bg-surface-2">
      <span className="relative h-14 w-14 shrink-0 overflow-hidden rounded-lg border border-line bg-surface-3">{Art ? <Art className="absolute inset-0 h-full w-full" /> : null}</span>
      <span className="min-w-0">
        <span className="block text-xs font-medium text-fg-subtle">Favourite game</span>
        <span className="mt-0.5 block truncate text-[15px] font-semibold text-fg group-hover:text-white">{game.name}</span>
        <span className="block truncate text-xs text-fg-subtle">{sub ?? `${game.plays.toLocaleString('en-US')} rounds played`}</span>
      </span>
    </Link>
  );
}

export function PrivacyNotice({ kind, self }: { kind: 'PRIVATE' | 'LIMITED'; self?: boolean }) {
  return (
    <div className="flex flex-col items-center rounded-2xl border border-line bg-surface-1 px-6 py-12 text-center" data-testid={`privacy-${kind.toLowerCase()}`}>
      <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl border border-line bg-surface-2 text-fg-subtle">{kind === 'PRIVATE' ? <Lock size={18} /> : <EyeOff size={18} />}</div>
      <div className="text-sm font-semibold text-fg">{kind === 'PRIVATE' ? 'This player keeps their stats private' : 'Detailed stats are limited'}</div>
      <p className="mt-1 max-w-sm text-[13px] text-fg-muted">
        {kind === 'PRIVATE'
          ? 'Only their name, avatar and level are visible to other players.'
          : 'This player shares when they joined and how many games they’ve played — nothing more.'}
      </p>
      {self ? (
        <Link href="/settings#privacy" className="mt-4 text-[13px] font-medium text-accent hover:text-accent-hover">
          Change privacy settings
        </Link>
      ) : null}
    </div>
  );
}

export function SectionTitle({ title, sub, action }: { title: string; sub?: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-3 flex items-end justify-between gap-3">
      <div>
        <h2 className="text-[15px] font-semibold tracking-tight text-fg">{title}</h2>
        {sub ? <p className="mt-0.5 text-[13px] text-fg-subtle">{sub}</p> : null}
      </div>
      {action}
    </div>
  );
}
