import { useId } from 'react';

/** The Credits glyph — a minted coin with the Nova star. Play money only. */
export function CreditIcon({ size = 16, className }: { size?: number; className?: string }) {
  const id = `cr-${useId().replace(/:/g, '')}`;
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" className={className} aria-hidden>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#a48bff" />
          <stop offset="1" stopColor="#5b3fe0" />
        </linearGradient>
      </defs>
      <circle cx="10" cy="10" r="9" fill={`url(#${id})`} />
      <circle cx="10" cy="10" r="6.6" fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth="1" />
      <path d="M10 5.6 L11.2 8.8 L14.4 10 L11.2 11.2 L10 14.4 L8.8 11.2 L5.6 10 L8.8 8.8 Z" fill="#fff" />
    </svg>
  );
}
