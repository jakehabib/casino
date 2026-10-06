'use client';
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Activity, Users, Dices, ArrowDownToLine, ArrowUpFromLine, Wallet, RefreshCw, Sparkles } from 'lucide-react';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { formatCredits } from '@/lib/format';
import type { DashboardPayload } from '@/server/services/admin/dashboard';
import { StatCard } from '@/components/ui/stat-card';
import { Tabs } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState, EmptyState } from '@/components/ui/states';
import { IconButton } from '@/components/ui/button';
import { Credits, GAME_LABEL, PageHeader, Panel, Table, Td, Th } from './ui';

const n = (v: number) => v.toLocaleString('en-US');
const pct = (bps: number | null) => (bps === null ? '—' : `${(bps / 100).toFixed(2)}%`);

type Metric = 'rounds' | 'wagered' | 'players';
type Range = 'last24h' | 'last7d' | 'all';

export function AdminDashboard() {
  const q = useQuery({
    queryKey: ['admin', 'dashboard'],
    queryFn: () => api.get<DashboardPayload>('/api/admin/dashboard'),
    refetchInterval: 30_000,
  });
  const d = q.data;

  return (
    <div>
      <PageHeader
        eyebrow="Admin"
        title="Dashboard"
        description={d ? `Live platform overview · updated ${new Date(d.generatedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit' })}` : 'Live platform overview'}
        actions={
          <IconButton label="Refresh" tone="filled" onClick={() => q.refetch()} disabled={q.isFetching}>
            <RefreshCw size={15} className={cn(q.isFetching && 'animate-spin')} />
          </IconButton>
        }
      />
      {q.isError ? (
        <Panel>
          <ErrorState onRetry={() => q.refetch()} />
        </Panel>
      ) : !d ? (
        <DashboardSkeleton />
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 @2xl:grid-cols-3 @5xl:grid-cols-6">
            <StatCard
              label="Active now"
              icon={<Activity size={14} className="text-win" />}
              value={n(d.users.active15m)}
              sub={`${n(d.users.active24h)} in the last 24h`}
            />
            <StatCard label="Total users" icon={<Users size={14} />} value={n(d.users.total)} sub={`+${n(d.users.new24h)} today`} />
            <StatCard label="Games played" icon={<Dices size={14} />} value={n(d.games.total)} sub={`${n(d.games.last24h)} in the last 24h`} />
            <StatCard
              label="Credits wagered"
              icon={<ArrowDownToLine size={14} />}
              value={formatCredits(d.credits.wagered, { compact: true })}
              sub={`${formatCredits(d.credits.wagered24h, { compact: true })} in 24h`}
            />
            <StatCard
              label="Credits won"
              icon={<ArrowUpFromLine size={14} />}
              value={formatCredits(d.credits.won, { compact: true })}
              sub={`Realized RTP ${pct(d.credits.rtpBps)}`}
            />
            <StatCard
              label="Outstanding"
              icon={<Wallet size={14} />}
              value={formatCredits(d.credits.outstanding, { compact: true })}
              sub={`Across ${n(d.credits.wallets)} wallets`}
            />
          </div>

          <div className="grid gap-4 @4xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
            <ActivityPanel series={d.series} />
            <PopularityPanel perGame={d.perGame} />
          </div>

          <div className="grid gap-4 @4xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
            <VolumePanel rows={d.perGame.all} />
            <EconomyPanel credits={d.credits} />
          </div>
        </div>
      )}
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 @2xl:grid-cols-3 @5xl:grid-cols-6">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-[92px] rounded-xl" />
        ))}
      </div>
      <div className="grid gap-4 @4xl:grid-cols-[1.6fr_1fr]">
        <Skeleton className="h-[300px] rounded-xl" />
        <Skeleton className="h-[300px] rounded-xl" />
      </div>
    </div>
  );
}

/* ── 14-day activity (single series, columns) ───────────── */

function niceMax(v: number) {
  if (v <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const m = v / p;
  return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * p;
}

function ActivityPanel({ series }: { series: DashboardPayload['series'] }) {
  const [metric, setMetric] = useState<Metric>('rounds');
  const [hover, setHover] = useState<number | null>(null);
  const values = series.map((s) => s[metric]);
  const max = niceMax(Math.max(...values));
  const total = values.reduce((a, b) => a + b, 0);
  const fmt = (v: number) => (metric === 'wagered' ? formatCredits(v, { compact: true }) : n(v));
  const ticks = [max, max / 2, 0];
  const focus = hover ?? series.length - 1;
  const fs = series[focus];
  const dayLabel = (iso: string, long?: boolean) =>
    new Date(iso + 'T00:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', weekday: long ? 'short' : undefined, timeZone: 'UTC' });

  return (
    <Panel
      title="Activity · last 14 days"
      description="UTC days, from settled game history"
      actions={
        <Tabs
          size="sm"
          value={metric}
          onValueChange={(v) => setMetric(v as Metric)}
          items={[
            { value: 'rounds', label: 'Rounds' },
            { value: 'wagered', label: 'Wagered' },
            { value: 'players', label: 'Players' },
          ]}
        />
      }
    >
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <div>
          <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-fg-subtle">{dayLabel(fs.day, true)}</div>
          <div className="tabular mt-0.5 text-2xl font-semibold tracking-tight">{fmt(fs[metric])}</div>
        </div>
        <div className="text-right">
          <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-fg-subtle">14-day total</div>
          <div className="tabular mt-0.5 text-sm font-medium text-fg-muted">{metric === 'players' ? '—' : fmt(total)}</div>
        </div>
      </div>
      {total === 0 ? (
        <EmptyState className="py-10" title="No settled rounds yet" body="Activity appears here as soon as players finish their first rounds." />
      ) : (
        <div className="flex gap-2">
          <div className="flex h-[168px] flex-col justify-between pb-5 text-right text-[10px] text-fg-faint">
            {ticks.map((t) => (
              <span key={t} className="tabular -translate-y-1/2 leading-none first:translate-y-0 last:translate-y-0">
                {fmt(t)}
              </span>
            ))}
          </div>
          <div className="relative min-w-0 flex-1">
            <div className="pointer-events-none absolute inset-x-0 top-0 h-[148px]">
              {[0, 0.5, 1].map((f) => (
                <div key={f} className={cn('absolute inset-x-0 border-t', f === 1 ? 'border-line' : 'border-dashed border-line-soft')} style={{ top: `${f * 100}%` }} />
              ))}
            </div>
            <div className="relative flex h-[168px] items-stretch gap-[2px]" onMouseLeave={() => setHover(null)}>
              {series.map((s, i) => {
                const h = (s[metric] / max) * 100;
                const active = i === focus;
                return (
                  <button
                    type="button"
                    key={s.day}
                    onMouseEnter={() => setHover(i)}
                    onFocus={() => setHover(i)}
                    onBlur={() => setHover(null)}
                    aria-label={`${dayLabel(s.day)}: ${fmt(s[metric])}`}
                    className="group relative flex min-w-0 flex-1 flex-col outline-none"
                  >
                    <div className="relative h-[148px] w-full">
                      <div
                        className={cn(
                          'absolute inset-x-[18%] bottom-0 rounded-t-[4px] transition-[height,background-color] duration-300 ease-[var(--ease-out-quint)]',
                          active ? 'bg-accent' : 'bg-accent/45 group-hover:bg-accent/70',
                        )}
                        style={{ height: `${Math.max(h, s[metric] > 0 ? 1.5 : 0)}%` }}
                      />
                    </div>
                    <span className={cn('mt-1.5 h-3.5 truncate text-center text-[10px] leading-none', active ? 'text-fg-muted' : 'text-fg-faint', i % 2 === 1 && !active && 'max-sm:invisible')}>
                      {new Date(s.day + 'T00:00:00Z').getUTCDate()}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </Panel>
  );
}

/* ── Popularity (rounds per game) ───────────────────────── */

function PopularityPanel({ perGame }: { perGame: DashboardPayload['perGame'] }) {
  const [range, setRange] = useState<Range>('last24h');
  const rows = useMemo(() => [...perGame[range]].sort((a, b) => b.rounds - a.rounds), [perGame, range]);
  const total = rows.reduce((a, r) => a + r.rounds, 0);
  const max = Math.max(1, ...rows.map((r) => r.rounds));
  return (
    <Panel
      title="Game popularity"
      description="Rounds played per game"
      actions={
        <Tabs
          size="sm"
          value={range}
          onValueChange={(v) => setRange(v as Range)}
          items={[
            { value: 'last24h', label: '24h' },
            { value: 'last7d', label: '7d' },
            { value: 'all', label: 'All' },
          ]}
        />
      }
    >
      <ul className="space-y-3.5">
        {rows.map((r) => {
          const share = total ? (r.rounds / total) * 100 : 0;
          return (
            <li key={r.game} title={`${GAME_LABEL[r.game]}: ${n(r.rounds)} rounds (${share.toFixed(1)}%)`}>
              <div className="mb-1.5 flex items-baseline justify-between gap-3 text-[13px]">
                <span className="font-medium text-fg">{GAME_LABEL[r.game]}</span>
                <span className="tabular text-fg-muted">
                  {n(r.rounds)} <span className="ml-1 text-[11px] text-fg-subtle">{share.toFixed(share >= 10 || share === 0 ? 0 : 1)}%</span>
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-surface-3">
                <div className="h-full rounded-full bg-accent transition-[width] duration-500 ease-[var(--ease-out-quint)]" style={{ width: `${(r.rounds / max) * 100}%` }} />
              </div>
            </li>
          );
        })}
      </ul>
      <div className="mt-4 flex items-center justify-between border-t border-line-soft pt-3 text-xs text-fg-subtle">
        <span>Total</span>
        <span className="tabular font-medium text-fg-muted">{n(total)} rounds</span>
      </div>
    </Panel>
  );
}

/* ── Per-game volume ────────────────────────────────────── */

function VolumePanel({ rows }: { rows: DashboardPayload['perGame']['all'] }) {
  const max = Math.max(1, ...rows.map((r) => r.wagered));
  return (
    <Panel title="Volume by game" description="All time · credits wagered vs. paid out" flush>
      <Table minWidth={620}>
        <thead>
          <tr>
            <Th>Game</Th>
            <Th align="right">Rounds</Th>
            <Th>Wagered</Th>
            <Th align="right">Paid out</Th>
            <Th align="right">House net</Th>
            <Th align="right">RTP</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const net = r.wagered - r.payout;
            return (
              <tr key={r.game} className="transition-colors hover:bg-surface-2/50">
                <Td className="font-medium text-fg">{GAME_LABEL[r.game]}</Td>
                <Td align="right" className="tabular">
                  {n(r.rounds)}
                </Td>
                <Td className="w-[34%]">
                  <div className="flex items-center gap-2.5">
                    <div className="h-1.5 min-w-[40px] flex-1 overflow-hidden rounded-full bg-surface-3">
                      <div className="h-full rounded-full bg-accent/80" style={{ width: `${(r.wagered / max) * 100}%` }} />
                    </div>
                    <span className="tabular w-[72px] text-right text-fg">{formatCredits(r.wagered, { compact: true })}</span>
                  </div>
                </Td>
                <Td align="right" className="tabular">
                  {formatCredits(r.payout, { compact: true })}
                </Td>
                <Td align="right" className={cn('tabular', net > 0 ? 'text-fg' : net < 0 ? 'text-loss' : '')}>
                  {formatCredits(net, { compact: true })}
                </Td>
                <Td align="right" className="tabular">
                  {pct(r.rtpBps)}
                </Td>
              </tr>
            );
          })}
        </tbody>
      </Table>
    </Panel>
  );
}

function EconomyPanel({ credits }: { credits: DashboardPayload['credits'] }) {
  const items = [
    { label: 'Signup grants', value: credits.issued.signup },
    { label: 'Rewards claimed', value: credits.issued.rewards },
    { label: 'Admin adjustments', value: credits.issued.adjustments, signed: true },
  ];
  const houseNet = credits.wagered - credits.won;
  return (
    <Panel title="Credit economy" description="Play-money supply, all time">
      <div className="space-y-3">
        {items.map((i) => (
          <div key={i.label} className="flex items-center justify-between text-[13px]">
            <span className="text-fg-muted">{i.label}</span>
            <Credits value={i.value} signed={i.signed} />
          </div>
        ))}
        <div className="flex items-center justify-between border-t border-line-soft pt-3 text-[13px]">
          <span className="text-fg-muted">Net retained by games</span>
          <Credits value={houseNet} />
        </div>
        <div className="flex items-center justify-between text-[13px]">
          <span className="flex items-center gap-1.5 font-medium text-fg">
            <Sparkles size={13} className="text-accent" /> Outstanding balances
          </span>
          <Credits value={credits.outstanding} className="text-[15px]" />
        </div>
      </div>
    </Panel>
  );
}
