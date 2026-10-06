import type { BaccaratOutcome } from './types';

export interface BeadEntry {
  outcome: BaccaratOutcome;
  playerTotal: number;
  bankerTotal: number;
  natural: boolean;
}

/**
 * Bead plate layout: fills top-to-bottom, then left-to-right (column-major),
 * `rows` beads per column, like a casino bead plate. Returns columns of
 * entries (the last column may be partially filled). Always at least
 * `minCols` columns so an empty plate still renders its grid.
 */
export function beadPlateColumns<T>(entries: readonly T[], rows = 6, minCols = 0): (T | null)[][] {
  const cols = Math.max(minCols, Math.ceil(entries.length / rows));
  const out: (T | null)[][] = [];
  for (let c = 0; c < cols; c++) {
    const col: (T | null)[] = [];
    for (let r = 0; r < rows; r++) col.push(entries[c * rows + r] ?? null);
    out.push(col);
  }
  return out;
}

export function shoeCounts(entries: readonly { outcome: BaccaratOutcome; natural?: boolean }[]) {
  let player = 0;
  let banker = 0;
  let tie = 0;
  let naturals = 0;
  for (const e of entries) {
    if (e.outcome === 'PLAYER') player++;
    else if (e.outcome === 'BANKER') banker++;
    else tie++;
    if (e.natural) naturals++;
  }
  return { player, banker, tie, naturals, total: entries.length };
}
