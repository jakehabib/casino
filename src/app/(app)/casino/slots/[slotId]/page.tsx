'use client';
import { use } from 'react';
import { notFound } from 'next/navigation';
import { SLOT_UIS } from '@/components/games/slots/registry';

/** /casino/slots/[slotId] — lazily loads the machine's UI. Unknown ids → 404. */
export default function SlotPage({ params }: { params: Promise<{ slotId: string }> }) {
  const { slotId } = use(params);
  const Machine = Object.prototype.hasOwnProperty.call(SLOT_UIS, slotId) ? SLOT_UIS[slotId] : null;
  if (!Machine) notFound();
  return <Machine />;
}
