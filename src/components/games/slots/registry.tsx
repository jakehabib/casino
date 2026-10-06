'use client';
import dynamic from 'next/dynamic';
import type { ComponentType } from 'react';
import { Skeleton } from '@/components/ui/skeleton';

/**
 * Machine UI registry for /casino/slots/[slotId]. Each machine's UI is
 * code-split (next/dynamic) so a player only downloads the art for the
 * machine they open.
 *
 * Overcharge and Starforged Relics currently use the neutral interim UI;
 * swap their entries for `import('./overcharge/...')` / `import('./starforged-relics/...')`
 * when the themed UIs are delivered.
 */
const loading = () => (
  <div className="mx-auto w-full max-w-[1320px] px-3 pt-3 sm:px-5 sm:pt-5">
    <Skeleton className="mb-3 h-7 w-48" />
    <Skeleton className="aspect-[16/10] w-full rounded-xl" />
  </div>
);

const Interim = dynamic(() => import('./shared/interim-machine'), { loading, ssr: false });

export const SLOT_UIS: Record<string, ComponentType> = {
  'gilded-vault': dynamic(() => import('./gilded-vault/gilded-vault-machine'), { loading, ssr: false }),
  overcharge: dynamic(() => import('./overcharge/overcharge-machine'), { loading, ssr: false }),
  'starforged-relics': dynamic(() => import('./starforged-relics/starforged-machine'), { loading, ssr: false }),
};
