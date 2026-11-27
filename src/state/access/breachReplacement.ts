/**
 * "Instead of breaching" abilities replace the breach of a successful run.
 * Once one replacement has applied, no breach is expected any more, so a
 * later one has nothing to replace and cannot apply (CR 9.9.11a).
 */
import { log } from "../setupAndEnd/createGame.js";
import type { GameState } from "../types.js";
import { CR } from "../../timing/labels.js";

/** True, with a log line, when an earlier replacement already took the breach. */
export function breachAlreadyReplaced(
  state: GameState,
  sourceId: string,
): boolean {
  if (!state.run?.skipBreach || state.run.skipBreachFromRunStart) return false;
  const title = state.cards[sourceId]?.title ?? sourceId;
  log(
    state,
    `${title} — the breach was already replaced, so there is nothing left to replace (CR ${CR.replacementMustReplace.number}).`,
  );
  return true;
}
