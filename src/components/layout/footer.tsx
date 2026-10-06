import Link from 'next/link';
import { BRAND } from '@/lib/branding';
import { Wordmark } from '@/components/brand/logo';

export function Footer() {
  return (
    <footer className="mt-16 border-t border-line-soft px-4 pb-24 pt-10 text-fg-subtle sm:px-6 lg:pb-10">
      <div className="mx-auto flex max-w-[1240px] flex-col gap-8 md:flex-row md:justify-between">
        <div className="max-w-md">
          <Wordmark height={14} className="text-fg-muted" />
          <p className="mt-3 text-xs leading-relaxed">{BRAND.disclaimer}</p>
          <p className="mt-2 text-xs">For entertainment only. 18+.</p>
        </div>
        <div className="grid grid-cols-2 gap-x-12 gap-y-2 text-[13px] sm:grid-cols-3">
          <Link className="hover:text-fg" href="/casino">Casino</Link>
          <Link className="hover:text-fg" href="/fairness">Fairness</Link>
          <Link className="hover:text-fg" href="/responsible-play">Responsible Play</Link>
          <Link className="hover:text-fg" href="/rewards">Rewards</Link>
          <Link className="hover:text-fg" href="/support">Support</Link>
          <Link className="hover:text-fg" href="/wallet">Wallet</Link>
        </div>
      </div>
    </footer>
  );
}
