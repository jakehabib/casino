'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useUser } from '@/hooks/use-me';
import { useRouter } from 'next/navigation';

export function useFavorites() {
  const user = useUser();
  const qc = useQueryClient();
  const router = useRouter();
  const { data } = useQuery({
    queryKey: ['favorites'],
    queryFn: () => api.get<{ favorites: string[] }>('/api/favorites'),
    enabled: !!user,
  });
  const favs = new Set(data?.favorites ?? []);
  const m = useMutation({
    mutationFn: (v: { gameId: string; favorite: boolean }) => api.post('/api/favorites', v),
    onMutate: async (v) => {
      await qc.cancelQueries({ queryKey: ['favorites'] });
      const prev = qc.getQueryData<{ favorites: string[] }>(['favorites']);
      qc.setQueryData(['favorites'], {
        favorites: v.favorite ? [...(prev?.favorites ?? []), v.gameId] : (prev?.favorites ?? []).filter((g) => g !== v.gameId),
      });
      return { prev };
    },
    onError: (_e, _v, ctx) => ctx?.prev && qc.setQueryData(['favorites'], ctx.prev),
  });
  return {
    isFavorite: (id: string) => favs.has(id),
    toggle: (id: string) => {
      if (!user) return router.push('/login');
      m.mutate({ gameId: id, favorite: !favs.has(id) });
    },
  };
}

export function useRecentGames() {
  const user = useUser();
  return useQuery({
    queryKey: ['recent-games'],
    queryFn: () => api.get<{ games: string[] }>('/api/history/recent'),
    enabled: !!user,
    staleTime: 30_000,
  });
}
