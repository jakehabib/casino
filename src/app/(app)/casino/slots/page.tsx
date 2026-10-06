'use client';
import Link from 'next/link';
import { useQueries } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { ArrowRight, ShieldCheck, Sparkles, Lock, Trophy } from 'lucide-react';
import { GAME_ART } from '@/components/brand/game-art';
import { GAME_FACTS } from '@/components/lobby/game-tiles';
import { usePresenceDetail } from '@/hooks/use-socket';
import { useUser } from '@/hooks/use-me';
import { GAMES } from '@/lib/games';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { SLOT_DEFINITIONS } from '@/engines/slots/definitions';
import type { SlotStateResponse } from '@/server/services/slots/slot-service';
import type { Volatility } from '@/engines/slots/types';

const VOL: Record<Volatility, { label: string; level: number }> = {
  low: { label: 'Low', level: 1 },
  medium: { label: 'Medium', level: 2 },
  'medium-high': { label: 'Medium-high', level: 3 },
  high: { label: 'High', level: 4 },
};

/** /casino/slots — the three machines, side by side. */
export default function SlotsLobbyPage() {
  const user = useUser();
  const presence = usePresenceDetail();
  const slots = GAMES.filter((g) => g.category === 'Slots');
  const states = useQueries({
    queries: slots.map((g) => ({
      queryKey: ['slot-state', g.slotId],
      queryFn: () => api.get<SlotStateResponse>(`/api/games/slots/${g.slotId}/state`),
      enabled: !!user,
      staleTime: 15_000,
      refetchOnWindowFocus: false,
    })),
  });

  return (
    <div className="mx-auto max-w-[1240px] px-4 pb-10 pt-6 sm:px-6">
      <div className="flex flex-col gap-1">
        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-fg-subtle">Casino · Slots</div>
        <h1 className="text-2xl font-semibold tracking-tight">Three machines. Three engines.</h1>
        <p className="max-w-xl text-sm text-fg-muted">
          A classic line slot, a cascading ways machine and a cluster-pays bonus hunter — each with its own math, built and verified to the same standard.
        </p>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-3">
        {slots.map((g, i) => {
          const def = SLOT_DEFINITIONS.find((d) => d.id === g.slotId)!;
          const Art = GAME_ART[g.id];
          const state = states[i]?.data;
          const bonus = state?.bonus;
          const disabled = state ? !state.enabled : false;
          const vol = VOL[def.volatility];
          const players = presence?.games?.[g.id] ?? 0;
          const facts = (GAME_FACTS[g.id] ?? []).filter((f) => !f.includes('RTP'));
          return (
            <motion.div key={g.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06, duration: 0.35, ease: [0.22, 1, 0.36, 1] }}>
              <Link
                href={g.href}
                className={cn(
                  'group flex h-full flex-col overflow-hidden rounded-2xl border border-line bg-surface-1 transition-[border,transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:border-line-strong hover:shadow-2',
                  disabled && 'opacity-70',
                )}
                data-testid={`slot-card-${g.id}`}
              >
                <div className="relative aspect-[16/9] overflow-hidden">
                  <Art wide className="absolute inset-0 h-full w-full transition-transform duration-700 ease-[var(--ease-out-quint)] group-hover:scale-[1.04]" />
                  <div className="absolute inset-0 bg-gradient-to-t from-surface-1 via-transparent to-transparent" />
                  <div className="absolute left-3 top-3 flex gap-1.5">
                    {bonus ? (
                      <span className="flex items-center gap-1 rounded-md bg-gold px-2 py-0.5 text-[11px] font-bold text-[#2a1d05] shadow-glow-gold">
                        <Sparkles size={12} /> {bonus.remaining} free spins waiting
                      </span>
                    ) : null}
                    {disabled ? (
                      <span className="flex items-center gap-1 rounded-md bg-black/70 px-2 py-0.5 text-[11px] font-semibold text-white/85">
                        <Lock size={11} /> Unavailable
                      </span>
                    ) : null}
                  </div>
                  {players > 0 ? (
                    <span className="absolute right-3 top-3 flex items-center gap-1 rounded-md bg-black/55 px-2 py-0.5 text-[11px] font-semibold text-white/85 backdrop-blur">
                      <span className="h-1.5 w-1.5 rounded-full bg-win" /> {players} playing
                    </span>
                  ) : null}
                </div>
                <div className="flex flex-1 flex-col p-4 pt-1 sm:p-5 sm:pt-1">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-lg font-semibold tracking-tight">{g.name}</div>
                      <div className="mt-0.5 text-[13px] text-fg-subtle">{g.tagline}</div>
                    </div>
                  </div>
                  <p className="mt-2 text-[13px] leading-relaxed text-fg-muted md:min-h-[63px]">{g.description}</p>

                  <dl className="mt-4 divide-y divide-line-soft rounded-lg border border-line bg-surface-2/50 text-[13px]">
                    <Row label="RTP">
                      <span className="tabular font-semibold text-fg">{def.rtpSimulated.rtp.toFixed(2)}%</span>
                    </Row>
                    <Row label="Volatility">
                      <span className="flex items-center gap-2">
                        <span className="flex gap-0.5" aria-hidden>
                          {[1, 2, 3, 4].map((n) => (
                            <span key={n} className={cn('h-2.5 w-1.5 rounded-sm', n <= vol.level ? 'bg-fg' : 'bg-surface-4')} />
                          ))}
                        </span>
                        <span className="font-semibold text-fg">{vol.label}</span>
                      </span>
                    </Row>
                    <Row label="Max win">
                      <span className="tabular font-semibold text-fg">{def.maxWinX.toLocaleString('en-US')}× bet</span>
                    </Row>
                  </dl>

                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {facts.map((f) => (
                      <span key={f} className="rounded-md bg-surface-3 px-2 py-0.5 text-[11px] font-medium text-fg-muted">
                        {f}
                      </span>
                    ))}
                  </div>

                  <div className="mt-auto pt-5">
                    <span
                      className={cn(
                        'flex h-11 w-full items-center justify-center gap-2 rounded-lg text-sm font-semibold transition-colors',
                        bonus ? 'bg-gradient-to-b from-gold-bright to-gold text-[#2a1d05]' : 'bg-accent text-white group-hover:bg-accent-hover',
                      )}
                    >
                      {bonus ? 'Resume free spins' : 'Play'} <ArrowRight size={16} />
                    </span>
                  </div>
                </div>
              </Link>
            </motion.div>
          );
        })}
      </div>

      <div className="mt-8 grid gap-3 sm:grid-cols-3">
        <Info icon={<ShieldCheck size={16} />} title="Provably fair">
          Every grid, cascade and modifier comes from your seed pair. Verify any spin on the Fairness page.
        </Info>
        <Info icon={<Sparkles size={16} />} title="Free spins keep your bet">
          Free spins play at the bet that triggered them and survive a refresh — pick up where you left off.
        </Info>
        <Info icon={<Trophy size={16} />} title="Measured, not promised">
          RTP figures come from tens of millions of simulated rounds of the exact production engine.
        </Info>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 px-3 py-2">
      <dt className="text-fg-subtle">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function Info({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3 rounded-xl border border-line bg-surface-1 p-4">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-3 text-fg-muted">{icon}</div>
      <div>
        <div className="text-[13px] font-semibold text-fg">{title}</div>
        <p className="mt-0.5 text-[12.5px] leading-relaxed text-fg-muted">{children}</p>
      </div>
    </div>
  );
}
