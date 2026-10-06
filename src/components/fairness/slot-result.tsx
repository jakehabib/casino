'use client';
import { useMemo, useState } from 'react';
import { cn } from '@/lib/cn';
import { formatCredits } from '@/lib/format';
import { verifySlotSpin } from '@/engines/slots/verify';
import { SLOT_DEFINITIONS, getSlotDefinition } from '@/engines/slots/definitions';
import type { SlotDefinition, SpinOutcome } from '@/engines/slots/types';

function symbolLabel(def: SlotDefinition, id: string) {
  const s = def.symbols.find((x) => x.id === id);
  return { short: (s?.name ?? id).replace(/[^A-Za-z0-9]/g, '').slice(0, 3).toUpperCase() || id.slice(0, 3), name: s?.name ?? id, kind: s?.kind ?? 'regular', tier: s?.tier };
}

function GridView({ def, grid, highlight }: { def: SlotDefinition; grid: string[][]; highlight: Set<string> }) {
  const rows = grid[0]?.length ?? 0;
  return (
    <div className="inline-grid gap-1 rounded-lg border border-line bg-bg-raised p-1.5" style={{ gridTemplateColumns: `repeat(${grid.length}, minmax(0, 1fr))` }} data-testid="slot-grid">
      {Array.from({ length: rows }, (_, row) =>
        grid.map((reel, r) => {
          const sym = symbolLabel(def, reel[row]);
          const hit = highlight.has(`${r}:${row}`);
          return (
            <span
              key={`${r}-${row}`}
              title={sym.name}
              className={cn(
                'flex h-9 w-10 items-center justify-center rounded-md text-[10px] font-bold tracking-wide sm:w-11',
                sym.kind === 'wild' ? 'bg-accent-soft text-accent' : sym.kind === 'scatter' ? 'bg-gold-soft text-gold' : sym.kind === 'special' ? 'bg-info/10 text-info' : sym.tier === 'premium' || sym.tier === 'high' ? 'bg-surface-3 text-fg' : 'bg-surface-2 text-fg-muted',
                hit && 'ring-2 ring-win',
              )}
              style={{ gridColumn: r + 1, gridRow: row + 1 }}
            >
              {sym.short}
            </span>
          );
        }),
      )}
    </div>
  );
}

export function SlotVerifierResult({ slotId, serverSeed, clientSeed, nonce, betLevel, bonusState }: { slotId: string; serverSeed: string; clientSeed: string; nonce: number | null; betLevel: string; bonusState: string }) {
  const [stepIdx, setStepIdx] = useState(0);
  const res = useMemo((): { ok: true; out: SpinOutcome; def: SlotDefinition } | { ok: false; msg: string } | null => {
    const id = slotId.trim() || 'gilded-vault';
    const def = getSlotDefinition(id);
    if (!def) return { ok: false, msg: `Unknown slot. Try: ${SLOT_DEFINITIONS.map((d) => d.id).join(', ')}.` };
    if (!serverSeed || !clientSeed || nonce === null) return null;
    const level = /^\d+$/.test(betLevel.trim()) ? Number(betLevel.trim()) : NaN;
    if (!Number.isSafeInteger(level) || level <= 0) return { ok: false, msg: 'Enter the bet level (a whole number of Credits).' };
    let bonus: unknown = null;
    if (bonusState.trim() && bonusState.trim() !== 'null') {
      try {
        bonus = JSON.parse(bonusState);
      } catch {
        return { ok: false, msg: 'Bonus state must be valid JSON (or empty for a base-game spin).' };
      }
    }
    try {
      return { ok: true, out: verifySlotSpin(id, serverSeed, clientSeed, nonce, level, bonus), def };
    } catch (e) {
      return { ok: false, msg: e instanceof Error ? e.message : 'Could not evaluate this spin.' };
    }
  }, [slotId, serverSeed, clientSeed, nonce, betLevel, bonusState]);

  if (!res) return <p className="text-[13px] text-fg-subtle">Enter a server seed, client seed, nonce, slot and bet level.</p>;
  if (!res.ok) return <p className="text-[13px] text-fg-subtle">{res.msg}</p>;
  const { out, def } = res;
  const step = out.steps[Math.min(stepIdx, out.steps.length - 1)];
  const highlight = new Set(step.wins.flatMap((w) => w.positions.map(([r, row]) => `${r}:${row}`)));
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <div className="text-[13px] font-medium text-fg">{def.name}{out.isFreeSpin ? ' · free spin' : ''}</div>
          <div className="text-xs text-fg-subtle">Bet level {formatCredits(out.betLevel)}</div>
        </div>
        <div className="text-right">
          <div className="text-[11px] text-fg-subtle">Total win</div>
          <div className={cn('tabular text-2xl font-semibold', out.totalWin > 0 ? 'text-win' : 'text-fg')} data-testid="slot-win">
            {formatCredits(out.totalWin)}
          </div>
        </div>
      </div>
      {out.steps.length > 1 ? (
        <div className="flex flex-wrap gap-1">
          {out.steps.map((s, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setStepIdx(i)}
              className={cn('tabular h-7 rounded-md border px-2 text-[11px] font-medium', i === stepIdx ? 'border-fg-muted/50 bg-surface-3 text-fg' : 'border-line text-fg-muted hover:text-fg')}
            >
              {i === 0 ? 'Landed' : `Cascade ${i}`} · {formatCredits(s.stepWin)}
            </button>
          ))}
        </div>
      ) : null}
      <div className="overflow-x-auto">
        <GridView def={def} grid={step.grid} highlight={highlight} />
      </div>
      {step.wins.length ? (
        <ul className="space-y-1 text-xs text-fg-muted">
          {step.wins.map((w, i) => (
            <li key={i} className="flex justify-between gap-3">
              <span>
                {symbolLabel(def, w.symbol).name} · {w.kind === 'line' ? `line ${(w.lineIndex ?? 0) + 1}, ${w.count} in a row` : w.kind === 'ways' ? `${w.count} reels, ${w.ways} ways` : w.kind === 'cluster' ? `cluster of ${w.count}` : `${w.count} scatters`}
                {w.multiplier > 1 ? ` · ×${w.multiplier}` : ''}
              </span>
              <span className="tabular text-fg">{formatCredits(w.amount)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-fg-subtle">No wins on this {stepIdx === 0 ? 'grid' : 'cascade'}.</p>
      )}
      {out.features.length ? (
        <div className="flex flex-wrap gap-1">
          {out.features.map((f) => (
            <span key={f} className="rounded bg-surface-3 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-fg-muted">
              {f.replace(/_/g, ' ').toLowerCase()}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}
