import { useId } from 'react';
import { cn } from '@/lib/cn';

/**
 * Preset avatars: generated geometric marks (no uploads in V1). `preset:<n>`.
 */
const PRESETS: { from: string; to: string; glyph: 'orbit' | 'diamond' | 'wave' | 'spark' | 'ring' | 'tri' }[] = [
  { from: '#7c5cff', to: '#3b2a9e', glyph: 'orbit' },
  { from: '#3ddc97', to: '#11664a', glyph: 'diamond' },
  { from: '#5ab0ff', to: '#1d4f8f', glyph: 'wave' },
  { from: '#f2b84b', to: '#8a5a12', glyph: 'spark' },
  { from: '#e86a6a', to: '#7a2530', glyph: 'ring' },
  { from: '#c084fc', to: '#5b2a86', glyph: 'tri' },
  { from: '#2dd4bf', to: '#0f5e57', glyph: 'orbit' },
  { from: '#f472b6', to: '#7d2353', glyph: 'diamond' },
  { from: '#a3e635', to: '#3e6212', glyph: 'wave' },
  { from: '#94a3b8', to: '#334155', glyph: 'spark' },
  { from: '#fb923c', to: '#7c2d12', glyph: 'ring' },
  { from: '#818cf8', to: '#312e81', glyph: 'tri' },
];
export const AVATAR_PRESET_COUNT = PRESETS.length;

function presetIndex(avatarUrl: string | null | undefined, fallbackSeed: string) {
  const m = avatarUrl?.match(/^preset:(\d+)$/);
  if (m) return Number(m[1]) % PRESETS.length;
  let h = 0;
  for (let i = 0; i < fallbackSeed.length; i++) h = (h * 31 + fallbackSeed.charCodeAt(i)) >>> 0;
  return h % PRESETS.length;
}

function Glyph({ kind }: { kind: (typeof PRESETS)[number]['glyph'] }) {
  const c = 'rgba(255,255,255,0.85)';
  switch (kind) {
    case 'orbit':
      return (
        <>
          <circle cx="20" cy="20" r="5" fill={c} />
          <ellipse cx="20" cy="20" rx="12" ry="5" fill="none" stroke={c} strokeWidth="1.6" transform="rotate(-25 20 20)" />
        </>
      );
    case 'diamond':
      return <path d="M20 9 L29 20 L20 31 L11 20 Z" fill="none" stroke={c} strokeWidth="2" />;
    case 'wave':
      return <path d="M9 22 C 13 15, 17 15, 20 20 S 27 25, 31 18" fill="none" stroke={c} strokeWidth="2.2" strokeLinecap="round" />;
    case 'spark':
      return <path d="M20 9 L22.5 17.5 L31 20 L22.5 22.5 L20 31 L17.5 22.5 L9 20 L17.5 17.5 Z" fill={c} />;
    case 'ring':
      return (
        <>
          <circle cx="20" cy="20" r="9" fill="none" stroke={c} strokeWidth="2.2" />
          <circle cx="20" cy="20" r="3" fill={c} />
        </>
      );
    case 'tri':
      return <path d="M20 10 L30 28 L10 28 Z" fill="none" stroke={c} strokeWidth="2" strokeLinejoin="round" />;
  }
}

export function Avatar({ avatarUrl, name, size = 32, className, ring }: { avatarUrl?: string | null; name: string; size?: number; className?: string; ring?: string }) {
  const p = PRESETS[presetIndex(avatarUrl, name)];
  // Unique per instance: a gradient defined inside a display:none subtree (e.g. a
  // hidden desktop panel) would otherwise blank out every avatar sharing its id.
  const id = `av-${useId().replace(/:/g, '')}`;
  return (
    <span className={cn('relative inline-flex shrink-0 overflow-hidden rounded-full', className)} style={{ width: size, height: size, boxShadow: ring ? `0 0 0 2px ${ring}` : undefined }}>
      <svg viewBox="0 0 40 40" width={size} height={size} aria-label={name} role="img">
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor={p.from} />
            <stop offset="1" stopColor={p.to} />
          </linearGradient>
        </defs>
        <rect width="40" height="40" fill={`url(#${id})`} />
        <Glyph kind={p.glyph} />
      </svg>
    </span>
  );
}

export function AvatarPresetPreview({ index, size = 48 }: { index: number; size?: number }) {
  return <Avatar avatarUrl={`preset:${index}`} name={`preset-${index}`} size={size} />;
}
