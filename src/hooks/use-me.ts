'use client';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { MePayload } from '@/server/services/account/me';
import { useBalance } from '@/stores/balance-store';

export type Me = MePayload;

export function useMe() {
  return useQuery({
    queryKey: ['me'],
    queryFn: async () => {
      const res = await api.get<MePayload | { user: null }>('/api/me');
      if (!res.user) return null;
      const me = res as MePayload;
      useBalance.getState().set(me.balance);
      return me;
    },
    staleTime: 30_000,
  });
}

/** Signed-in user or null; `undefined` while loading. */
export function useUser() {
  const { data, isLoading } = useMe();
  return isLoading ? undefined : (data?.user ?? null);
}
