'use client';
import { formatCredits } from '@/lib/format';
import { formatPayX } from '@/engines/slots/public';
import { RulesSection } from '@/components/games/shared/game-shell';
import type { PublicSlotDefinition, SlotTheme } from './types';

/**
 * Info / paytable content generated from the machine definition. Pays are
 * shown both as × total bet and in Credits at the current bet.
 */
export function SlotPaytable({ def, theme, betLevel }: { def: PublicSlotDefinition; theme: SlotTheme; betLevel: number }) {
  const per = def.mode === 'lines' ? 'per line' : def.mode === 'ways' ? 'per way' : 'per cluster';
  const credits = (v: number) => formatCredits(Math.floor((betLevel * v) / 100));
  const sym = (id: string) => def.symbols.find((s) => s.id === id);
  return (
    <div className="space-y-5 text-fg-muted">
      <div className="grid grid-cols-3 gap-2 text-center">
        <Fact label="RTP" value={`${def.rtpTarget.toFixed(2)}%`} />
        <Fact label="Volatility" value={def.volatility.replace('-', ' ')} />
        <Fact label="Max win" value={`${def.maxWinX.toLocaleString('en-US')}×`} />
      </div>

      <RulesSection title={`Paytable · ${per}`}>
        <p className="text-[12px] text-fg-subtle">
          Values are multiples of the total bet{betLevel ? ` (Credits shown at your bet of ${formatCredits(betLevel)})` : ''}.
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          {def.paytable.map((row) => (
            <div key={row.symbol} className="flex items-center gap-3 rounded-lg border border-line bg-surface-2/60 p-2.5">
              <div className="h-12 w-12 shrink-0">{theme.renderSymbol(row.symbol, { state: 'idle', small: true })}</div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[12px] font-semibold text-fg">{sym(row.symbol)?.name ?? row.symbol}</div>
                <div className="mt-1 grid gap-x-3 gap-y-0.5 text-[12px]" style={{ gridTemplateColumns: 'auto 1fr auto' }}>
                  {(def.mode === 'cluster' ? row.pays.filter((_, i) => i % 2 === 0 || i === row.pays.length - 1) : row.pays).map((p) => (
                    <PayRow key={p.count} count={def.mode === 'cluster' ? `${p.count}+` : `×${p.count}`} x={formatPayX(p.value)} c={credits(p.value)} />
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      </RulesSection>

      <RulesSection title="Special symbols">
        <div className="grid gap-2 sm:grid-cols-2">
          {def.wilds.map((w) => (
            <SpecialRow key={w} theme={theme} id={w} name={sym(w)?.name ?? 'Wild'}>
              Substitutes for all paying symbols except the scatter{sym(w)?.multiplier ? `; multiplies wins it is part of ×${sym(w)!.multiplier}` : ''}.
              {def.expandingWilds === 'free-spins' ? ' Expands to fill its reel during free spins.' : ''}
            </SpecialRow>
          ))}
          <SpecialRow theme={theme} id={def.scatter.symbol} name={sym(def.scatter.symbol)?.name ?? 'Scatter'}>
            {def.scatter.pays.map((p) => `${p.count}: ${formatPayX(p.value)}`).join(' · ')}
            {def.scatter.freeSpins.length ? ` — awards ${def.scatter.freeSpins.map((p) => p.value).join(' / ')} free spins` : ''}.
          </SpecialRow>
          {def.expander ? (
            <SpecialRow theme={theme} id={def.expander.symbol} name={sym(def.expander.symbol)?.name ?? 'Expander'}>
              Bursts into a {def.expander.radius * 2 + 1}×{def.expander.radius * 2 + 1} block of wilds when it lands.
            </SpecialRow>
          ) : null}
          {def.relics ? (
            <SpecialRow theme={theme} id={def.relics.symbol} name={sym(def.relics.symbol)?.name ?? 'Relic'}>
              Free spins only. Collect {def.relics.thresholds.join(' / ')} for multipliers{' '}
              {def.relics.multipliers.slice(1).map((m) => `×${m}`).join(' / ')} and +{def.relics.spinsPerTier} spins per tier.
            </SpecialRow>
          ) : null}
        </div>
      </RulesSection>

      <RulesSection title="Features">
        <div className="space-y-2.5">
          {def.featureText.map((f) => (
            <div key={f.title}>
              <div className="text-[13px] font-semibold text-fg">{f.title}</div>
              <p className="text-[13px] leading-relaxed">{f.body}</p>
            </div>
          ))}
        </div>
      </RulesSection>

      {def.paylines?.length ? (
        <RulesSection title={`${def.paylines.length} paylines`}>
          <div className="grid grid-cols-4 gap-2 sm:grid-cols-5">
            {def.paylines.map((line, i) => (
              <div key={i} className="rounded-md border border-line bg-surface-2/60 p-1.5">
                <div className="mb-1 text-center text-[10px] font-semibold text-fg-subtle">{i + 1}</div>
                <div className="grid gap-[2px]" style={{ gridTemplateColumns: `repeat(${def.reels}, 1fr)` }}>
                  {Array.from({ length: def.rows }).flatMap((_, y) =>
                    line.map((row, r) => (
                      <span
                        key={`${r}-${y}`}
                        className="aspect-square rounded-[2px]"
                        style={{ background: row === y ? theme.lineColors[i % theme.lineColors.length] : 'var(--color-surface-4)' }}
                      />
                    )),
                  )}
                </div>
              </div>
            ))}
          </div>
        </RulesSection>
      ) : null}

      <RulesSection title="Fair play">
        <p className="text-[13px] leading-relaxed">
          Every spin is generated on the server from your provably fair seed pair and replayed on screen. Free spins use the bet that triggered them. A round
          (a paid spin plus its free spins) pays at most {def.maxWinX.toLocaleString('en-US')}× the bet. Malfunction voids all pays and plays. Play money only.
        </p>
      </RulesSection>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-line bg-surface-2/60 px-2 py-2">
      <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-fg-subtle">{label}</div>
      <div className="tabular mt-0.5 text-sm font-semibold capitalize text-fg">{value}</div>
    </div>
  );
}

function PayRow({ count, x, c }: { count: string; x: string; c: string }) {
  return (
    <>
      <span className="tabular font-semibold text-fg-muted">{count}</span>
      <span className="tabular text-fg">{x}</span>
      <span className="tabular text-right text-fg-subtle">{c}</span>
    </>
  );
}

function SpecialRow({ theme, id, name, children }: { theme: SlotTheme; id: string; name: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3 rounded-lg border border-line bg-surface-2/60 p-2.5">
      <div className="h-12 w-12 shrink-0">{theme.renderSymbol(id, { state: 'idle', small: true })}</div>
      <div className="min-w-0">
        <div className="text-[12px] font-semibold text-fg">{name}</div>
        <p className="mt-0.5 text-[12px] leading-snug">{children}</p>
      </div>
    </div>
  );
}
