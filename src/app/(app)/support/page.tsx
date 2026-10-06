'use client';
import Link from 'next/link';
import { ChevronDown, Copy, LifeBuoy, Mail } from 'lucide-react';
import { PageContainer, PageHeader, SectionHeading, useCopy } from '@/components/wallet/page-frame';
import { Button } from '@/components/ui/button';
import { BRAND } from '@/lib/branding';

const FAQ: { group: string; items: { q: string; a: React.ReactNode }[] }[] = [
  {
    group: 'Credits',
    items: [
      {
        q: 'Are Credits worth anything?',
        a: (
          <>
            No. Credits are virtual play money with no monetary value. They can’t be bought, withdrawn, redeemed, transferred or exchanged for anything of value — not
            for cash, prizes or other currencies. {BRAND.name} is for entertainment only.
          </>
        ),
      },
      {
        q: 'How do I get more Credits?',
        a: (
          <>
            Claim Daily Credits every day, an Emergency refill when your balance runs low, a weekly bonus and level milestone rewards — all on the{' '}
            <Link href="/rewards" className="font-medium text-fg hover:underline">Rewards</Link> page. There is nothing to buy.
          </>
        ),
      },
      {
        q: 'Where can I see every change to my balance?',
        a: (
          <>
            Your <Link href="/wallet" className="font-medium text-fg hover:underline">Wallet</Link> shows a complete, append-only record of every wager, win, refund and reward,
            with the balance after each one.
          </>
        ),
      },
    ],
  },
  {
    group: 'Limits & breaks',
    items: [
      {
        q: 'How do daily limits work?',
        a: 'You can set a daily wager limit and a daily loss limit. Wagers count the moment they’re accepted, and loss is what you wagered minus what was returned. Lowering a limit applies immediately; raising or removing one takes effect after 24 hours, and you can cancel the request before then. Limits reset at midnight in the timezone you choose.',
      },
      {
        q: 'Can I end a break early?',
        a: 'No. Breaks, locks and self-exclusions can’t be cancelled or shortened once they start — that’s what makes them dependable. You can extend them at any time. Rounds already in play still settle normally.',
      },
      {
        q: 'What can I still do during a break?',
        a: 'You can log in, view your account, wallet and game history, contact support and read chat. New wagers, slot spins, deals and wagering-dependent rewards are paused.',
      },
      {
        q: 'How does an indefinite self-exclusion end?',
        a: 'Only through a review. Request one from the Responsible Play page when you feel ready; a mandatory 7-day waiting period starts from your request, after which our support team reviews it. Play stays disabled throughout.',
      },
    ],
  },
  {
    group: 'Fairness',
    items: [
      {
        q: 'How do I know results aren’t rigged?',
        a: (
          <>
            Every single-player result comes from your seed pair: a server seed we commit to (by showing its hash) before you play, your client seed and a nonce. Rotate your seed
            to reveal the server seed and re-derive any round on the <Link href="/fairness" className="font-medium text-fg hover:underline">Fairness</Link> page — the verifier
            runs in your browser.
          </>
        ),
      },
      {
        q: 'Why did rotating my seed reset my card shoe?',
        a: 'Revealing the server seed would let anyone compute the rest of a shoe shuffled with it, so active Blackjack and Baccarat shoes are retired when you rotate. Your next deal uses a fresh shoe from the new seed.',
      },
    ],
  },
  {
    group: 'Your account',
    items: [
      {
        q: 'I can’t sign in',
        a: (
          <>
            Use <Link href="/forgot-password" className="font-medium text-fg hover:underline">Forgot password</Link> to receive a reset link. If you no longer have access to your
            email address, contact support from any address and include your username.
          </>
        ),
      },
      {
        q: 'Why is play disabled on my account?',
        a: 'Play can be paused by a break or self-exclusion you started, scheduled maintenance, or an account suspension. The game screen shows which one applies and, where there is one, when it ends.',
      },
      {
        q: 'How do I change my profile privacy?',
        a: (
          <>
            Open <Link href="/settings" className="font-medium text-fg hover:underline">Settings</Link> to choose who can see your profile and which stats are shown.
          </>
        ),
      },
    ],
  },
];

export default function SupportPage() {
  const copy = useCopy();
  return (
    <PageContainer narrow>
      <PageHeader icon={<LifeBuoy size={20} />} eyebrow="Help" title="Support" description="Answers to common questions, and a real person when you need one." />

      <section className="mb-10 flex flex-col gap-4 rounded-xl border border-line bg-surface-1 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3.5">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface-3 text-fg-muted">
            <Mail size={18} />
          </span>
          <div className="min-w-0">
            <div className="text-[15px] font-semibold">Email our support team</div>
            <a href={`mailto:${BRAND.supportEmail}`} className="mt-0.5 block truncate font-mono text-[13px] text-fg-muted hover:text-fg" data-testid="support-email">
              {BRAND.supportEmail}
            </a>
            <p className="mt-1 text-xs text-fg-subtle">Include your username and, for a game question, the round’s time from your history.</p>
          </div>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button variant="subtle" size="sm" leftIcon={<Copy size={13} />} onClick={() => void copy(BRAND.supportEmail, 'Email address copied')}>
            Copy
          </Button>
          <a href={`mailto:${BRAND.supportEmail}`}>
            <Button size="sm" leftIcon={<Mail size={13} />}>
              Write to us
            </Button>
          </a>
        </div>
      </section>

      <div className="space-y-8">
        {FAQ.map((g) => (
          <section key={g.group}>
            <SectionHeading title={g.group} />
            <div className="divide-y divide-line-soft overflow-hidden rounded-xl border border-line bg-surface-1">
              {g.items.map((it) => (
                <details key={it.q} className="group">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-4 py-3.5 text-[14px] font-medium text-fg transition-colors hover:bg-surface-2 sm:px-5 [&::-webkit-details-marker]:hidden">
                    {it.q}
                    <ChevronDown size={16} className="shrink-0 text-fg-subtle transition-transform group-open:rotate-180" />
                  </summary>
                  <div className="px-4 pb-4 text-[13px] leading-relaxed text-fg-muted sm:px-5">{it.a}</div>
                </details>
              ))}
            </div>
          </section>
        ))}
      </div>

      <p className="mt-10 text-center text-xs text-fg-subtle">
        If gambling of any kind is affecting you, talk to someone you trust or a local support service. You can also set limits or take a break on the{' '}
        <Link href="/responsible-play" className="text-fg-muted hover:text-fg">Responsible Play</Link> page.
      </p>
    </PageContainer>
  );
}
