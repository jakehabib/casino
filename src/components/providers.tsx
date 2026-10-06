'use client';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { MotionConfig } from 'framer-motion';
import { useEffect, useState, type ReactNode } from 'react';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Toaster, toast } from '@/components/ui/toast';
import { getSocket } from '@/lib/socket-client';
import { useBalance } from '@/stores/balance-store';
import { ApiError } from '@/lib/api';
import { playSound } from '@/audio/audio-manager';

function RealtimeBridge() {
  const qc = useQueryClient();
  useEffect(() => {
    const s = getSocket();
    const onWallet = (d: { balance: number; delta: number }) => {
      useBalance.getState().set(d.balance, d.delta > 0 ? d.delta : undefined);
    };
    const onLevel = (d: { level: number; milestone: boolean }) => {
      playSound('notify');
      toast.reward(`Level ${d.level} reached`, d.milestone ? 'A milestone reward is waiting in Rewards.' : 'Nice climb. Keep it going.');
      void qc.invalidateQueries({ queryKey: ['me'] });
    };
    const onXp = () => void qc.invalidateQueries({ queryKey: ['me'] });
    const onNotif = () => {
      void qc.invalidateQueries({ queryKey: ['notifications'] });
      void qc.invalidateQueries({ queryKey: ['me'] });
    };
    const onPlay = () => void qc.invalidateQueries({ queryKey: ['me'] });
    const onReconnect = () => void qc.invalidateQueries({ queryKey: ['me'] });
    s.on('wallet:update', onWallet);
    s.on('level:up', onLevel);
    s.on('xp:update', onXp);
    s.on('notification:new', onNotif);
    s.on('play:status', onPlay);
    s.on('connect', onReconnect);
    return () => {
      s.off('wallet:update', onWallet);
      s.off('level:up', onLevel);
      s.off('xp:update', onXp);
      s.off('notification:new', onNotif);
      s.off('play:status', onPlay);
      s.off('connect', onReconnect);
    };
  }, [qc]);
  return null;
}

export function Providers({ children }: { children: ReactNode }) {
  const [qc] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            retry: (n, err) => !(err instanceof ApiError && err.status >= 400 && err.status < 500) && n < 2,
            refetchOnWindowFocus: false,
          },
        },
      }),
  );
  return (
    <QueryClientProvider client={qc}>
      <MotionConfig reducedMotion="user">
        <TooltipProvider>
          <RealtimeBridge />
          {children}
          <Toaster />
        </TooltipProvider>
      </MotionConfig>
    </QueryClientProvider>
  );
}
