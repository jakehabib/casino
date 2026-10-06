'use client';
import { multiplierAt, timeForMultiplier } from '@/engines/crash/crash-math';
import type { CrashRoundDetailData } from '@/engines/crash/types';
import type { RoundDetail } from '@/lib/round-detail';
import { formatCredits } from '@/lib/format';
import { cn } from '@/lib/cn';
import { CreditIcon } from '@/components/ui/credit-icon';
import { CrashPill } from './history-strip';

/** Static mini chart of the round: curve to the crash point + own cash-out marker. */
function MiniCurve({ crashPoint, cashoutAt }: { crashPoint: number; cashoutAt: number | null }) {
  const W = 320;
  const H = 120;
  const pad = 10;
  const tEnd = Math.max(1, timeForMultiplier(Math.max(101, crashPoint)));
  const mMax = Math.max(1.5, crashPoint / 100) * 1.08;
  const x = (t: number) => pad + (t / tEnd) * (W - pad * 2);
  const y = (m: number) => H - pad - ((m - 1) / (mMax - 1)) * (H - pad * 2);
  const pts: string[] = [];
  for (let i = 0; i <= 60; i++) {
    const t = (tEnd * i) / 60;
    pts.push(`${x(t).toFixed(1)},${y(multiplierAt(t)).toFixed(1)}`);
  }
  const line = `M${pts.join(' L')}`;
  const area = `${line} L${x(tEnd).toFixed(1)},${H - pad} L${pad},${H - pad} Z`;
  const co = cashoutAt ? { cx: x(timeForMultiplier(cashoutAt)), cy: y(cashoutAt / 100) } : null;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-28 w-full" role="img" aria-label="Round curve">
      <defs>
        <linearGradient id="crd-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#7c5cff" stopOpacity="0.28" />
          <stop offset="1" stopColor="#7c5cff" stopOpacity="0" />
        </linearGradient>
      </defs>
      <line x1={pad} y1={H - pad} x2={W - pad} y2={H - pad} stroke="rgba(255,255,255,0.08)" />
      <path d={area} fill="url(#crd-fill)" />
      <path d={line} fill="none" stroke="#8e72ff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={x(tEnd)} cy={y(crashPoint / 100)} r="4" fill="#e86a6a" />
      {co ? (
        <>
          <circle cx={co.cx} cy={co.cy} r="5.5" fill="#3ddc97" stroke="#0a0b0e" strokeWidth="2" />
        </>
      ) : null}
    </svg>
  );
}

function Cell({ label, children, tone }: { label: string; children: React.ReactNode; tone?: 'win' | 'muted' }) {
  return (
    <div className="rounded-lg border border-line bg-surface-2/50 px-3 py-2">
      <div className="text-[10.5px] font-medium uppercase tracking-wider text-fg-subtle">{label}</div>
      <div className={cn('tabular mt-0.5 flex items-center gap-1 text-sm font-semibold', tone === 'win' ? 'text-win' : tone === 'muted' ? 'text-fg-muted' : 'text-fg')}>{children}</div>
    </div>
  );
}

/** Launch round detail for the history modal / fairness page. */
export function CrashRoundDetail({ detail }: { detail: RoundDetail<CrashRoundDetailData> }) {
  const d = detail.data;
  const won = d.status === 'CASHED_OUT';
  return (
    <div className="space-y-3">
      <div className="overflow-hidden rounded-xl border border-line bg-[#0d0e16]">
        <div className="flex items-center gap-2 px-3 pt-3">
          <span className="text-xs font-medium text-fg-subtle">Round #{d.roundNumber.toLocaleString('en-US')}</span>
          <span className="text-xs text-fg-faint">· Bet {d.slot === 0 ? 'A' : 'B'}</span>
          <span className="ml-auto">{d.crashPoint !== null ? <CrashPill x100={d.crashPoint} /> : <span className="text-xs text-fg-subtle">In progress</span>}</span>
        </div>
        {d.crashPoint !== null ? <MiniCurve crashPoint={d.crashPoint} cashoutAt={won ? d.cashoutAt : null} /> : <div className="h-6" />}
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Cell label="Bet">
          <CreditIcon size={13} />
          {formatCredits(d.amount)}
        </Cell>
        <Cell label="Auto cash-out" tone="muted">
          {d.autoCashout ? `${(d.autoCashout / 100).toFixed(2)}×` : 'Off'}
        </Cell>
        <Cell label="Cashed out" tone={won ? 'win' : 'muted'}>
          {won && d.cashoutAt ? `${(d.cashoutAt / 100).toFixed(2)}×` : d.status === 'REFUNDED' ? 'Refunded' : '—'}
        </Cell>
        <Cell label="Payout" tone={won ? 'win' : 'muted'}>
          <CreditIcon size={13} />
          {formatCredits(d.payout)}
        </Cell>
      </div>
      <p className="text-xs leading-relaxed text-fg-subtle">
        {d.status === 'CASHED_OUT'
          ? `Cashed out at ${((d.cashoutAt ?? 0) / 100).toFixed(2)}× before the launch failed at ${((d.crashPoint ?? 0) / 100).toFixed(2)}×.`
          : d.status === 'LOST'
            ? `The launch failed at ${((d.crashPoint ?? 0) / 100).toFixed(2)}× before a cash-out.`
            : d.status === 'REFUNDED'
              ? 'This round was voided and the stake was returned.'
              : 'This round has not finished yet.'}{' '}
        Crash point = HMAC-SHA256(seed, salt), committed by the seed hash before betting opened.
      </p>
    </div>
  );
}
