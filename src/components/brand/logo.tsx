import { useId } from 'react';
import { cn } from '@/lib/cn';

/**
 * NOVA brand marks. The mark is a four-point star bursting through an orbit —
 * a "new star". All brand assets live here + src/app/icon.svg + lib/branding.ts.
 */
export function LogoMark({ size = 28, className }: { size?: number; className?: string }) {
  // Unique gradient id per instance: a gradient defined inside a display:none
  // SVG (e.g. the hidden desktop sidebar) would otherwise break visible copies.
  const id = `nova-mark-${useId().replace(/:/g, '')}`;
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" className={className} aria-hidden>
      <defs>
        <linearGradient id={id} x1="4" y1="2" x2="28" y2="30" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#b6a3ff" />
          <stop offset="0.55" stopColor="#7c5cff" />
          <stop offset="1" stopColor="#5232e6" />
        </linearGradient>
      </defs>
      <rect x="1" y="1" width="30" height="30" rx="9" fill="#14121f" />
      <rect x="1.5" y="1.5" width="29" height="29" rx="8.5" fill="none" stroke={`url(#${id})`} strokeOpacity="0.45" />
      <ellipse cx="16" cy="16" rx="11" ry="4.6" fill="none" stroke={`url(#${id})`} strokeWidth="1.6" transform="rotate(-28 16 16)" opacity="0.9" />
      <path d="M16 5.5 L18.1 13.9 L26.5 16 L18.1 18.1 L16 26.5 L13.9 18.1 L5.5 16 L13.9 13.9 Z" fill={`url(#${id})`} />
      <circle cx="16" cy="16" r="1.6" fill="#fff" />
    </svg>
  );
}

export function Wordmark({ className, height = 18 }: { className?: string; height?: number }) {
  // Custom geometric letterforms: N, star-O, V, A.
  return (
    <svg height={height} viewBox="0 0 92 20" className={cn('text-fg', className)} aria-label="NOVA" role="img">
      <path d="M1 19V1h3.2l9.2 12.6V1h3.4v18h-3.1L4.4 6.3V19z" fill="currentColor" />
      <g transform="translate(31 10)">
        <circle r="8.6" fill="none" stroke="currentColor" strokeWidth="3.2" />
        <path d="M0 -4.6 L1.1 -1.1 L4.6 0 L1.1 1.1 L0 4.6 L-1.1 1.1 L-4.6 0 L-1.1 -1.1 Z" fill="#8e72ff" />
      </g>
      <path d="M44 1h3.6l5.4 13.9L58.4 1H62l-7.3 18h-3.4z" fill="currentColor" />
      <path d="M71.3 1h3.4L82 19h-3.6l-1.6-4.2h-7.6L67.6 19H64zm-1.2 10.7h5.6L72.9 4.6z" fill="currentColor" />
    </svg>
  );
}

export function Logo({ className, collapsed }: { className?: string; collapsed?: boolean }) {
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <LogoMark size={28} />
      {collapsed ? null : <Wordmark height={15} />}
    </span>
  );
}
