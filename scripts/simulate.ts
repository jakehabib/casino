/**
 * NOVA slot simulator — Monte Carlo verification of each machine's math.
 *
 *   npm run simulate                                   # all slots, 1,000,000 rounds each
 *   npm run simulate -- --slot gilded-vault --spins 5000000
 *   npm run simulate -- --workers 4 --seed 42 --json
 *
 * A ROUND is one paid spin plus every free spin it triggers (played out in
 * full), so RTP / hit rate / volatility are measured per paid spin. Uses
 * FastRng (simulation only — live spins use the provably-fair FairRng), the
 * exact same SlotEngine as production, and worker_threads for throughput.
 */
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { availableParallelism } from 'node:os';
import { FastRng } from '@/engines/fairness/rng';
import { SLOT_DEFINITIONS, getSlotDefinition } from '@/engines/slots/definitions';
import { emptyStats, mergeStats, simulate, summarize, type SimStats } from '@/engines/slots/simulate';

interface Job {
  slotId: string;
  rounds: number;
  seed: number;
}

const CHUNK = 50_000;

if (!isMainThread) {
  const job = workerData as Job;
  const def = getSlotDefinition(job.slotId)!;
  const rng = new FastRng(job.seed);
  let st = emptyStats();
  let done = 0;
  while (done < job.rounds) {
    const n = Math.min(CHUNK, job.rounds - done);
    st = simulate(def, n, rng, st);
    done += n;
    parentPort!.postMessage({ type: 'progress', n });
  }
  parentPort!.postMessage({ type: 'done', stats: st });
} else {
  void main();
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function runWorker(job: Job, onProgress: (n: number) => void): Promise<SimStats> {
  return new Promise((resolve, reject) => {
    // Workers don't inherit tsx's loader hooks: register tsx inside the worker, then load this file.
    const boot = `import('tsx/esm/api').then(({ register }) => { register(); return import(${JSON.stringify(import.meta.url)}); })`;
    const w = new Worker(boot, { eval: true, workerData: job });
    w.on('message', (m: { type: string; n?: number; stats?: SimStats }) => {
      if (m.type === 'progress') onProgress(m.n!);
      else if (m.type === 'done') resolve(m.stats!);
    });
    w.on('error', reject);
    w.on('exit', (code) => code !== 0 && reject(new Error(`worker exited ${code}`)));
  });
}

const pct = (x: number, d = 2) => `${(x * 100).toFixed(d)}%`;
const num = (x: number) => x.toLocaleString('en-US');
const oneIn = (p: number) => (p > 0 ? `1 in ${num(Math.round(1 / p))}` : '—');

async function main() {
  const only = arg('slot');
  const rounds = Number((arg('spins') ?? '1000000').replace(/_/g, ''));
  const workers = Math.max(1, Number(arg('workers') ?? Math.max(1, availableParallelism() - 1)));
  const seed = Number(arg('seed') ?? 20261006);
  const json = process.argv.includes('--json');
  const defs = only ? [getSlotDefinition(only)].filter((d) => !!d) : SLOT_DEFINITIONS;
  if (defs.length === 0) {
    console.error(`Unknown slot "${only}". Known: ${SLOT_DEFINITIONS.map((d) => d.id).join(', ')}`);
    process.exit(1);
  }
  if (!Number.isFinite(rounds) || rounds <= 0) {
    console.error('--spins must be a positive number');
    process.exit(1);
  }

  const results: Record<string, ReturnType<typeof summarize> & { seconds: number; target: number; volatility: string; maxWinX: number }> = {};
  for (const def of defs) {
    const t0 = Date.now();
    const per = Math.ceil(rounds / workers);
    let progressed = 0;
    let lastPrint = 0;
    const jobs: Job[] = [];
    for (let i = 0; i < workers; i++) {
      const n = Math.min(per, rounds - i * per);
      if (n > 0) jobs.push({ slotId: def.id, rounds: n, seed: (seed + i * 7919 + def.id.length * 104729) >>> 0 });
    }
    const parts = await Promise.all(
      jobs.map((j) =>
        runWorker(j, (n) => {
          progressed += n;
          if (!json && process.stderr.isTTY && Date.now() - lastPrint > 250) {
            lastPrint = Date.now();
            process.stderr.write(`\r  ${def.name}: ${pct(progressed / rounds, 0)}   `);
          }
        }),
      ),
    );
    if (!json && process.stderr.isTTY) process.stderr.write('\r' + ' '.repeat(40) + '\r');
    const st = parts.reduce(mergeStats, emptyStats());
    const s = summarize(st);
    const seconds = (Date.now() - t0) / 1000;
    results[def.id] = { ...s, seconds, target: def.rtpTarget, volatility: def.volatility, maxWinX: def.maxWinX };

    if (json) continue;
    const delta = s.rtp - def.rtpTarget;
    const lines = [
      ``,
      `━━ ${def.name} (${def.id}) ━━ ${def.reels}×${def.rows} ${def.mode} · ${def.volatility} volatility · target ${def.rtpTarget.toFixed(2)}% · max win ${num(def.maxWinX)}×`,
      `  Rounds simulated     ${num(s.rounds)}  (${seconds.toFixed(1)}s, ${num(Math.round(s.rounds / seconds))}/s, ${jobs.length} workers)`,
      `  RTP                  ${s.rtp.toFixed(3)}%   95% CI ±${s.ci95.toFixed(3)}%   [${(s.rtp - s.ci95).toFixed(2)}%, ${(s.rtp + s.ci95).toFixed(2)}%]   Δ target ${delta >= 0 ? '+' : ''}${delta.toFixed(3)}%`,
      `    base game          ${s.baseRtp.toFixed(3)}%`,
      `    free spins         ${s.bonusRtp.toFixed(3)}%`,
      `  Hit frequency        ${pct(s.hitRate)}  (${oneIn(s.hitRate)})`,
      `  Bonus frequency      ${pct(s.bonusFrequency, 3)}  (${oneIn(s.bonusFrequency)})`,
      `  Avg bonus win        ${s.avgBonusWinX.toFixed(2)}× bet   (avg ${s.avgFreeSpins.toFixed(1)} free spins)`,
      `  Avg win (hits)       ${s.avgWinX.toFixed(2)}× bet`,
      `  Largest win          ${num(Math.round(s.maxWinX * 100) / 100)}× bet${s.capHits ? `   (max-win cap reached ${num(s.capHits)}×)` : ''}`,
      `  Volatility (σ)       ${s.stdDev.toFixed(2)}`,
      `  Win distribution (per round, × bet)`,
      ...s.buckets.map((b) => `    ${b.label.padEnd(12)} ${pct(b.pct, 3).padStart(9)}  ${num(b.count).padStart(12)}`),
    ];
    console.log(lines.join('\n'));
  }
  if (json) console.log(JSON.stringify(results, null, 2));
}
