'use client';
import { useMemo } from 'react';
import { useSlotMachine } from './use-slot-machine';
import { SlotMachineView } from './slot-machine';
import { createGenericTheme } from './generic-symbols';
import { gameById } from '@/lib/games';

/**
 * Interim, neutral UI for machines whose bespoke art is not delivered yet.
 * Fully playable (same engine, framework and controls). Replace the entry in
 * src/components/games/slots/registry.tsx when the themed UI lands.
 */
export default function InterimMachine({ slotId }: { slotId: string }) {
  const m = useSlotMachine(slotId);
  const symbols = m.def?.symbols;
  const meta = gameById(slotId);
  const theme = useMemo(() => createGenericTheme(slotId, symbols ?? [], meta?.name), [slotId, symbols, meta?.name]);
  return <SlotMachineView m={m} slotId={slotId} theme={theme} title={meta?.name ?? slotId} subtitle={meta?.tagline} />;
}
