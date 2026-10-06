import { Home, LayoutGrid, Spade, Diamond, CircleDot, Rocket, Gem, Gift, History, ShieldCheck, HeartHandshake, LifeBuoy, Settings, User } from 'lucide-react';

export const PRIMARY_NAV = [
  { href: '/', label: 'Home', icon: Home, exact: true },
  { href: '/casino', label: 'Casino', icon: LayoutGrid, exact: true },
];

export const GAME_NAV = [
  { href: '/casino/blackjack', label: 'Blackjack', icon: Spade },
  { href: '/casino/baccarat', label: 'Baccarat', icon: Diamond },
  { href: '/casino/roulette', label: 'Roulette', icon: CircleDot },
  { href: '/casino/crash', label: 'Crash', icon: Rocket },
  { href: '/casino/slots', label: 'Slots', icon: Gem },
];

export const ACCOUNT_NAV = [
  { href: '/rewards', label: 'Rewards', icon: Gift },
  { href: '/history', label: 'Game History', icon: History },
  { href: '/fairness', label: 'Fairness', icon: ShieldCheck },
  { href: '/responsible-play', label: 'Responsible Play', icon: HeartHandshake },
];

export const FOOTER_NAV = [
  { href: '/support', label: 'Support', icon: LifeBuoy },
  { href: '/settings', label: 'Settings', icon: Settings },
  { href: '/profile', label: 'Profile', icon: User },
];
