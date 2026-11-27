/**
 * Costs and conditions that only the apply path computes in full: legality
 * asks apply instead of keeping its own copy.
 *
 * A rez cost has more than a dozen modifiers (CR 1.16.2a: Asteroid Belt's
 * advancement discount, Hernando Cortez, Watchdog, recurring credits, a
 * forfeit discount), and a steal can carry effect costs (SDS Drone
 * Deployment). A copy of that arithmetic in the candidate builder drifts
 * from apply, and a move apply takes but the list leaves out can never be
 * made at the table. So the candidate builder settles the move's shape
 * (the window, the target, rezzed or not) and this tries the move itself.
 */
import { applyActionCore } from "../actions/apply.js";
import type { Action } from "../state/types/actions.js";
import type { GameState } from "../state/types/game.js";

/**
 * True when apply takes `action` in `state`. Apply works on a copy, so
 * `state` is not changed (CR 1.16.1, 1.16.2a, 1.16.10b).
 */
export function applyTakes(state: GameState, action: Action): boolean {
  return applyActionCore(state, action).ok;
}
