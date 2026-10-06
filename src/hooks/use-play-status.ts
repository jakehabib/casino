'use client';
import { useMe } from './use-me';

/** UI-only play gate (server enforces independently on every wager). */
export function usePlayStatus() {
  const { data, isLoading } = useMe();
  return { loading: isLoading, signedIn: !!data, play: data?.play ?? null };
}
