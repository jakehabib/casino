/**
 * Original vector artwork for each launch game. Composed in code so it is
 * crisp at any density, tiny over the wire, and fully ownable.
 * viewBox is 300×400 (3:4 portrait). `wide` variants are 640×300.
 */
import type { JSX } from 'react';

type ArtProps = { className?: string; wide?: boolean };

function Frame({ children, wide, className, id }: { children: React.ReactNode; wide?: boolean; className?: string; id: string }) {
  return (
    <svg
      viewBox={wide ? '0 0 640 300' : '0 0 300 400'}
      preserveAspectRatio="xMidYMid slice"
      className={className}
      role="img"
      aria-labelledby={`${id}-t`}
    >
      <title id={`${id}-t`}>{id}</title>
      {children}
    </svg>
  );
}

function MiniCard({ x, y, r, rank, suit, red, scale = 1 }: { x: number; y: number; r: number; rank: string; suit: string; red?: boolean; scale?: number }) {
  const c = red ? '#c62f3d' : '#16181d';
  return (
    <g transform={`translate(${x} ${y}) rotate(${r}) scale(${scale})`}>
      <rect x="-1" y="3" width="92" height="128" rx="9" fill="#000" opacity="0.35" filter="url(#soft)" />
      <rect width="90" height="126" rx="8" fill="#fbfaf7" />
      <rect x="0.5" y="0.5" width="89" height="125" rx="7.5" fill="none" stroke="#00000018" />
      <text x="10" y="24" fontSize="20" fontWeight="800" fill={c} fontFamily="var(--font-geist-sans)">{rank}</text>
      <text x="11" y="42" fontSize="16" fill={c}>{suit}</text>
      <text x="45" y="78" fontSize="44" textAnchor="middle" fill={c}>{suit}</text>
    </g>
  );
}

function Defs({ children }: { children?: React.ReactNode }) {
  return (
    <defs>
      <filter id="soft" x="-20%" y="-20%" width="140%" height="140%">
        <feGaussianBlur stdDeviation="6" />
      </filter>
      <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur stdDeviation="10" />
      </filter>
      {children}
    </defs>
  );
}

export function BlackjackArt({ className, wide }: ArtProps) {
  return (
    <Frame id="Blackjack" wide={wide} className={className}>
      <Defs>
        <radialGradient id="bj-bg" cx="50%" cy="20%" r="90%">
          <stop offset="0" stopColor="#1d5247" />
          <stop offset="0.55" stopColor="#0f2c26" />
          <stop offset="1" stopColor="#081613" />
        </radialGradient>
      </Defs>
      <rect width="100%" height="100%" fill="url(#bj-bg)" />
      <g transform={wide ? 'translate(330 -40)' : 'translate(0 0)'}>
        <path d="M-40 330 Q 150 250 340 330" fill="none" stroke="#e2b45630" strokeWidth="1.5" />
        <path d="M-40 345 Q 150 265 340 345" fill="none" stroke="#e2b45618" strokeWidth="1" />
        <text x="150" y="300" textAnchor="middle" fontSize="10" letterSpacing="4" fill="#e2b45666" fontFamily="var(--font-geist-sans)" fontWeight="600">BLACKJACK PAYS 3 TO 2</text>
        <MiniCard x={78} y={92} r={-12} rank="A" suit="♠" />
        <MiniCard x={138} y={78} r={9} rank="K" suit="♥" red />
        <g transform="translate(222 230)">
          {[0, 1, 2, 3].map((i) => (
            <g key={i} transform={`translate(0 ${-i * 5})`}>
              <ellipse cx="0" cy="0" rx="24" ry="9" fill="#7c5cff" />
              <ellipse cx="0" cy="-2" rx="24" ry="9" fill="#9278ff" />
              <ellipse cx="0" cy="-2" rx="16" ry="5.6" fill="none" stroke="#fff" strokeOpacity="0.5" strokeDasharray="3 3" />
            </g>
          ))}
        </g>
      </g>
      <rect width="100%" height="100%" fill="url(#bj-bg)" opacity="0" />
    </Frame>
  );
}

export function BaccaratArt({ className, wide }: ArtProps) {
  return (
    <Frame id="Baccarat" wide={wide} className={className}>
      <Defs>
        <radialGradient id="bac-bg" cx="50%" cy="15%" r="95%">
          <stop offset="0" stopColor="#3a1f3c" />
          <stop offset="0.6" stopColor="#1c1022" />
          <stop offset="1" stopColor="#0d0810" />
        </radialGradient>
      </Defs>
      <rect width="100%" height="100%" fill="url(#bac-bg)" />
      <g transform={wide ? 'translate(330 -30)' : 'translate(0 0)'}>
        <circle cx="86" cy="270" r="40" fill="none" stroke="#5ab0ff80" strokeWidth="2" />
        <text x="86" y="279" textAnchor="middle" fontSize="26" fontWeight="800" fill="#5ab0ff" fontFamily="var(--font-geist-sans)">P</text>
        <circle cx="214" cy="270" r="40" fill="none" stroke="#e86a6a80" strokeWidth="2" />
        <text x="214" y="279" textAnchor="middle" fontSize="26" fontWeight="800" fill="#e86a6a" fontFamily="var(--font-geist-sans)">B</text>
        <MiniCard x={56} y={84} r={-8} rank="9" suit="♦" red scale={0.92} />
        <MiniCard x={160} y={84} r={7} rank="8" suit="♣" scale={0.92} />
        <text x="150" y="350" textAnchor="middle" fontSize="10" letterSpacing="4" fill="#ffffff40" fontWeight="600">NATURAL</text>
      </g>
    </Frame>
  );
}

export function RouletteArt({ className, wide }: ArtProps) {
  const pockets = 37;
  const order = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26];
  const reds = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
  const R = 118;
  const r = 82;
  const seg = (Math.PI * 2) / pockets;
  return (
    <Frame id="Roulette" wide={wide} className={className}>
      <Defs>
        <radialGradient id="rou-bg" cx="50%" cy="40%" r="80%">
          <stop offset="0" stopColor="#24161a" />
          <stop offset="1" stopColor="#0b0809" />
        </radialGradient>
        <radialGradient id="rou-hub" cx="40%" cy="35%" r="70%">
          <stop offset="0" stopColor="#f5d589" />
          <stop offset="0.5" stopColor="#c9993d" />
          <stop offset="1" stopColor="#6e4d17" />
        </radialGradient>
      </Defs>
      <rect width="100%" height="100%" fill="url(#rou-bg)" />
      <g transform={wide ? 'translate(470 150) rotate(-12)' : 'translate(150 190) rotate(-12)'}>
        <circle r={R + 18} fill="#2a1b12" />
        <circle r={R + 18} fill="none" stroke="#6e4d17" strokeWidth="2" />
        <circle r={R + 6} fill="#120c09" />
        {order.map((n, i) => {
          const a0 = i * seg - Math.PI / 2;
          const a1 = a0 + seg;
          const fill = n === 0 ? '#138a5b' : reds.has(n) ? '#c8303c' : '#1a1c22';
          const p = `M ${Math.cos(a0) * R} ${Math.sin(a0) * R} A ${R} ${R} 0 0 1 ${Math.cos(a1) * R} ${Math.sin(a1) * R} L ${Math.cos(a1) * r} ${Math.sin(a1) * r} A ${r} ${r} 0 0 0 ${Math.cos(a0) * r} ${Math.sin(a0) * r} Z`;
          return <path key={n} d={p} fill={fill} stroke="#c9993d55" strokeWidth="0.6" />;
        })}
        <circle r={r} fill="#1a110c" stroke="#c9993d66" />
        <circle r={r - 18} fill="#24170f" />
        {[0, 1, 2, 3].map((i) => (
          <rect key={i} x="-3" y={-(r - 10)} width="6" height={(r - 10) * 2} rx="3" fill="url(#rou-hub)" transform={`rotate(${i * 45})`} opacity="0.9" />
        ))}
        <circle r="16" fill="url(#rou-hub)" />
        <circle cx={Math.cos(-1.1) * (R - 12)} cy={Math.sin(-1.1) * (R - 12)} r="6" fill="#f4f4f4" />
        <circle cx={Math.cos(-1.1) * (R - 12) - 2} cy={Math.sin(-1.1) * (R - 12) - 2} r="2" fill="#fff" />
      </g>
    </Frame>
  );
}

export function CrashArt({ className, wide }: ArtProps) {
  return (
    <Frame id="Launch" wide={wide} className={className}>
      <Defs>
        <linearGradient id="cr-bg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#0d0b24" />
          <stop offset="0.7" stopColor="#120c2c" />
          <stop offset="1" stopColor="#1e1238" />
        </linearGradient>
        <linearGradient id="cr-trail" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor="#7c5cff" stopOpacity="0" />
          <stop offset="1" stopColor="#b6a3ff" />
        </linearGradient>
        <linearGradient id="cr-body" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#d9dbe3" />
          <stop offset="0.5" stopColor="#ffffff" />
          <stop offset="1" stopColor="#9aa0ad" />
        </linearGradient>
      </Defs>
      <rect width="100%" height="100%" fill="url(#cr-bg)" />
      {Array.from({ length: 40 }).map((_, i) => {
        const x = (i * 97) % (wide ? 640 : 300);
        const y = (i * 53) % (wide ? 300 : 400);
        return <circle key={i} cx={x} cy={y} r={i % 7 === 0 ? 1.4 : 0.8} fill="#fff" opacity={0.15 + ((i * 13) % 10) / 25} />;
      })}
      <g transform={wide ? 'translate(300 -60)' : 'translate(0 0)'}>
        <path d="M 10 380 Q 150 360 230 140" fill="none" stroke="url(#cr-trail)" strokeWidth="4" strokeLinecap="round" />
        <path d="M 10 380 Q 150 360 230 140 L 230 400 L 10 400 Z" fill="#7c5cff" opacity="0.08" />
        <g transform="translate(232 132) rotate(28)">
          <ellipse cx="0" cy="44" rx="8" ry="22" fill="#ffb86b" opacity="0.6" filter="url(#glow)" />
          <path d="M -5 26 Q 0 52 5 26 Z" fill="#ffd9a3" />
          <path d="M -11 -2 C -11 -28 0 -44 0 -44 C 0 -44 11 -28 11 -2 L 11 22 L -11 22 Z" fill="url(#cr-body)" />
          <circle cx="0" cy="-14" r="5" fill="#2a2160" stroke="#7c5cff" strokeWidth="2" />
          <path d="M -11 6 L -20 26 L -11 22 Z" fill="#7c5cff" />
          <path d="M 11 6 L 20 26 L 11 22 Z" fill="#5232e6" />
        </g>
        <text x="40" y="120" fontSize="44" fontWeight="800" fill="#fff" fontFamily="var(--font-geist-sans)" letterSpacing="-1.5">
          2.48<tspan fill="#b6a3ff">×</tspan>
        </text>
      </g>
    </Frame>
  );
}

export function GildedVaultArt({ className, wide }: ArtProps) {
  return (
    <Frame id="Gilded Vault" wide={wide} className={className}>
      <Defs>
        <radialGradient id="gv-bg" cx="50%" cy="40%" r="80%">
          <stop offset="0" stopColor="#1f1a12" />
          <stop offset="1" stopColor="#09080a" />
        </radialGradient>
        <linearGradient id="gv-gold" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fff0c8" />
          <stop offset="0.35" stopColor="#e2b456" />
          <stop offset="0.7" stopColor="#9c7428" />
          <stop offset="1" stopColor="#e9c878" />
        </linearGradient>
        <linearGradient id="gv-steel" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#3a3d45" />
          <stop offset="1" stopColor="#15171c" />
        </linearGradient>
      </Defs>
      <rect width="100%" height="100%" fill="url(#gv-bg)" />
      <g transform={wide ? 'translate(470 150)' : 'translate(150 175)'}>
        <circle r="122" fill="url(#gv-steel)" stroke="#2a2c33" strokeWidth="3" />
        <circle r="108" fill="none" stroke="url(#gv-gold)" strokeWidth="5" />
        {Array.from({ length: 12 }).map((_, i) => (
          <circle key={i} cx={Math.cos((i * Math.PI) / 6) * 115} cy={Math.sin((i * Math.PI) / 6) * 115} r="4" fill="url(#gv-gold)" />
        ))}
        <circle r="78" fill="#121317" stroke="#2f3239" strokeWidth="2" />
        {Array.from({ length: 3 }).map((_, i) => (
          <rect key={i} x="-6" y="-70" width="12" height="140" rx="6" fill="url(#gv-gold)" transform={`rotate(${i * 60 + 15})`} />
        ))}
        <circle r="30" fill="url(#gv-gold)" />
        <circle r="22" fill="#1a1408" />
        <text y="9" textAnchor="middle" fontSize="26" fontWeight="900" fill="url(#gv-gold)" fontFamily="var(--font-geist-sans)">7</text>
      </g>
      {!wide ? (
        <g opacity="0.85">
          <rect x="40" y="330" width="220" height="1" fill="url(#gv-gold)" opacity="0.5" />
        </g>
      ) : null}
    </Frame>
  );
}

export function OverchargeArt({ className, wide }: ArtProps) {
  const cells: JSX.Element[] = [];
  const cols = 5;
  const rows = 4;
  const colors = ['#22d3ee', '#a855f7', '#f472b6', '#3ddc97', '#facc15'];
  for (let c = 0; c < cols; c++)
    for (let r = 0; r < rows; r++) {
      const k = (c * 7 + r * 3) % 5;
      cells.push(
        <g key={`${c}-${r}`} transform={`translate(${c * 46} ${r * 46})`}>
          <rect width="40" height="40" rx="9" fill="#0d1022" stroke={colors[k]} strokeOpacity="0.55" />
          <path d={['M20 8 L30 20 L20 32 L10 20 Z', 'M12 12 h16 v16 h-16 Z', 'M20 8 L31 28 L9 28 Z', 'M20 9 a11 11 0 1 0 0.01 0 Z', 'M22 7 L13 22 h7 l-2 11 9-15 h-7 Z'][k]} fill={colors[k]} opacity={(c + r) % 3 === 0 ? 1 : 0.55} />
        </g>,
      );
    }
  return (
    <Frame id="Overcharge" wide={wide} className={className}>
      <Defs>
        <radialGradient id="oc-bg" cx="50%" cy="30%" r="90%">
          <stop offset="0" stopColor="#141a3a" />
          <stop offset="1" stopColor="#05060f" />
        </radialGradient>
      </Defs>
      <rect width="100%" height="100%" fill="url(#oc-bg)" />
      <g transform={wide ? 'translate(380 58) scale(0.92)' : 'translate(36 100)'}>
        {cells}
        <path d="M 60 -40 L 30 70 L 85 70 L 50 200" fill="none" stroke="#67e8f9" strokeWidth="3" filter="url(#glow)" opacity="0.8" />
        <path d="M 60 -40 L 30 70 L 85 70 L 50 200" fill="none" stroke="#e0fbff" strokeWidth="1.5" />
      </g>
      <text x={wide ? 380 : 36} y={wide ? 40 : 76} fontSize="13" fontWeight="800" letterSpacing="3" fill="#67e8f9" fontFamily="var(--font-geist-mono)">
        ×10
      </text>
    </Frame>
  );
}

export function StarforgedArt({ className, wide }: ArtProps) {
  return (
    <Frame id="Starforged Relics" wide={wide} className={className}>
      <Defs>
        <radialGradient id="sf-bg" cx="50%" cy="35%" r="85%">
          <stop offset="0" stopColor="#13303a" />
          <stop offset="0.6" stopColor="#0a1820" />
          <stop offset="1" stopColor="#05090d" />
        </radialGradient>
        <linearGradient id="sf-brass" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#f5d589" />
          <stop offset="0.5" stopColor="#b8862f" />
          <stop offset="1" stopColor="#6e4d17" />
        </linearGradient>
        <radialGradient id="sf-core" cx="40%" cy="35%" r="70%">
          <stop offset="0" stopColor="#d4fff4" />
          <stop offset="0.4" stopColor="#3ddcb8" />
          <stop offset="1" stopColor="#0b5c55" />
        </radialGradient>
      </Defs>
      <rect width="100%" height="100%" fill="url(#sf-bg)" />
      {Array.from({ length: 30 }).map((_, i) => (
        <circle key={i} cx={(i * 113) % (wide ? 640 : 300)} cy={(i * 71) % (wide ? 300 : 400)} r="0.9" fill="#bdf7ea" opacity={0.2 + (i % 5) / 10} />
      ))}
      <g transform={wide ? 'translate(470 150)' : 'translate(150 180)'}>
        <ellipse rx="120" ry="44" fill="none" stroke="url(#sf-brass)" strokeWidth="3" transform="rotate(-18)" />
        <ellipse rx="92" ry="92" fill="none" stroke="url(#sf-brass)" strokeWidth="1.5" strokeDasharray="2 6" />
        <ellipse rx="70" ry="26" fill="none" stroke="url(#sf-brass)" strokeWidth="2.5" transform="rotate(52)" />
        <circle r="34" fill="url(#sf-core)" />
        <circle r="34" fill="none" stroke="url(#sf-brass)" strokeWidth="3" />
        <path d="M0 -20 L6 -6 L20 0 L6 6 L0 20 L-6 6 L-20 0 L-6 -6 Z" fill="#fffbe8" opacity="0.9" />
        <g transform="translate(112 -36)">
          <path d="M0 -12 L10 0 L0 12 L-10 0 Z" fill="#e86a9a" stroke="url(#sf-brass)" strokeWidth="1.5" />
        </g>
        <g transform="translate(-60 -50)">
          <circle r="9" fill="#5ab0ff" stroke="url(#sf-brass)" strokeWidth="1.5" />
        </g>
        <g transform="translate(-100 40)">
          <path d="M0 -10 L9 6 L-9 6 Z" fill="#facc15" stroke="url(#sf-brass)" strokeWidth="1.5" />
        </g>
      </g>
    </Frame>
  );
}

export const GAME_ART: Record<string, (p: ArtProps) => JSX.Element> = {
  blackjack: BlackjackArt,
  baccarat: BaccaratArt,
  roulette: RouletteArt,
  crash: CrashArt,
  'gilded-vault': GildedVaultArt,
  overcharge: OverchargeArt,
  'starforged-relics': StarforgedArt,
};
