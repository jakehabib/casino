'use client';
import { SlotMachine } from '../shared/slot-machine';
import { GildedVaultDefs } from './symbols';
import { gildedVaultTheme } from './theme';

/** Slot #1 — Gilded Vault. The shared framework + the Gilded Vault theme. */
export default function GildedVaultMachine() {
  return (
    <>
      <GildedVaultDefs />
      <SlotMachine slotId="gilded-vault" theme={gildedVaultTheme} title="Gilded Vault" subtitle="5×3 · 20 lines · expanding wilds in free spins" />
    </>
  );
}
