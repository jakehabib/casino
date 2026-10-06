'use client';
import { Suspense } from 'react';
import { ShieldCheck } from 'lucide-react';
import { PageContainer, PageHeader, SectionHeading } from '@/components/wallet/page-frame';
import { SeedsPanel } from '@/components/fairness/seeds-panel';
import { Verifier } from '@/components/fairness/verifier';
import { FairnessExplainer } from '@/components/fairness/explainer';
import { Skeleton } from '@/components/ui/skeleton';

export default function FairnessPage() {
  return (
    <PageContainer>
      <PageHeader
        icon={<ShieldCheck size={20} />}
        eyebrow="Provably fair"
        title="Fairness"
        description="Every result is derived from seeds committed before you play. Verify any round yourself — the verifier runs in your browser using the exact same code as our servers."
      />
      <div className="space-y-10">
        <section id="verify" className="scroll-mt-20">
          <SectionHeading title="Verify a result" description="Paste a revealed seed pair, or open a round from your history and choose “Verify result”." />
          <Suspense fallback={<Skeleton className="h-96 rounded-xl" />}>
            <Verifier />
          </Suspense>
        </section>
        <section id="seeds" className="scroll-mt-20">
          <SectionHeading title="Your seeds" description="Single-player games (Blackjack, Baccarat, Roulette, Slots) use your personal seed pair." />
          <SeedsPanel />
        </section>
        <section id="how" className="scroll-mt-20">
          <SectionHeading title="How it works" description="Commit, contribute, reveal, verify." />
          <FairnessExplainer />
        </section>
      </div>
    </PageContainer>
  );
}
