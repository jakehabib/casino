'use client';
import { motion } from 'framer-motion';
import { cn } from '@/lib/cn';
import { SPRING } from '@/lib/motion';

/**
 * PlayingCard — crisp vector card used by Blackjack and Baccarat.
 * `code` like "AS", "TD"; null renders the face-down back.
 * Flip animates rotateY when a hidden card becomes revealed.
 */
const SUIT_GLYPH: Record<string, string> = { S: '♠', H: '♥', D: '♦', C: '♣' };
const RANK_LABEL: Record<string, string> = { T: '10', J: 'J', Q: 'Q', K: 'K', A: 'A' };

export type CardSize = 'sm' | 'md' | 'lg';
const DIMS: Record<CardSize, { w: number; h: number; corner: number; pip: number }> = {
  sm: { w: 56, h: 80, corner: 13, pip: 26 },
  md: { w: 72, h: 102, corner: 16, pip: 34 },
  lg: { w: 88, h: 124, corner: 19, pip: 42 },
};

function CardFace({ code, size }: { code: string; size: CardSize }) {
  const rank = RANK_LABEL[code[0]] ?? code[0];
  const suit = SUIT_GLYPH[code[1]];
  const red = code[1] === 'H' || code[1] === 'D';
  const d = DIMS[size];
  const color = red ? '#c62f3d' : '#16181d';
  const face = ['J', 'Q', 'K'].includes(code[0]);
  return (
    <div className="absolute inset-0 overflow-hidden rounded-[9%/6.5%] bg-[#fbfaf7] [backface-visibility:hidden]" style={{ boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.08)' }}>
      <div className="absolute left-[8%] top-[5%] flex flex-col items-center leading-none" style={{ color }}>
        <span className="font-bold tracking-tighter" style={{ fontSize: d.corner }}>{rank}</span>
        <span style={{ fontSize: d.corner * 0.9, marginTop: 1 }}>{suit}</span>
      </div>
      <div className="absolute bottom-[5%] right-[8%] flex rotate-180 flex-col items-center leading-none" style={{ color }}>
        <span className="font-bold tracking-tighter" style={{ fontSize: d.corner }}>{rank}</span>
        <span style={{ fontSize: d.corner * 0.9, marginTop: 1 }}>{suit}</span>
      </div>
      <div className="absolute inset-0 flex items-center justify-center" style={{ color }}>
        {face ? (
          <div className="flex h-[58%] w-[56%] flex-col items-center justify-center rounded-[6px] border" style={{ borderColor: red ? '#c62f3d40' : '#16181d30', background: red ? '#c62f3d0d' : '#16181d0a' }}>
            <span className="font-serif font-bold" style={{ fontSize: d.pip * 0.95 }}>{rank}</span>
            <span style={{ fontSize: d.pip * 0.55, marginTop: -2 }}>{suit}</span>
          </div>
        ) : (
          <span style={{ fontSize: code[0] === 'A' ? d.pip * 1.35 : d.pip }}>{suit}</span>
        )}
      </div>
    </div>
  );
}

function CardBack() {
  return (
    <div className="absolute inset-0 overflow-hidden rounded-[9%/6.5%] bg-[#1b1640] [backface-visibility:hidden] [transform:rotateY(180deg)]" style={{ boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.08)' }}>
      <div className="absolute inset-[6%] rounded-[6px] border border-white/15" style={{ background: 'repeating-linear-gradient(45deg, #2a2160 0 4px, #221a52 4px 8px)' }} />
      <div className="absolute inset-0 flex items-center justify-center">
        <svg viewBox="0 0 24 24" width="38%" height="38%" aria-hidden>
          <path d="M12 2 L14.2 9.8 L22 12 L14.2 14.2 L12 22 L9.8 14.2 L2 12 L9.8 9.8 Z" fill="#a48bff" opacity="0.9" />
        </svg>
      </div>
    </div>
  );
}

export function PlayingCard({ code, size = 'md', className, highlight, dim, style }: { code: string | null; size?: CardSize; className?: string; highlight?: 'win' | 'gold' | null; dim?: boolean; style?: React.CSSProperties }) {
  const d = DIMS[size];
  const faceUp = code !== null;
  return (
    <div className={cn('relative shrink-0 [perspective:800px]', className)} style={{ width: d.w, height: d.h, ...style }}>
      <motion.div
        className="relative h-full w-full [transform-style:preserve-3d]"
        initial={false}
        animate={{ rotateY: faceUp ? 0 : 180 }}
        transition={SPRING.card}
        style={{
          filter: dim ? 'brightness(0.55) saturate(0.6)' : undefined,
          transition: 'filter 300ms',
        }}
      >
        {faceUp ? <CardFace code={code} size={size} /> : <div className="absolute inset-0 [backface-visibility:hidden]" />}
        <CardBack />
      </motion.div>
      <div
        className={cn(
          'pointer-events-none absolute inset-0 rounded-[9%/6.5%] transition-shadow duration-300',
          highlight === 'win' && 'shadow-[0_0_0_2px_#3ddc97,0_0_24px_-2px_#3ddc9799]',
          highlight === 'gold' && 'shadow-[0_0_0_2px_#e2b456,0_0_28px_-2px_#e2b456aa]',
          !highlight && 'shadow-[0_2px_4px_rgba(0,0,0,0.35),0_10px_20px_-8px_rgba(0,0,0,0.6)]',
        )}
      />
    </div>
  );
}

export const CARD_DIMS = DIMS;
