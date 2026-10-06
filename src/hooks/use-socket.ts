'use client';
import { useEffect, useState } from 'react';
import { getSocket } from '@/lib/socket-client';

export type ConnState = 'connected' | 'reconnecting' | 'offline';

export function useConnectionState(): ConnState {
  const [state, setState] = useState<ConnState>('connected');
  useEffect(() => {
    const s = getSocket();
    const up = () => setState('connected');
    const down = () => setState(typeof navigator !== 'undefined' && !navigator.onLine ? 'offline' : 'reconnecting');
    if (!s.connected) setTimeout(() => !s.connected && down(), 1500);
    s.on('connect', up);
    s.on('disconnect', down);
    s.io.on('reconnect_attempt', down);
    return () => {
      s.off('connect', up);
      s.off('disconnect', down);
      s.io.off('reconnect_attempt', down);
    };
  }, []);
  return state;
}

/** Subscribe to a socket event for the component's lifetime. */
export function useSocketEvent<T = unknown>(event: string, handler: (data: T) => void) {
  useEffect(() => {
    const s = getSocket();
    s.on(event, handler as (...args: unknown[]) => void);
    return () => {
      s.off(event, handler as (...args: unknown[]) => void);
    };
  }, [event, handler]);
}

export interface Presence {
  online: number;
  users: number;
  games: Record<string, number>;
}

export function usePresenceDetail(): Presence | null {
  const [p, setP] = useState<Presence | null>(null);
  useEffect(() => {
    const s = getSocket();
    const on = (d: Presence) => setP(d);
    s.on('presence', on);
    s.emit('presence:get', on);
    return () => {
      s.off('presence', on);
    };
  }, []);
  return p;
}

export function usePresence() {
  return usePresenceDetail()?.online ?? null;
}

/** Report that this tab is viewing a game (drives per-game player counts). */
export function useGamePresence(gameId: string) {
  useEffect(() => {
    const s = getSocket();
    const send = () => s.emit('presence:game', gameId);
    send();
    s.on('connect', send);
    return () => {
      s.off('connect', send);
      s.emit('presence:game', null);
    };
  }, [gameId]);
}
