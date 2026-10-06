'use client';
import { useQuery } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import type { RoundDetail } from '@/lib/round-detail';
import { GAMES, GAME_LABEL, type GameKey } from '@/lib/games';
import { formatCredits } from '@/lib/format';
import { cn } from '@/lib/cn';
import { Modal } from '@/components/ui/modal';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/states';
import { GameResultBadge } from '@/components/ui/result-badge';
import { formatLongDateTime } from '@/components/responsible-play/options';
import { ROUND_DETAIL_REGISTRY, roundDetailUrl } from './round-detail-registry';
import { FairnessBlock } from './fairness-block';

export interface RoundRef {
  game: GameKey;
  id: string;
  variant?: string | null;
}

export function gameName(game: GameKey, variant?: string | null) {
  if (game === 'SLOTS' && variant) return GAMES.find((g) => g.slotId === variant)?.name ?? 'Slots';
  if (game === 'CRASH') return GAMES.find((g) => g.key === 'CRASH')?.name ?? 'Crash';
  return GAME_LABEL[game];
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'win' | 'muted' }) {
  return (
    <div className="min-w-0 bg-surface-1 px-3.5 py-3">
      <div className="text-[11px] font-medium text-fg-subtle">{label}</div>
      <div className={cn('tabular mt-0.5 truncate text-[15px] font-semibold', tone === 'win' ? 'text-win' : tone === 'muted' ? 'text-fg-muted' : 'text-fg')}>{value}</div>
    </div>
  );
}

function Body({ round }: { round: RoundRef }) {
  const q = useQuery({
    queryKey: ['round-detail', round.game, round.id],
    queryFn: () => api.get<RoundDetail<unknown>>(roundDetailUrl(round.game, round.id)),
    staleTime: 60_000,
    retry: (n, e) => !(e instanceof ApiError && (e.status === 404 || e.status === 403)) && n < 2,
  });
  if (q.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-16 rounded-xl" />
        <Skeleton className="h-52 rounded-xl" />
        <Skeleton className="h-32 rounded-xl" />
      </div>
    );
  }
  if (q.isError || !q.data) {
    const notFound = q.error instanceof ApiError && q.error.status === 404;
    return (
      <ErrorState
        title={notFound ? 'Round details unavailable' : 'Couldn’t load this round'}
        body={notFound ? 'This round’s details can’t be shown right now. Its result is still recorded in your history and wallet.' : 'Please try again in a moment.'}
        onRetry={notFound ? undefined : () => void q.refetch()}
      />
    );
  }
  const d = q.data;
  const Visual = ROUND_DETAIL_REGISTRY[d.game];
  return (
    <div className="space-y-4" data-testid="round-detail">
      <div className="flex flex-wrap items-center gap-2 text-[13px] text-fg-muted">
        <GameResultBadge tone={d.net > 0 ? 'win' : d.net < 0 ? 'loss' : 'push'}>{d.net > 0 ? 'Win' : d.net < 0 ? 'Loss' : d.payout > 0 ? 'Push' : 'No win'}</GameResultBadge>
        <span className="min-w-0 truncate">{d.summary}</span>
      </div>
      <div className="grid grid-cols-3 gap-px overflow-hidden rounded-xl border border-line bg-line">
        <Stat label="Wager" value={formatCredits(d.wager)} />
        <Stat label="Payout" value={formatCredits(d.payout)} tone={d.payout > 0 ? undefined : 'muted'} />
        <Stat label="Net" value={formatCredits(d.net, { sign: true })} tone={d.net > 0 ? 'win' : 'muted'} />
      </div>
      <div className="rounded-xl border border-line bg-surface-1 p-3 sm:p-4">
        <Visual detail={d} />
      </div>
      <FairnessBlock detail={d} />
    </div>
  );
}

export function RoundDetailModal({ round, createdAt, onClose }: { round: RoundRef | null; createdAt?: string; onClose: () => void }) {
  return (
    <Modal
      open={!!round}
      onOpenChange={(o) => (!o ? onClose() : undefined)}
      size="xl"
      title={round ? gameName(round.game, round.variant) : ''}
      description={createdAt ? formatLongDateTime(createdAt) : undefined}
    >
      {round ? <Body round={round} /> : null}
    </Modal>
  );
}
