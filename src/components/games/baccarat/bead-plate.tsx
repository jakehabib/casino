'use client';
import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { beadPlateColumns, shoeCounts } from '@/engines/baccarat/roadmap';
import type { BaccaratBeadDto, BaccaratShoeDto } from '@/server/services/baccarat/types';
import { cn } from '@/lib/cn';
import { Tooltip } from '@/components/ui/tooltip';
import { SIDE_TONE } from './theme';

const ROWS = 6;

/**
 * Bead plate roadmap for the current shoe: 6 rows, filled column by column
 * (top→bottom, left→right). Each bead shows the winning total; naturals get
 * a small marker. Scrolls horizontally and keeps the latest bead in view.
 */
export function BeadPlate({ beads, shoe, loading }: { beads: BaccaratBeadDto[]; shoe: BaccaratShoeDto | null; loading?: boolean }) {
  const scroller = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [cell, setCell] = useState(30);

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => {
      setWidth(e.contentRect.width);
      setCell(e.contentRect.width < 420 ? 26 : 30);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const gap = 4;
  const fillCols = Math.max(12, Math.floor((width + gap) / (cell + gap)));
  const cols = beadPlateColumns(beads, ROWS, Math.max(fillCols, Math.ceil(beads.length / ROWS) + 1));
  const counts = shoeCounts(beads);

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const lastCol = Math.floor(Math.max(0, beads.length - 1) / ROWS);
    const target = (lastCol + 1) * (cell + gap) - el.clientWidth + cell;
    if (target > el.scrollLeft) el.scrollTo({ left: target, behavior: 'smooth' });
  }, [beads.length, cell]);

  const pct = (n: number) => (counts.total ? `${Math.round((n / counts.total) * 100)}%` : '—');

  return (
    <section className="surface-panel rounded-xl p-3 sm:p-4" aria-label="Bead plate" data-testid="bac-bead-plate">
      <header className="mb-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="flex items-baseline gap-2">
          <h2 className="text-sm font-semibold tracking-tight">Bead Plate</h2>
          <span className="text-xs text-fg-subtle">
            Shoe {shoe?.shoeNumber ?? 1} · {counts.total} {counts.total === 1 ? 'hand' : 'hands'}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <Stat tone="PLAYER" value={counts.player} pct={pct(counts.player)} />
          <Stat tone="BANKER" value={counts.banker} pct={pct(counts.banker)} />
          <Stat tone="TIE" value={counts.tie} pct={pct(counts.tie)} />
          <span className="ml-1 hidden items-center gap-1.5 rounded-md bg-surface-2 px-2 py-1 text-[11px] font-medium text-fg-muted sm:inline-flex">
            <span className="h-1.5 w-1.5 rounded-full bg-white" />
            Naturals <span className="tabular font-semibold text-fg">{counts.naturals}</span>
          </span>
        </div>
      </header>

      <div ref={scroller} className="overflow-x-auto pb-1">
        <div
          className="grid w-max grid-flow-col rounded-lg bg-bg-raised p-1.5 ring-1 ring-line"
          style={{ gridTemplateRows: `repeat(${ROWS}, ${cell}px)`, gridAutoColumns: `${cell}px`, gap }}
          role="grid"
          aria-rowcount={ROWS}
        >
          {cols.flatMap((col, c) =>
            col.map((b, r) => {
              const i = c * ROWS + r;
              return (
                <div key={i} className="relative flex items-center justify-center rounded-full bg-white/[0.025]" role="gridcell">
                  {b ? <Bead bead={b} index={i} latest={i === beads.length - 1} size={cell} /> : null}
                </div>
              );
            }),
          )}
        </div>
      </div>
      {!loading && beads.length === 0 ? (
        <p className="mt-2 text-xs text-fg-subtle">Results for this shoe appear here, top to bottom, column by column.</p>
      ) : null}
    </section>
  );
}

function Bead({ bead, index, latest, size }: { bead: BaccaratBeadDto; index: number; latest: boolean; size: number }) {
  const tone = SIDE_TONE[bead.outcome];
  const value = bead.outcome === 'BANKER' ? bead.bankerTotal : bead.playerTotal;
  return (
    <Tooltip content={`Hand ${index + 1}: ${bead.outcome === 'TIE' ? 'Tie' : `${tone.label} wins`} ${bead.playerTotal}–${bead.bankerTotal}${bead.natural ? ' · Natural' : ''}`}>
      <motion.div
        initial={latest ? { scale: 0.3, opacity: 0 } : false}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 480, damping: 22 }}
        className={cn('tabular relative flex items-center justify-center rounded-full font-bold text-white', tone.solid)}
        style={{
          width: size - 2,
          height: size - 2,
          fontSize: size * 0.43,
          boxShadow: `inset 0 1px 0 rgb(255 255 255 / 0.22), inset 0 -2px 3px rgb(0 0 0 / 0.25)${latest ? `, 0 0 0 2px ${tone.hex}55, 0 0 14px -2px ${tone.hex}` : ''}`,
        }}
        data-outcome={bead.outcome}
      >
        {value}
        {bead.natural ? <span className="absolute right-[1px] top-[1px] h-[6px] w-[6px] rounded-full bg-white ring-2 ring-black/25" /> : null}
      </motion.div>
    </Tooltip>
  );
}

function Stat({ tone, value, pct }: { tone: 'PLAYER' | 'BANKER' | 'TIE'; value: number; pct: string }) {
  const t = SIDE_TONE[tone];
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md bg-surface-2 py-1 pl-1 pr-2 text-[11px] font-medium text-fg-muted">
      <span className={cn('flex h-[18px] w-[18px] items-center justify-center rounded-full text-[10px] font-bold text-white', t.solid)}>{t.short}</span>
      <span className="tabular font-semibold text-fg">{value}</span>
      <span className="tabular text-fg-subtle">{pct}</span>
    </span>
  );
}
