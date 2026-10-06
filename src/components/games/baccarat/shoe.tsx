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
        <span className="tabular">Hand {(shoe?.roundsDealt ?? 0) + (shoe?.cutCardReached ? 0 : 1)}</span>
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
    <div className="relative mr-1 mt-0.5 h-[46px] w-[64px] shrink-0 sm:h-[52px] sm:w-[74px]" aria-hidden>
      {/* card peeking out of the shoe mouth */}
      <motion.div
        className="absolute left-[6px] top-[9px] h-[30px] w-[22px] rounded-[3px] border border-white/15"
        style={{ background: 'repeating-linear-gradient(45deg, #2a2160 0 3px, #221a52 3px 6px)' }}
        animate={dealing ? { x: [0, -6, 0] } : { x: 0 }}
        transition={dealing ? { duration: 0.43, repeat: Infinity, ease: 'easeInOut' } : { duration: 0.2 }}
      />
      <div
        className="absolute inset-0 rounded-[8px] rounded-tl-[18px] border border-white/10"
        style={{
          background: 'linear-gradient(160deg, #23262e 0%, #15171c 55%, #0d0e12 100%)',
          boxShadow: '0 8px 18px -6px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.08)',
          clipPath: 'polygon(0 22%, 30% 0, 100% 0, 100% 100%, 0 100%)',
        }}
      />
      <div className="absolute bottom-[7px] right-[8px] h-[3px] w-[26px] rounded-full bg-white/10" />
      <div className="absolute bottom-[14px] right-[8px] text-[8px] font-bold tracking-[0.2em] text-white/25">NOVA</div>
    </div>
  );
}
