'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import { toast } from '@/components/ui/toast';
import type { getResponsiblePlaySummary } from '@/server/services/responsible-play/summary';
import type { ExclusionType } from './options';

export type RpSummary = Awaited<ReturnType<typeof getResponsiblePlaySummary>>;
export type LimitKind = 'DAILY_WAGER' | 'DAILY_LOSS';
export type PendingChange = NonNullable<RpSummary['limits']['dailyWager']['pending']>;

export const RP_KEY = ['responsible-play'] as const;

export function useRpSummary(enabled = true) {
  return useQuery({
    queryKey: RP_KEY,
    queryFn: () => api.get<RpSummary>('/api/responsible-play'),
    enabled,
    staleTime: 10_000,
    refetchInterval: 60_000,
  });
}

function useInvalidate() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: RP_KEY });
    void qc.invalidateQueries({ queryKey: ['me'] });
    void qc.invalidateQueries({ queryKey: ['rewards'] });
  };
}

function errorToast(e: unknown, fallback: string) {
  toast.error(e instanceof ApiError ? e.title : fallback, e instanceof Error ? e.message : undefined);
}

export function useSetLimit() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (v: { limitType: LimitKind; value: number | null }) =>
      api.post<{ applied: boolean; change: PendingChange | null }>('/api/responsible-play/limits', v),
    onSuccess: invalidate,
    onError: (e) => errorToast(e, 'Could not update limit'),
  });
}

export function useCancelChange() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (changeId: string) => api.post('/api/responsible-play/cancel', { changeId }),
    onSuccess: () => {
      toast.success('Request cancelled', 'Your current limit stays in place.');
      invalidate();
    },
    onError: (e) => {
      errorToast(e, 'Could not cancel');
      invalidate();
    },
  });
}

export function useSetTimezone() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (timezone: string) => api.post('/api/responsible-play/timezone', { timezone }),
    onSuccess: () => {
      toast.success('Timezone updated', 'Daily limits now reset at midnight in this timezone.');
      invalidate();
    },
    onError: (e) => errorToast(e, 'Could not update timezone'),
  });
}

export function useCreateExclusion() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (v: { type: ExclusionType; confirmation: string }) =>
      api.post<{ created: boolean; exclusion: NonNullable<RpSummary['exclusion']> }>('/api/responsible-play/exclusions', v),
    onSuccess: invalidate,
    onError: (e) => errorToast(e, 'Could not start'),
  });
}

export function useRequestReinstatement() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: () => api.post('/api/responsible-play/reinstatement', {}),
    onSuccess: () => {
      toast.success('Review requested', 'Our support team will be in touch. Play stays disabled meanwhile.');
      invalidate();
    },
    onError: (e) => errorToast(e, 'Could not request a review'),
  });
}
