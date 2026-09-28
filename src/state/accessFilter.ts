/** Run-scoped access candidate filtering (Adrian Seis). */

import type { GameState } from "./types.js";

export function applyRunAccessRestrictions(state: GameState): void {
  const run = state.run;
  if (!run) return;
  let cands = run.accessCandidates;
  if (run.accessOnlyCardIds && run.accessOnlyCardIds.length > 0) {
    const allow = new Set(run.accessOnlyCardIds);
    cands = cands.filter((id) => allow.has(id));
  }
  if (run.forbiddenAccessCardIds && run.forbiddenAccessCardIds.length > 0) {
    const forbid = new Set(run.forbiddenAccessCardIds);
    cands = cands.filter((id) => !forbid.has(id));
  }
  run.accessCandidates = cands;
  if (run.accessRemaining !== null) {
    run.accessRemaining = Math.min(run.accessRemaining, cands.length);
  }
}
