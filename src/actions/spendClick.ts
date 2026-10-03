/**
 * Spending one click of the active player.
 */
import { activePlayer } from "../state/createGame.js";
import { noteRunnerClickSpend } from "../state/clickHooks.js";
import type { ApplyResult, GameState, RuleCite } from "../state/types.js";
import { CR } from "../timing/labels.js";

function fail(error: string, cites: RuleCite[]): ApplyResult {
  return { ok: false, error, cites };
}

export function spendClick(state: GameState): ApplyResult | null {
  const p = activePlayer(state);
  if (p.clicks < 1) {
    return fail("No unspent clicks.", [CR.spendClicks, CR.actionPhase]);
  }
  p.clicks -= 1;
  if (state.activeSide === "runner") {
    state.turn.runnerClicksSpentThisTurn =
      (state.turn.runnerClicksSpentThisTurn ?? 0) + 1;
    noteRunnerClickSpend(state);
  }
  return null;
}
