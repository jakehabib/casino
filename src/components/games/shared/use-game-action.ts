'use client';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { ApiError } from '@/lib/api';
import { toast } from '@/components/ui/toast';
import { useBalance } from '@/stores/balance-store';

const GATE_CODES = new Set(['COOLDOWN_ACTIVE', 'SELF_EXCLUDED', 'ACCOUNT_SUSPENDED', 'ACCOUNT_LOCKED', 'MAINTENANCE']);

/**
 * Standard error handling for game actions: friendly native error copy,
 * refresh the play gate if the account became restricted, and always
 * release any held display balance.
 */
export function useGameErrorHandler() {
  const qc = useQueryClient();
  return useCallback(
    (err: unknown) => {
      useBalance.getState().release();
      if (err instanceof ApiError || (err && typeof err === 'object' && 'code' in err)) {
        const e = err as ApiError & { code: string };
        if (GATE_CODES.has(e.code)) void qc.invalidateQueries({ queryKey: ['me'] });
        if (e.code === 'DAILY_WAGER_LIMIT' || e.code === 'DAILY_LOSS_LIMIT') {
          toast.error(e instanceof ApiError ? e.title : 'Limit reached', limitMessage(e));
          return;
        }
        toast.error(e instanceof ApiError ? e.title : 'Action failed', e.message);
        return;
      }
      toast.error('Something went wrong', 'Please try again.');
    },
    [qc],
  );
}

function limitMessage(e: { code: string; message: string; details?: Record<string, unknown> }) {
  const d = e.details ?? {};
  const resets = d.resetsAt ? new Date(String(d.resetsAt)).toLocaleString(undefined, { hour: 'numeric', minute: '2-digit', weekday: 'short' }) : null;
  const rem = typeof d.remaining === 'number' ? `${d.remaining.toLocaleString('en-US')} Credits remaining today.` : '';
  return `${rem}${resets ? ` Resets ${resets}.` : ''}`.trim() || e.message;
}
