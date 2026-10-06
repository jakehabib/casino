# NOVA design system

Direction: premium online gaming × modern entertainment × high-end fintech. Restraint over spectacle.
Tokens live in `src/app/globals.css` (`@theme`) and `src/lib/motion.ts`. Brand assets live in
`src/lib/branding.ts`, `src/components/brand/*` and `src/app/icon.svg` — replace these to rebrand.

## Colour

| Token | Value | Use |
|---|---|---|
| `bg` / `bg-raised` | `#0a0b0e` / `#0e1014` | Page, sidebars |
| `surface-1…4` | `#121419 → #252933` | Panels, inputs, hover, pressed |
| `line` / `line-soft` / `line-strong` | `#232731` / `#1a1d24` / `#323744` | Hairlines |
| `fg` / `fg-muted` / `fg-subtle` / `fg-faint` | `#eceef2` → `#4a4f5b` | Text hierarchy |
| `accent` (+hover/press/soft) | `#7c5cff` Nova Violet | The single strong accent: primary actions, focus, selection |
| `win` / `win-soft` | `#3ddc97` | Positive outcomes — tasteful, never neon floods |
| `loss` / `loss-soft` | `#e86a6a` | Errors; losses are *subdued* (usually `fg-subtle`, not red) |
| `gold` (+bright/deep/soft) | `#e2b456` | **Premium only**: jackpots, blackjack, big wins, milestones, rewards ready |
| `felt*` | `#0f2a24…` | Blackjack/Baccarat tables |
| `roulette-red/black/green` | | Roulette pockets & history |

## Typography

Geist Sans (UI) and Geist Mono (codes, seeds). Numbers use `.tabular` (tabular figures) everywhere
credits or multipliers change. Scale: 11 (`2xs`) / 12 / 13 / 14 / 15 / 17 / 20 / 24 / 32–40 (heroes).
Headings use slight negative tracking (`tracking-tight`, `-0.03em` for display).

## Spacing, radius, elevation

4-px base grid (Tailwind spacing). Radius: `xs 4`, `sm 6`, `md 10`, `lg 14`, `xl 18`, `2xl 24`.
Panels: `rounded-xl` + 1px `line` border + `shadow-1` (inset top highlight). Modals/popovers `shadow-3`.
Glows (`shadow-glow-accent|win|gold`) are reserved for primary CTAs and result moments.

## Breakpoints

`xs 390`, `sm 640`, `md 768`, `lg 1024` (sidebar appears), `xl 1280` (chat panel docks), `2xl 1536`.
Below `lg`: compact top bar, bottom navigation, slide-out menu, chat as a bottom sheet.

## Motion (`src/lib/motion.ts`)

| Class | Duration | Examples |
|---|---|---|
| Fast UI | 120–180 ms | hovers, toggles, chip select |
| Standard | 200–300 ms | modals, drawers, tabs |
| Game action | 300–600 ms | card deal/flip, chip placement, reel stop |
| Dramatic | 800–2000 ms | big win, bonus intro, wheel settle |

Easing: `out` `[0.22,1,0.36,1]`, `outExpo`, `inOut`, `spring` (overshoot). Springs: `snappy`, `soft`,
`card`. `MotionConfig reducedMotion="user"` is global; canvas/rAF animations check
`useReducedMotion()`; CSS animations collapse under `prefers-reduced-motion`.

## Z-index scale

`base 0 · raised 10 · sticky 20 · header 30 · sidebar 40 · drawer 50 · overlay 60 · modal 70 ·
popover 80 · toast 90 · tooltip 100` (CSS variables `--z-*`).

## Components (`src/components/ui`)

PrimaryButton · SecondaryButton · IconButton (`button.tsx`) · BetInput · AmountControls ·
PotentialWin · BetField · useHotkeys/Kbd (`bet-controls.tsx`) · ChipSelector · CasinoChip /
ChipStackView · BalanceDisplay · AnimatedNumber · CreditIcon · GameCard · Modal · Popover · Tooltip ·
Tabs · Toast (`toast.success|error|info|reward`) · Dropdown · Skeleton · LoadingSpinner ·
GameResultBadge · HistoryRow · MobileDrawer · StatCard · ProfileBadge · LevelBadge / RoleBadge ·
Avatar (preset generated avatars) · PlayingCard · Switch · Slider · Input / Field · EmptyState ·
ErrorState · ConnectionBanner · PlayDisabled.

Game frame: `components/games/shared/game-shell.tsx` (`GameShell`, `ControlsPanel`, `Stage`,
`RulesSection`, `PayTable`) — every game uses it, so header actions, rules, fairness, mute, players
count, reconnect banner and the responsible-play gate are identical everywhere.

## Sound

`src/audio/audio-manager.ts` synthesises every effect with the Web Audio API (no assets, no
licensing). Categories `ui`, `game`, `win`, `ambient` each have a gain bus under a master bus with a
gentle compressor. Nothing plays before the first user gesture and no music autoplays. Preferences
(mute, master, game, UI, win, ambient volumes) persist in `localStorage` and are editable in Settings.
