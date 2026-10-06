import Link from 'next/link';
import { Logo } from '@/components/brand/logo';
import { BlackjackArt, CrashArt, GildedVaultArt } from '@/components/brand/game-art';
import { BRAND } from '@/lib/branding';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1fr_minmax(480px,560px)]">
      <div className="relative hidden overflow-hidden border-r border-line-soft lg:block">
        <div className="absolute inset-0 grid grid-cols-3 gap-3 p-3 opacity-90">
          <div className="relative overflow-hidden rounded-2xl"><BlackjackArt className="absolute inset-0 h-full w-full" /></div>
          <div className="relative mt-16 overflow-hidden rounded-2xl"><CrashArt className="absolute inset-0 h-full w-full" /></div>
          <div className="relative mt-6 overflow-hidden rounded-2xl"><GildedVaultArt className="absolute inset-0 h-full w-full" /></div>
        </div>
        <div className="absolute inset-0 bg-gradient-to-t from-bg via-bg/70 to-bg/20" />
        <div className="absolute inset-x-0 bottom-0 p-10">
          <Logo />
          <h2 className="mt-5 max-w-md text-3xl font-semibold tracking-[-0.03em] text-fg">Seven games. Built properly.</h2>
          <p className="mt-2 max-w-md text-sm leading-relaxed text-fg-muted">{BRAND.disclaimer}</p>
        </div>
      </div>
      <div className="flex flex-col px-5 py-6 sm:px-10">
        <Link href="/" className="lg:hidden">
          <Logo />
        </Link>
        <div className="flex flex-1 items-center justify-center py-10">
          <div className="w-full max-w-[380px]">{children}</div>
        </div>
        <p className="text-center text-xs text-fg-faint">Play money only · No purchases · No cash-outs · 18+</p>
      </div>
    </div>
  );
}
