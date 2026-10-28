/**
 * Az McCaffrey: first job/connection resource or hardware install each turn
 * costs N¢ less.
 */

import { abilitiesSuppressed } from "./abilities.js";
import type { CardInstance, GameState } from "./types.js";

/** True when the card is hardware or a job/connection resource. */
export function isJobConnectionOrHardware(card: CardInstance): boolean {
  if (card.type === "hardware") return true;
  if (card.type === "resource") {
    const st = card.subtypes ?? [];
    return st.includes("job") || st.includes("connection");
  }
  return false;
}

/**
 * Discount amount from identity / installed cards if this is the first
 * matching install this turn; else 0.
 */
export function azJobConnectionOrHardwareInstallDiscount(
  state: GameState,
  card: CardInstance,
): number {
  if (!isJobConnectionOrHardware(card)) return 0;
  if (state.turn.jobConnectionOrHardwareInstallDiscountUsedThisTurn) return 0;
  let d = 0;
  const identityId = state.runner.identityId;
  if (!abilitiesSuppressed(state, identityId)) {
    d = Math.max(
      d,
      state.cards[identityId]?.firstJobConnectionOrHardwareInstallDiscount ?? 0,
    );
  }
  for (const rid of state.runner.installed) {
    if (abilitiesSuppressed(state, rid)) continue;
    d = Math.max(
      d,
      state.cards[rid]?.firstJobConnectionOrHardwareInstallDiscount ?? 0,
    );
  }
  return d;
}

/** Bookkeep after installing a job/connection resource or hardware. */
export function noteJobConnectionOrHardwareInstalled(
  state: GameState,
  installed: CardInstance,
): void {
  if (isJobConnectionOrHardware(installed)) {
    state.turn.jobConnectionOrHardwareInstallDiscountUsedThisTurn = true;
  }
}
