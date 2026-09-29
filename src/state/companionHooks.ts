/**
 * Keiko-class companion install / companion credit-spend triggers.
 */

import { log } from "./createGame.js";
import type { GameState } from "./types.js";

/**
 * First companion install or companion credit-spend this turn gains credits
 * from any installed card with
 * `gainCreditsOnFirstCompanionInstallOrSpendThisTurn`.
 */
export function maybeFireCompanionInstallOrSpendCredits(
  state: GameState,
): void {
  if (state.turn.companionInstallOrSpendCreditsFiredThisTurn) return;
  let gained = 0;
  let label = "";
  for (const id of state.runner.rig) {
    const card = state.cards[id];
    const n = card?.gainCreditsOnFirstCompanionInstallOrSpendThisTurn;
    if (!n || n <= 0) continue;
    gained += n;
    if (!label) label = card!.title;
  }
  if (gained <= 0) return;
  state.turn.companionInstallOrSpendCreditsFiredThisTurn = true;
  state.runner.credits += gained;
  log(
    state,
    `${label} — gain ${gained}¢ (first companion install/spend this turn).`,
  );
}
