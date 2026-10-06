import type { SlotDefinition } from '../types';
import { gildedVault } from './gilded-vault';
import { overcharge } from './overcharge';
import { starforgedRelics } from './starforged-relics';

export { gildedVault, overcharge, starforgedRelics };

/** Every machine, in lobby order. */
export const SLOT_DEFINITIONS: SlotDefinition[] = [gildedVault, overcharge, starforgedRelics];

const BY_ID: Record<string, SlotDefinition> = Object.fromEntries(SLOT_DEFINITIONS.map((d) => [d.id, d]));

export function getSlotDefinition(id: string): SlotDefinition | undefined {
  return Object.prototype.hasOwnProperty.call(BY_ID, id) ? BY_ID[id] : undefined;
}
