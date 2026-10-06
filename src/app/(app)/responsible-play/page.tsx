'use client';
import Link from 'next/link';
import { HeartHandshake, LifeBuoy, Settings, Wallet, MessageCircle, BookOpen } from 'lucide-react';
import { PageContainer, PageHeader, Panel, RequireAuth, SectionHeading } from '@/components/wallet/page-frame';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/states';
import { TodayPanel } from '@/components/responsible-play/today-panel';
import { AccountingRules, LimitsPanel } from '@/components/responsible-play/limits-panel';
import { ExclusionPanel, RestrictionHistory } from '@/components/responsible-play/exclusion-panel';
import { useRpSummary } from '@/components/responsible-play/use-rp';
import { BRAND } from '@/lib/branding';

function Resources() {
  return (
    <Panel className="p-4 sm:p-5">
      <div className="grid gap-6 md:grid-cols-[1.2fr_1fr]">
        <div>
          <h3 className="text-[15px] font-semibold tracking-tight">If play stops feeling like fun</h3>
          <p className="mt-1.5 text-[13px] leading-relaxed text-fg-muted">
            {BRAND.name} uses play money only — Credits can’t be bought or cashed out. Even so, time spent playing is real. If gambling of any kind is
            affecting your mood, sleep, relationships or finances, talk to someone you trust or contact a local support service. Many countries have free,
            confidential helplines available around the clock.
          </p>
          <ul className="mt-3 space-y-1.5 text-[13px] text-fg-muted">
            <li>• Set limits before you play, not during a session.</li>
            <li>• Take regular breaks — a few minutes away resets perspective.</li>
            <li>• Never play to recover losses or to escape problems.</li>
          </ul>
        </div>
        <div className="grid content-start gap-2">
          <Link href="/support" className="flex items-center gap-3 rounded-lg border border-line bg-surface-2 px-3.5 py-3 transition-colors hover:border-line-strong">
            <LifeBuoy size={17} className="shrink-0 text-fg-subtle" />
            <span className="min-w-0">
              <span className="block text-[13px] font-medium text-fg">Contact support</span>
              <span className="block truncate text-xs text-fg-subtle">{BRAND.supportEmail}</span>
            </span>
          </Link>
          <Link href="/settings" className="flex items-center gap-3 rounded-lg border border-line bg-surface-2 px-3.5 py-3 transition-colors hover:border-line-strong">
            <Settings size={17} className="shrink-0 text-fg-subtle" />
            <span>
              <span className="block text-[13px] font-medium text-fg">Account settings</span>
              <span className="block text-xs text-fg-subtle">Privacy, sound and notifications</span>
            </span>
          </Link>
          <Link href="/history" className="flex items-center gap-3 rounded-lg border border-line bg-surface-2 px-3.5 py-3 transition-colors hover:border-line-strong">
            <BookOpen size={17} className="shrink-0 text-fg-subtle" />
            <span>
              <span className="block text-[13px] font-medium text-fg">Review your play</span>
              <span className="block text-xs text-fg-subtle">Every round you’ve played, with results</span>
            </span>
          </Link>
          <div className="flex items-center gap-3 rounded-lg px-3.5 py-2 text-xs text-fg-subtle">
            <MessageCircle size={15} className="shrink-0" />
            Chat stays readable during breaks so you’re never cut off from the community.
          </div>
        </div>
      </div>
    </Panel>
  );
}

function PageSkeleton() {
  return (
    <div className="space-y-8">
      <Skeleton className="h-[188px] rounded-xl" />
      <div className="grid gap-4 md:grid-cols-2">
        <Skeleton className="h-[330px] rounded-xl" />
        <Skeleton className="h-[330px] rounded-xl" />
      </div>
      <Skeleton className="h-40 rounded-xl" />
    </div>
  );
}

function Content() {
  const { data, isLoading, isError, refetch } = useRpSummary();
  if (isLoading) return <PageSkeleton />;
  if (isError || !data) return <ErrorState title="Couldn’t load your settings" body="Your limits and breaks are unaffected. Please try again." onRetry={() => void refetch()} />;
  return (
    <div className="space-y-10">
      <section aria-labelledby="today">
        <TodayPanel data={data} />
      </section>

      <section>
        <SectionHeading id="limits" title="Daily limits" description="Set how much you can wager or lose each day. Limits are enforced on every game, on our servers." />
        <div className="space-y-4">
          <LimitsPanel data={data} />
          <AccountingRules delayHours={data.rules.limitIncreaseDelayHours} />
        </div>
      </section>

      <section>
        <SectionHeading
          id="breaks"
          title="Breaks & self-exclusion"
          description={
            data.exclusion
              ? 'A restriction is in place. You can extend it, but it can’t be cancelled or shortened.'
              : 'Step away from casino play for a set time. Once started, a break can’t be cancelled or shortened.'
          }
        />
        <div className="space-y-4">
          <ExclusionPanel data={data} />
          <RestrictionHistory data={data} />
        </div>
      </section>

      <section>
        <SectionHeading id="support" title="Support & resources" />
        <Resources />
      </section>
    </div>
  );
}

export default function ResponsiblePlayPage() {
  return (
    <PageContainer>
      <PageHeader
        icon={<HeartHandshake size={20} />}
        eyebrow="Your account"
        title="Responsible play"
        description="Limits, breaks and self-exclusion — in your control, enforced on every game. Everything here is private to you."
        actions={
          <>
            <Link href="/wallet">
              <Button variant="subtle" size="sm" leftIcon={<Wallet size={14} />}>
                Wallet
              </Button>
            </Link>
            <Link href="/settings">
              <Button variant="subtle" size="sm" leftIcon={<Settings size={14} />}>
                Settings
              </Button>
            </Link>
            <Link href="/support">
              <Button variant="subtle" size="sm" leftIcon={<LifeBuoy size={14} />}>
                Support
              </Button>
            </Link>
          </>
        }
      />
      <RequireAuth title="responsible play settings" skeleton={<PageSkeleton />}>
        {() => <Content />}
      </RequireAuth>
    </PageContainer>
  );
}
