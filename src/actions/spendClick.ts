/**
 * Spending one click of the active player.
 */
import { activePlayer } from "../state/setupAndEnd/createGame.js";
import { noteRunnerClickSpend } from "../state/turnAndActions/clickHooks.js";
import type { ApplyResult } from "../state/types/actions.js";
import type { GameState } from "../state/types/game.js";
import type { RuleCite } from "../state/types/restrictions.js";
import { CR } from "../timing/labels.js";
import { withCostCheckpoint } from "../legality/checkpoints.js";

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

/**
 * Pay the click cost of a basic action whose whole cost is clicks, then the
 * checkpoint that follows any paid cost, before the action's effect
 * (CR 1.16.3, 10.3.4, 9.11.1a). `count` clicks are one cost: Enhanced Login
 * Protocol's extra click is paid with the run's own (CR 1.16.10b).
 */
export function spendActionClicks(
  state: GameState,
  openedBy: string,
  count = 1,
): ApplyResult | null {
  if (activePlayer(state).clicks < count) {
    return fail("No unspent clicks.", [CR.spendClicks, CR.actionPhase]);
  }
  let bad: ApplyResult | null = null;
  withCostCheckpoint(state, openedBy, () => {
    for (let i = 0; i < count && !bad; i++) bad = spendClick(state);
  });
  return bad;
}
