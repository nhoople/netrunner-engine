/** Run-scoped access candidate filtering (Adrian Seis / Flagship). */

import type { GameState } from "./types.js";
import { log } from "./createGame.js";

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
  applyMaxAccessOtherThanSelf(state);
  if (run.accessRemaining !== null) {
    run.accessRemaining = Math.min(run.accessRemaining, run.accessCandidates.length);
  }
}

/**
 * Flagship: while rezzed, Runner may access at most N cards other than this
 * upgrade. Caps accessRemaining and prunes non-self candidates once the
 * other-access budget is spent.
 */
export function applyMaxAccessOtherThanSelf(state: GameState): void {
  const run = state.run;
  if (!run) return;
  const server = state.servers[run.attackedServerId];
  if (!server) return;
  for (const id of server.root) {
    const card = state.cards[id];
    if (!card?.rezzed || card.maxAccessOtherThanSelf === undefined) continue;
    const maxOther = card.maxAccessOtherThanSelf;
    const accessedOther = run.accessedCardIds.filter((cid) => cid !== id).length;
    const selfInCands = run.accessCandidates.includes(id);
    if (accessedOther >= maxOther) {
      const before = run.accessCandidates.length;
      run.accessCandidates = run.accessCandidates.filter((cid) => cid === id);
      if (before !== run.accessCandidates.length) {
        log(
          state,
          `${card.title} — access cap reached; only this upgrade remains accessible.`,
        );
      }
    }
    const othersLeft = Math.max(0, maxOther - accessedOther);
    const cap = othersLeft + (selfInCands ? 1 : 0);
    if (run.accessRemaining !== null) {
      run.accessRemaining = Math.min(run.accessRemaining, cap);
    }
  }
}
