'use client';
import type { ReactNode } from 'react';
import type { SymbolRenderOpts } from '../shared/types';

/**
 * Gilded Vault symbol art — brushed steel for the low symbols, cut gems and
 * ruby for the highs, gold reserved for the Crown, Wild and Vault.
 * Shared gradients live once in <GildedVaultDefs/> (mounted by the machine)
 * so hundreds of symbol instances stay light.
 */
export function GildedVaultDefs() {
  return (
    <svg width="0" height="0" style={{ position: 'absolute', pointerEvents: 'none' }} aria-hidden focusable="false">
      <defs>
        <linearGradient id="gv-steel" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f4f6f9" />
          <stop offset="0.28" stopColor="#b9c0c9" />
          <stop offset="0.5" stopColor="#6c747f" />
          <stop offset="0.62" stopColor="#d3d9e0" />
          <stop offset="1" stopColor="#7b838e" />
        </linearGradient>
        <linearGradient id="gv-steel-h" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#8a929c" />
          <stop offset="0.35" stopColor="#eef1f5" />
          <stop offset="0.55" stopColor="#9aa2ac" />
          <stop offset="1" stopColor="#5e6670" />
        </linearGradient>
        <linearGradient id="gv-steel-dark" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#2f343c" />
          <stop offset="1" stopColor="#14171b" />
        </linearGradient>
        <linearGradient id="gv-gold" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff3cf" />
          <stop offset="0.3" stopColor="#f2d283" />
          <stop offset="0.55" stopColor="#c8963a" />
          <stop offset="0.75" stopColor="#8d6220" />
          <stop offset="1" stopColor="#e7c26a" />
        </linearGradient>
        <linearGradient id="gv-gold-d" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fff0c4" />
          <stop offset="0.45" stopColor="#d9ab4f" />
          <stop offset="1" stopColor="#7c5418" />
        </linearGradient>
        <radialGradient id="gv-ruby" cx="38%" cy="28%" r="80%">
          <stop offset="0" stopColor="#ff8a8a" />
          <stop offset="0.35" stopColor="#e0283f" />
          <stop offset="0.75" stopColor="#8a0a1d" />
          <stop offset="1" stopColor="#4d0410" />
        </radialGradient>
        <linearGradient id="gv-ice-a" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="1" stopColor="#bfe4ff" />
        </linearGradient>
        <linearGradient id="gv-ice-b" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#8fd0ff" />
          <stop offset="1" stopColor="#3f86d6" />
        </linearGradient>
        <linearGradient id="gv-ice-c" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#5fb2f5" />
          <stop offset="1" stopColor="#1f4f9a" />
        </linearGradient>
        <radialGradient id="gv-sapphire" cx="35%" cy="30%" r="75%">
          <stop offset="0" stopColor="#b7dcff" />
          <stop offset="0.5" stopColor="#2f6fd6" />
          <stop offset="1" stopColor="#0c2a66" />
        </radialGradient>
        <radialGradient id="gv-emerald" cx="35%" cy="30%" r="75%">
          <stop offset="0" stopColor="#c8ffe6" />
          <stop offset="0.5" stopColor="#18a873" />
          <stop offset="1" stopColor="#064a33" />
        </radialGradient>
        <radialGradient id="gv-plate" cx="50%" cy="20%" r="90%">
          <stop offset="0" stopColor="#24272e" />
          <stop offset="1" stopColor="#08090b" />
        </radialGradient>
        <radialGradient id="gv-vault-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0" stopColor="#ffe7a8" stopOpacity="0.9" />
          <stop offset="0.6" stopColor="#e2b456" stopOpacity="0.25" />
          <stop offset="1" stopColor="#e2b456" stopOpacity="0" />
        </radialGradient>
        <filter id="gv-drop" x="-20%" y="-20%" width="140%" height="150%">
          <feDropShadow dx="0" dy="2.5" stdDeviation="2" floodColor="#000" floodOpacity="0.6" />
        </filter>
      </defs>
    </svg>
  );
}

const Sheen = ({ d }: { d: string }) => <path d={d} fill="#fff" opacity="0.28" />;

function Bar() {
  return (
    <>
      <rect x="9" y="29" width="82" height="42" rx="9" fill="url(#gv-steel)" stroke="#1d2026" strokeWidth="1.5" />
      <rect x="14.5" y="34.5" width="71" height="31" rx="5" fill="url(#gv-steel-dark)" />
      <rect x="14.5" y="34.5" width="71" height="31" rx="5" fill="none" stroke="#000" strokeOpacity="0.5" />
      <text x="50" y="59" textAnchor="middle" fontSize="23" fontWeight="900" letterSpacing="4" fill="url(#gv-steel-h)" fontFamily="var(--font-geist-sans)">
        BAR
      </text>
      <Sheen d="M13 31 h74 a6 6 0 0 1 3 3 v2 h-80 v-2 a6 6 0 0 1 3 -3z" />
      {[16, 84].map((x) => (
        <circle key={x} cx={x} cy="50" r="1.6" fill="#d5dbe2" stroke="#3b4048" strokeWidth="0.6" />
      ))}
    </>
  );
}

function Bell() {
  return (
    <>
      <path
        d="M50 13c-3.4 0-5.6 2.4-5.6 5.3v2.2C31.6 23.3 26 35 26 48.5V61l-7.5 9.6c-1.2 1.6-.1 3.9 2 3.9h59c2.1 0 3.2-2.3 2-3.9L74 61V48.5C74 35 68.4 23.3 55.6 20.5v-2.2c0-2.9-2.2-5.3-5.6-5.3z"
        fill="url(#gv-steel-h)"
        stroke="#1d2026"
        strokeWidth="1.5"
      />
      <path d="M33 47c0-11 5-20 13-23" fill="none" stroke="#fff" strokeOpacity="0.6" strokeWidth="3" strokeLinecap="round" />
      <path d="M23 66.5h54" stroke="#2a2e35" strokeWidth="2" />
      <rect x="22" y="61" width="56" height="5" rx="2" fill="url(#gv-steel)" opacity="0.9" />
      <circle cx="50" cy="81" r="7" fill="url(#gv-steel)" stroke="#1d2026" strokeWidth="1.5" />
      <circle cx="47.6" cy="78.6" r="2" fill="#fff" opacity="0.7" />
    </>
  );
}

function Diamond() {
  return (
    <>
      <path d="M18 40 L32 22 H68 L82 40 L50 84 Z" fill="url(#gv-ice-c)" stroke="#0f2e5c" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M32 22 L41 40 L50 22 Z" fill="url(#gv-ice-a)" />
      <path d="M50 22 L59 40 L68 22 Z" fill="url(#gv-ice-b)" />
      <path d="M18 40 L32 22 L41 40 Z" fill="url(#gv-ice-b)" />
      <path d="M68 22 L82 40 H59 Z" fill="#7cc2fb" />
      <path d="M41 40 L50 22 L59 40 Z" fill="#dff1ff" />
      <path d="M18 40 H41 L50 84 Z" fill="#4c9be8" />
      <path d="M41 40 H59 L50 84 Z" fill="url(#gv-ice-a)" opacity="0.92" />
      <path d="M59 40 H82 L50 84 Z" fill="#2c6fc4" />
      <path d="M18 40 H82" stroke="#0f2e5c" strokeOpacity="0.5" strokeWidth="1" />
      <path d="M27 31 L33 25" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" opacity="0.9" />
      <circle cx="44" cy="30" r="1.6" fill="#fff" />
    </>
  );
}

function Seven() {
  return (
    <>
      <path d="M21 17 H80 V30 L55 85 H35 L58 33 H21 Z" fill="url(#gv-gold-d)" stroke="#5e3f10" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M26 21.5 H75.5 V29 L51.5 80.5 H41.5 L64 28.5 H26 Z" fill="url(#gv-ruby)" />
      <path d="M28 23.5 H72" stroke="#fff" strokeOpacity="0.55" strokeWidth="2" strokeLinecap="round" />
      <path d="M66 31 L48 72" stroke="#ffb3b3" strokeOpacity="0.35" strokeWidth="2.5" strokeLinecap="round" />
    </>
  );
}

function Crown() {
  return (
    <>
      <path d="M16 34 L32 54 L50 24 L68 54 L84 34 L77 70 H23 Z" fill="url(#gv-gold)" stroke="#5e3f10" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M23 70 H77 V80 a3 3 0 0 1 -3 3 H26 a3 3 0 0 1 -3 -3 Z" fill="url(#gv-gold-d)" stroke="#5e3f10" strokeWidth="1.5" />
      <path d="M26 59 L50 33 L74 59" fill="none" stroke="#fff6dc" strokeOpacity="0.5" strokeWidth="1.5" />
      {[
        [16, 34],
        [50, 24],
        [84, 34],
      ].map(([x, y]) => (
        <circle key={x} cx={x} cy={y} r="5" fill="url(#gv-gold)" stroke="#5e3f10" strokeWidth="1.2" />
      ))}
      <ellipse cx="50" cy="76.5" rx="5.5" ry="4" fill="url(#gv-ruby)" stroke="#5e3f10" strokeWidth="1" />
      <ellipse cx="34" cy="76.5" rx="3.8" ry="3" fill="url(#gv-sapphire)" stroke="#5e3f10" strokeWidth="0.8" />
      <ellipse cx="66" cy="76.5" rx="3.8" ry="3" fill="url(#gv-emerald)" stroke="#5e3f10" strokeWidth="0.8" />
      <path d="M44 56 L50 47 L56 56 L50 64 Z" fill="url(#gv-ruby)" stroke="#5e3f10" strokeWidth="1" />
      <Sheen d="M24 70 H76 V72.5 H24 Z" />
    </>
  );
}

function Wild() {
  return (
    <>
      <rect x="6" y="18" width="88" height="64" rx="12" fill="url(#gv-plate)" stroke="url(#gv-gold)" strokeWidth="3.2" />
      <rect x="11.5" y="23.5" width="77" height="53" rx="8" fill="none" stroke="#e2b456" strokeOpacity="0.35" strokeWidth="1" />
      <text x="50" y="60" textAnchor="middle" fontSize="27" fontWeight="900" letterSpacing="2.5" fill="url(#gv-gold)" fontFamily="var(--font-geist-sans)" fontStyle="italic">
        WILD
      </text>
      <path d="M24 31 H76" stroke="url(#gv-gold)" strokeWidth="1.2" opacity="0.7" />
      <path d="M24 69 H76" stroke="url(#gv-gold)" strokeWidth="1.2" opacity="0.7" />
      <path d="M50 26 l3 4 -3 4 -3 -4z" fill="#f2d283" />
      <path d="M50 66 l3 4 -3 4 -3 -4z" fill="#f2d283" />
    </>
  );
}

/** The Vault door — scatter symbol and brand mark. `turn` rotates the handle wheel (degrees). */
export function VaultDoor({ turn = 0, glow = false, turnMs = 0 }: { turn?: number; glow?: boolean; turnMs?: number }) {
  return (
    <>
      {glow ? <circle cx="50" cy="50" r="50" fill="url(#gv-vault-glow)" /> : null}
      <circle cx="50" cy="50" r="42" fill="url(#gv-steel-dark)" stroke="url(#gv-gold)" strokeWidth="4" />
      <circle cx="50" cy="50" r="36" fill="none" stroke="#000" strokeOpacity="0.55" strokeWidth="2" />
      {Array.from({ length: 12 }).map((_, i) => {
        const a = (i * Math.PI) / 6;
        return <circle key={i} cx={(50 + Math.cos(a) * 39).toFixed(2)} cy={(50 + Math.sin(a) * 39).toFixed(2)} r="1.7" fill="#f2d283" />;
      })}
      <circle cx="50" cy="50" r="28" fill="url(#gv-steel)" stroke="#1d2026" strokeWidth="1.5" />
      <circle cx="50" cy="50" r="22" fill="url(#gv-steel-dark)" />
      <g style={{ transform: `rotate(${turn}deg)`, transformOrigin: '50px 50px', transition: turnMs ? `transform ${turnMs}ms cubic-bezier(.65,0,.35,1)` : undefined }}>
        {[0, 60, 120].map((r) => (
          <rect key={r} x="47.5" y="27" width="5" height="46" rx="2.5" fill="url(#gv-gold)" stroke="#5e3f10" strokeWidth="0.8" transform={`rotate(${r} 50 50)`} />
        ))}
        <circle cx="50" cy="50" r="8" fill="url(#gv-gold)" stroke="#5e3f10" strokeWidth="1" />
        <circle cx="50" cy="50" r="3.2" fill="#3a2a0c" />
      </g>
      <path d="M22 34 A32 32 0 0 1 40 19" fill="none" stroke="#fff" strokeOpacity="0.35" strokeWidth="2.5" strokeLinecap="round" />
    </>
  );
}

const ART: Record<string, () => ReactNode> = {
  BAR: Bar,
  BELL: Bell,
  DIAMOND: Diamond,
  SEVEN: Seven,
  CROWN: Crown,
  WILD: Wild,
  VAULT: () => <VaultDoor />,
};

export const GV_SYMBOL_NAMES: Record<string, string> = {
  BAR: 'Bar',
  BELL: 'Bell',
  DIAMOND: 'Diamond',
  SEVEN: 'Seven',
  CROWN: 'Crown',
  WILD: 'Wild',
  VAULT: 'Vault',
};

export function renderGildedSymbol(symbol: string, opts: SymbolRenderOpts): ReactNode {
  const Art = ART[symbol];
  if (!Art) return null;
  const premium = symbol === 'CROWN' || symbol === 'WILD' || symbol === 'VAULT';
  return (
    <svg viewBox="0 0 100 100" className="h-full w-full overflow-visible" role="img" aria-label={GV_SYMBOL_NAMES[symbol]}>
      {opts.state === 'win' && premium && !opts.blurred ? <circle cx="50" cy="50" r="48" fill="url(#gv-vault-glow)" opacity="0.55" /> : null}
      <g filter={opts.blurred || opts.small ? undefined : 'url(#gv-drop)'}>
        <Art />
      </g>
    </svg>
  );
}
