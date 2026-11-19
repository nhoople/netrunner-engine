/**
 * Test driver: pass for a seat that has nothing to do.
 *
 * The engine gives the second player priority in every paid ability window
 * (CR 9.2.7a), including the run's windows (CR 6.9.1e, 6.9.4b, 6.9.4e), and
 * in the step for abilities used when the Runner approaches the server
 * (CR 6.9.4g; a reaction window, CR 9.2.8b), even when a player's only
 * option is to pass. It no longer passes for them: whether a player could act
 * may depend on hidden information (CR 10.2.2a), so passing for a player is
 * left to the host, as its own policy, judged on open information.
 *
 * Tests and playouts written before that change drive the game as if those
 * windows closed by themselves. `passIdle` plays the pass a passive driver
 * would make, in exactly the places the engine used to skip:
 * - the second player in a priority window with no window act of their own;
 * - an initiation, pass-ice, after-move, or approach-server window where
 *   neither player has a window act.
 * It reads the engine's own candidates, which include hidden cards, so it is
 * a test driver and not something a seat may see.
 */
import { applyAction } from "../actions/apply.js";
import { collectCandidateActions } from "../legality/candidates.js";
import {
  actorSideForAction,
  currentPriorityWindow,
  isWindowAct,
} from "../legality/priority.js";
import type { GameState } from "../state/types.js";

const QUIET_RUN_WINDOWS = new Set([
  "run.initiatePaw",
  "run.passIcePaw",
  "run.afterMovePaw",
  "run.approachServerPaw",
]);

function idle(state: GameState): boolean {
  if (state.done || state.pendingChoice) return false;
  const frame = currentPriorityWindow(state);
  if (!frame || frame.stepKey !== state.timingKey) return false;
  const second = frame.consecutivePasses === 1;
  const quiet =
    frame.consecutivePasses === 0 && QUIET_RUN_WINDOWS.has(state.timingKey);
  if (!second && !quiet) return false;
  const acts = collectCandidateActions(state).filter(isWindowAct);
  if (second)
    return !acts.some(
      (action) => actorSideForAction(action, state) === frame.priorityHolder,
    );
  return acts.length === 0;
}

/** Pass for idle seats until a seat has something to decide. */
export function passIdle(state: GameState): GameState {
  for (let i = 0; i < 64 && idle(state); i += 1) {
    const result = applyAction(state, { type: "pass_window" });
    if (!result.ok) return state;
    state = result.state;
  }
  return state;
}
