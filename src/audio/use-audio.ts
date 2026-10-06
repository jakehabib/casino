'use client';
import { useEffect, useState } from 'react';
import { AudioManager, DEFAULT_PREFS, type AudioPrefs } from './audio-manager';

export function useAudioPrefs() {
  const [prefs, setLocal] = useState<AudioPrefs>(DEFAULT_PREFS);
  useEffect(() => {
    setLocal(AudioManager.prefs);
    return AudioManager.subscribe(setLocal);
  }, []);
  return { prefs, setPrefs: (p: Partial<AudioPrefs>) => AudioManager.setPrefs(p) };
}
