'use client';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { ArrowRight, Users } from 'lucide-react';
import { CrashArt } from '@/components/brand/game-art';
import { Button } from '@/components/ui/button';
import { usePresenceDetail } from '@/hooks/use-socket';
import { EASE } from '@/lib/motion';

/** Featured game hero — the multiplayer original. */
export function FeaturedGame() {
  const presence = usePresenceDetail();
  const players = presence?.games?.crash ?? 0;
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: EASE.out }}
      className="relative overflow-hidden rounded-2xl border border-line bg-surface-1"
    >
      <CrashArt wide className="absolute inset-0 h-full w-full" />
      <div className="absolute inset-0 bg-gradient-to-r from-[#0b0920] via-[#0b0920e6] to-transparent sm:via-[#0b092099]" />
      <div className="relative flex min-h-[260px] flex-col justify-end p-5 sm:min-h-[300px] sm:p-8">
        <div className="flex items-center gap-2">
          <span className="rounded-md bg-accent/20 px-2 py-0.5 text-2xs font-bold uppercase tracking-[0.14em] text-[#b6a3ff]">Featured · NOVA Original</span>
          <span className="flex items-center gap-1 rounded-md bg-black/40 px-2 py-0.5 text-2xs font-semibold text-white/80">
            <span className="h-1.5 w-1.5 rounded-full bg-win" />
            <Users size={11} />
            {players} playing
          </span>
        </div>
        <h1 className="mt-3 text-3xl font-semibold tracking-[-0.03em] text-white sm:text-[40px] sm:leading-[1.05]">Launch</h1>
        <p className="mt-2 max-w-md text-sm leading-relaxed text-white/70 sm:text-[15px]">
          One rocket, everyone aboard. Watch the multiplier climb in real time and cash out before the launch fails.
        </p>
        <div className="mt-5 flex items-center gap-3">
          <Link href="/casino/crash">
            <Button size="lg" rightIcon={<ArrowRight size={16} />}>
              Play Launch
            </Button>
          </Link>
          <Link href="/casino" className="text-sm font-medium text-white/70 hover:text-white">
            Browse all games
          </Link>
        </div>
      </div>
    </motion.div>
  );
}
