/** Run-scoped access candidate filtering (Adrian Seis / Flagship). */

import type { GameState } from "./types.js";
import { abilitiesSuppressed } from "./abilities.js";
import { log } from "./createGame.js";
import { CR } from "../timing/labels.js";

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
  if (state.turn.cannotAccessCardIdsThisTurn.length > 0) {
    const forbid = new Set(state.turn.cannotAccessCardIdsThisTurn);
    cands = cands.filter((id) => !forbid.has(id));
  }
  run.accessCandidates = cands;
  applyMaxAccessOtherThanSelf(state);
  if (
    run.randomAccessLimit !== null &&
    run.attackedServerId !== "rd" &&
    (run.prunedAccessCandidateIds?.length ?? 0) === 0
  ) {
    run.randomAccessLimit = Math.min(run.randomAccessLimit, run.accessCandidates.length);
  }
}

/**
 * Flagship: while rezzed, Runner may access at most N cards other than this
 * upgrade. Caps randomAccessLimit and prunes non-self candidates once the
 * other-access budget is spent.
 */
export function applyMaxAccessOtherThanSelf(state: GameState): void {
  const run = state.run;
  if (!run) return;
  const server = state.servers[run.attackedServerId];
  if (!server) return;
  let capped = false;
  for (const id of server.root) {
    if (abilitiesSuppressed(state, id)) continue;
    const card = state.cards[id];
    if (!card?.rezzed || card.maxAccessOtherThanSelf === undefined) continue;
    const maxOther = card.maxAccessOtherThanSelf;
    const accessedOther = run.accessedCardIds.filter((cid) => cid !== id).length;
    if (accessedOther >= maxOther) {
      capped = true;
      const removed = run.accessCandidates.filter((cid) => cid !== id);
      run.prunedAccessCandidateIds = [
        ...new Set([...(run.prunedAccessCandidateIds ?? []), ...removed]),
      ];
      const before = run.accessCandidates.length;
      run.accessCandidates = run.accessCandidates.filter((cid) => cid === id);
      if (before !== run.accessCandidates.length) {
        log(
          state,
          `${card.title} — access cap reached; only this upgrade remains accessible.`,
        );
      }
    }
  }
  if (!capped && (run.prunedAccessCandidateIds?.length ?? 0) > 0) {
    const restored: string[] = [];
    const pool = [
      ...(run.prunedAccessCandidateIds ?? []),
      ...(run.attackedServerId === "hq" ? state.corp.hand : []),
    ];
    for (const id of pool) {
      if (run.accessedCardIds.includes(id) || run.accessCandidates.includes(id)) continue;
      const stillHere =
        state.corp.hand.includes(id) ||
        server.root.includes(id) ||
        state.corp.discardPile.includes(id) ||
        state.corp.deck.includes(id);
      if (!stillHere) continue;
      run.accessCandidates.push(id);
      restored.push(id);
    }
    run.prunedAccessCandidateIds = [];
    if (restored.length > 0) {
      log(
        state,
        `Access restriction ended — ${restored.length} card(s) are candidates again (CR ${CR.prohibitionRemoved.number}).`,
      );
    }
  }
}
