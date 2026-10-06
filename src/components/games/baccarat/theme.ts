import type { BaccaratOutcome } from '@/engines/baccarat/types';

/**
 * Baccarat side colours, derived from the shared tokens:
 *   Player → info blue, Banker → a restrained loss red, Tie → win green.
 */
export const SIDE_TONE: Record<BaccaratOutcome, { label: string; short: string; text: string; solid: string; ring: string; soft: string; border: string; hex: string }> = {
  PLAYER: {
    label: 'Player',
    short: 'P',
    text: 'text-info',
    solid: 'bg-[#2f7fd6]',
    ring: 'ring-info/60',
    soft: 'bg-info/[0.07]',
    border: 'border-info/35',
    hex: '#5ab0ff',
  },
  BANKER: {
    label: 'Banker',
    short: 'B',
    text: 'text-loss',
    solid: 'bg-[#c8303c]',
    ring: 'ring-loss/60',
    soft: 'bg-loss/[0.07]',
    border: 'border-loss/35',
    hex: '#e86a6a',
  },
  TIE: {
    label: 'Tie',
    short: 'T',
    text: 'text-win',
    solid: 'bg-[#138a5b]',
    ring: 'ring-win/60',
    soft: 'bg-win/[0.06]',
    border: 'border-win/30',
    hex: '#3ddc97',
  },
};
