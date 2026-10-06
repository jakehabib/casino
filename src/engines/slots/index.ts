/**
 * Slot engine public surface. See ./types.ts for the outcome contract and
 * ./engine.ts for the RNG draw order.
 */
export * from './types';
export { spin, compile, gravityPlan, parseBonusState } from './engine';
export { SLOT_DEFINITIONS, getSlotDefinition, gildedVault, overcharge, starforgedRelics } from './definitions';
export { toPublicDefinition, formatPayX, type PublicSlotDefinition, type PublicSymbol, type PublicPay } from './public';
export { verifySlotSpin } from './verify';
