/**
 * Motion system. Durations in seconds (Framer Motion units).
 *  FAST UI       120–180ms  hovers, toggles, small UI feedback
 *  STANDARD      200–300ms  panels, modals, tab changes
 *  GAME ACTION   300–600ms  card deals, chip placement, reel stops
 *  DRAMATIC      800–2000ms big wins, bonus transitions, wheel settle
 * All motion respects prefers-reduced-motion via <MotionConfig reducedMotion="user">.
 */
export const DUR = {
  fast: 0.14,
  standard: 0.24,
  game: 0.45,
  dramatic: 1.2,
} as const;

export const EASE = {
  out: [0.22, 1, 0.36, 1] as const,
  outExpo: [0.16, 1, 0.3, 1] as const,
  inOut: [0.65, 0, 0.35, 1] as const,
  spring: [0.34, 1.4, 0.64, 1] as const,
};

export const SPRING = {
  snappy: { type: 'spring' as const, stiffness: 520, damping: 34, mass: 0.8 },
  soft: { type: 'spring' as const, stiffness: 260, damping: 28 },
  card: { type: 'spring' as const, stiffness: 380, damping: 32, mass: 0.9 },
};

export const fadeUp = {
  initial: { opacity: 0, y: 6 },
  animate: { opacity: 1, y: 0, transition: { duration: DUR.standard, ease: EASE.out } },
  exit: { opacity: 0, y: 4, transition: { duration: DUR.fast, ease: EASE.out } },
};
