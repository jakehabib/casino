/**
 * Shared slot UI framework. A machine UI is usually just a SlotTheme passed
 * to <SlotMachine/>; bespoke layouts compose useSlotMachine + the parts.
 */
export * from './types';
export { useSlotMachine, type SlotMachineController, type SlotOverlay, type AutoplayConfig, type SlotPhase } from './use-slot-machine';
export { ReelGrid, type ReelGridProps } from './reel-grid';
export { WinOverlay } from './win-overlay';
export { WinTicker, BigWinOverlay, winTier, WIN_TIERS, type WinTier } from './win-counter';
export { FreeSpinsOverlay, FeatureBanner } from './free-spins-overlay';
export { SlotControls } from './slot-controls';
export { SlotPaytable } from './paytable';
export { BonusHud, MultiplierLadder } from './bonus-hud';
export { SlotMachine, SlotMachineView, SlotStage, savedBonusNote } from './slot-machine';
export { GenericSymbol, createGenericTheme, genericSymbolColor } from './generic-symbols';
