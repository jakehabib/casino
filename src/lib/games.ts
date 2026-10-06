/** Central catalogue of launch games. Visual + routing metadata only. */
export type GameKey = 'BLACKJACK' | 'BACCARAT' | 'ROULETTE' | 'CRASH' | 'SLOTS';
export type SlotId = 'gilded-vault' | 'overcharge' | 'starforged-relics';

export interface GameMeta {
  id: string; // stable id used for favourites / routes
  key: GameKey;
  slotId?: SlotId;
  name: string;
  category: 'Table' | 'Originals' | 'Slots';
  href: string;
  tagline: string;
  description: string;
  multiplayer?: boolean;
}

export const GAMES: GameMeta[] = [
  {
    id: 'blackjack',
    key: 'BLACKJACK',
    name: 'Blackjack',
    category: 'Table',
    href: '/casino/blackjack',
    tagline: '6-deck shoe · 3:2',
    description: 'Classic six-deck blackjack. Dealer stands on soft 17, double after split, insurance.',
  },
  {
    id: 'baccarat',
    key: 'BACCARAT',
    name: 'Baccarat',
    category: 'Table',
    href: '/casino/baccarat',
    tagline: 'Punto Banco · 8 decks',
    description: 'Punto Banco with exact third-card rules and a live bead plate.',
  },
  {
    id: 'roulette',
    key: 'ROULETTE',
    name: 'European Roulette',
    category: 'Table',
    href: '/casino/roulette',
    tagline: 'Single zero',
    description: 'Single-zero roulette with the full inside and outside betting layout.',
  },
  {
    id: 'crash',
    key: 'CRASH',
    name: 'Launch',
    category: 'Originals',
    href: '/casino/crash',
    tagline: 'Multiplayer crash',
    description: 'Ride the multiplier and cash out before the launch fails. Live with everyone online.',
    multiplayer: true,
  },
  {
    id: 'gilded-vault',
    key: 'SLOTS',
    slotId: 'gilded-vault',
    name: 'Gilded Vault',
    category: 'Slots',
    href: '/casino/slots/gilded-vault',
    tagline: '5×3 · 20 lines · Free spins',
    description: 'A modern luxury vault. Classic paylines, expanding vault wilds and free spins.',
  },
  {
    id: 'overcharge',
    key: 'SLOTS',
    slotId: 'overcharge',
    name: 'Overcharge',
    category: 'Slots',
    href: '/casino/slots/overcharge',
    tagline: '5×4 · 1,024 ways · Cascades',
    description: 'Electric cascades with a multiplier that climbs every chain reaction.',
  },
  {
    id: 'starforged-relics',
    key: 'SLOTS',
    slotId: 'starforged-relics',
    name: 'Starforged Relics',
    category: 'Slots',
    href: '/casino/slots/starforged-relics',
    tagline: '6×5 · Cluster pays',
    description: 'Ancient celestial treasure. Clusters, random modifiers and upgrading free spins.',
  },
];

export const GAME_LABEL: Record<GameKey, string> = {
  BLACKJACK: 'Blackjack',
  BACCARAT: 'Baccarat',
  ROULETTE: 'Roulette',
  CRASH: 'Crash',
  SLOTS: 'Slots',
};

export function gameById(id: string): GameMeta | undefined {
  return GAMES.find((g) => g.id === id);
}
