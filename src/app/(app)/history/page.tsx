'use client';
import Link from 'next/link';
import { History, ShieldCheck } from 'lucide-react';
import { PageContainer, PageHeader, RequireAuth } from '@/components/wallet/page-frame';
import { HistoryView } from '@/components/history/history-view';
import { Button } from '@/components/ui/button';

export default function HistoryPage() {
  return (
    <PageContainer>
      <PageHeader
        icon={<History size={20} />}
        eyebrow="Your account"
        title="Game history"
        description="Every settled round, newest first. Open a round to see exactly what happened and verify it."
        actions={
          <Link href="/fairness">
            <Button variant="subtle" size="sm" leftIcon={<ShieldCheck size={14} />}>
              Fairness & seeds
            </Button>
          </Link>
        }
      />
      <RequireAuth title="your game history">{() => <HistoryView />}</RequireAuth>
    </PageContainer>
  );
}
