'use client';
import { motion } from 'framer-motion';
import { Tooltip } from '@/components/ui/tooltip';
import { cn } from '@/lib/cn';
import type { BaccaratShoeDto } from '@/server/services/baccarat/types';

/** Shoe status: shoe number, hand number, cards left and a penetration gauge with the cut card. */
export function ShoeMeter({ shoe }: { shoe: BaccaratShoeDto | null }) {
  const dealt = shoe?.cardsDealt ?? 0;
  const totalCards = shoe?.totalCards ?? 416;
  const cutAt = shoe ? Math.min(1, shoe.penetration) : 0.8;
  const pct = Math.min(1, dealt / totalCards);
  return (
    <div className="min-w-0 max-w-[260px] flex-1">
      <div className="flex items-baseline gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-white/55">
        <span>Shoe {shoe?.shoeNumber ?? 1}</span>
        <span className="text-white/20">·</span>
        <span className="tabular">{shoe?.roundsDealt ?? 0} {shoe?.roundsDealt === 1 ? 'hand' : 'hands'}</span>
      </div>
      <Tooltip content={shoe ? `${shoe.cardsRemaining} of ${shoe.totalCards} cards remain · cut card at ${Math.round(cutAt * 100)}%` : 'A fresh 8-deck shoe is shuffled on your first deal'}>
        <div className="mt-1.5 flex items-center gap-2">
          <div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-black/35 ring-1 ring-white/[0.06]">
            <motion.div
              className={cn('absolute inset-y-0 left-0 rounded-full', shoe?.cutCardReached ? 'bg-warn/80' : 'bg-white/45')}
              initial={false}
              animate={{ width: `${pct * 100}%` }}
              transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            />
            <div className="absolute inset-y-[-2px] w-[2px] rounded bg-warn" style={{ left: `${cutAt * 100}%` }} aria-hidden />
          </div>
          <span className="tabular w-9 text-right text-[11px] font-medium text-white/45">{shoe ? shoe.cardsRemaining : totalCards}</span>
        </div>
      </Tooltip>
      {shoe?.cutCardReached ? (
        <div className="mt-1 text-[11px] font-medium text-warn/90">Cut card reached — new shoe next hand</div>
      ) : null}
    </div>
  );
}

/** Dealing shoe graphic — the visual origin of every card. */
export function ShoeBox({ dealing }: { dealing: boolean }) {
  return (
    <div className="relative mt-0.5 h-[46px] w-[70px] shrink-0 sm:h-[54px] sm:w-[82px]" aria-hidden>
      <svg viewBox="0 0 82 54" className="absolute inset-0 h-full w-full overflow-visible">
        <defs>
          <linearGradient id="bac-shoe-body" x1="0" y1="0" x2="0.4" y2="1">
            <stop offset="0" stopColor="#2a2d36" />
            <stop offset="0.55" stopColor="#17191f" />
            <stop offset="1" stopColor="#0c0d11" />
          </linearGradient>
          <pattern id="bac-shoe-back" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="4" height="4" fill="#221a52" />
            <rect width="2" height="4" fill="#2a2160" />
          </pattern>
        </defs>
        {/* shadow */}
        <ellipse cx="44" cy="52" rx="38" ry="3" fill="#000" opacity="0.45" />
        {/* body */}
        <path d="M18 4 H78 a3 3 0 0 1 3 3 V48 a3 3 0 0 1 -3 3 H5 a3 3 0 0 1 -3 -3 V26 Z" fill="url(#bac-shoe-body)" stroke="#ffffff" strokeOpacity="0.1" />
        {/* top highlight */}
        <path d="M19 5 H77" stroke="#fff" strokeOpacity="0.12" />
        {/* mouth plate */}
        <path d="M6 27 L19 9 V46 H6 Z" fill="#0a0b0e" opacity="0.85" />
      </svg>
      {/* next card in the mouth */}
      <motion.div
        className="absolute left-[9%] top-[30%] h-[52%] w-[17%] rounded-[2px] border border-white/20 shadow-[0_2px_4px_rgba(0,0,0,0.5)]"
        style={{ background: 'repeating-linear-gradient(45deg, #2a2160 0 3px, #221a52 3px 6px)', transformOrigin: 'right center' }}
        animate={dealing ? { x: [0, -7, 0], rotate: [0, -4, 0] } : { x: 0, rotate: 0 }}
        transition={dealing ? { duration: 0.43, repeat: Infinity, ease: 'easeInOut' } : { duration: 0.2 }}
      />
      <div className="absolute bottom-[22%] right-[10%] text-[7px] font-bold tracking-[0.28em] text-white/25 sm:text-[8px]">NOVA</div>
    </div>
  );
}
