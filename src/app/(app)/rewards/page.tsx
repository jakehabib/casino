'use client';
import { Gift } from 'lucide-react';
import { PageContainer, PageHeader, RequireAuth } from '@/components/wallet/page-frame';
import { RewardsView } from '@/components/rewards/rewards-view';

export default function RewardsPage() {
  return (
    <PageContainer>
      <PageHeader
        icon={<Gift size={20} />}
        eyebrow="Free Credits"
        title="Rewards"
        description="Free play-money Credits every day, a refill when you run low, a weekly bonus and milestone rewards as you level up."
      />
      <RequireAuth title="your rewards">{(me) => <RewardsView me={me} />}</RequireAuth>
    </PageContainer>
  );
}
