'use client';
import { useQuery } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import type { PublicProfile, OwnProfile } from '@/server/services/profile/profile-service';

export type { PublicProfile, OwnProfile };

export function usePublicProfile(username: string, enabled = true) {
  return useQuery({
    queryKey: ['profile', username.toLowerCase()],
    queryFn: () => api.get<PublicProfile>(`/api/users/${encodeURIComponent(username.toLowerCase())}`),
    enabled: enabled && !!username,
    staleTime: 30_000,
    retry: (n, err) => !(err instanceof ApiError && err.code === 'NOT_FOUND') && n < 2,
  });
}

export function useOwnProfile(enabled = true) {
  return useQuery({
    queryKey: ['profile-me'],
    queryFn: () => api.get<OwnProfile>('/api/profile/me'),
    enabled,
    staleTime: 15_000,
  });
}
