/** Psi games (CR 10.14.6) — v0 sequential bids like trace boost. */

import { evalEffect } from "../effects/eval.js";
import type { Effect } from "../effects/ir.js";
import { log } from "./createGame.js";
import {
  activeCorpCurrentIds,
  activeRunnerCurrentIds,
} from "./currents.js";
import { dealDamage } from "./damage.js";
import type { GameState } from "./types.js";
import { CR } from "../timing/labels.js";

let psiSeq = 0;

function secretSpendBannedAmount(state: GameState): number | null {
  for (const id of [
    ...activeCorpCurrentIds(state),
    ...activeRunnerCurrentIds(state),
  ]) {
    const n = state.cards[id]?.secretSpendCannotEqual;
    if (typeof n === "number") return n;
  }
  return null;
}

export function startPsiGame(
  state: GameState,
  sourceId: string,
  maxBid: number,
  ifBidsDiffer: Effect,
  ifBidsMatch: Effect,
): void {
  state.psi = {
    id: `psi-${++psiSeq}`,
    sourceId,
    maxBid,
    runnerBid: null,
    corpBid: null,
    ifBidsDiffer: structuredClone(ifBidsDiffer),
    ifBidsMatch: structuredClone(ifBidsMatch),
  };
  log(
    state,
    `Psi game initiated (max bid ${maxBid}¢) from ${sourceId} (CR ${CR.trace.number} analog).`,
  );
}

export function psiRunnerBid(state: GameState, amount: number): string | null {
  const psi = state.psi;
  if (!psi) return "No psi game in progress.";
  if (psi.runnerBid !== null) return "Runner already bid.";
  const banned = secretSpendBannedAmount(state);
  if (banned !== null && amount === banned) {
    return `Cannot secretly spend exactly ${banned}¢ (Government Investigations).`;
  }
  const bid = Math.max(0, Math.min(psi.maxBid, amount));
  const spend = Math.min(bid, state.runner.credits);
  state.runner.credits -= spend;
  psi.runnerBid = spend;
  log(
    state,
    `Runner bids ${spend}¢ in psi game (spent ${spend}¢, CR 10.14.6 v0 sequential).`,
  );
  return null;
}

export function psiCorpBid(state: GameState, amount: number): string | null {
  const psi = state.psi;
  if (!psi) return "No psi game in progress.";
  if (psi.runnerBid === null) return "Runner must bid first.";
  if (psi.corpBid !== null) return "Corp already bid.";
  const banned = secretSpendBannedAmount(state);
  if (banned !== null && amount === banned) {
    return `Cannot secretly spend exactly ${banned}¢ (Government Investigations).`;
  }
  const bid = Math.max(0, Math.min(psi.maxBid, amount));
  const spend = Math.min(bid, state.corp.credits);
  state.corp.credits -= spend;
  psi.corpBid = spend;
  log(
    state,
    `Corp bids ${spend}¢ in psi game (spent ${spend}¢, CR 10.14.6 v0 sequential).`,
  );
  resolvePsi(state);
  return null;
}

function resolvePsi(state: GameState): void {
  const psi = state.psi;
  if (!psi || psi.runnerBid === null || psi.corpBid === null) return;
  const match = psi.runnerBid === psi.corpBid;
  log(
    state,
    `Psi resolves: Runner ${psi.runnerBid}¢ vs Corp ${psi.corpBid}¢ → ${match ? "match" : "differ"}.`,
  );
  // Hyoubu Research Facility: first reveal of secretly spent credits each turn.
  if (!state.turn.hyoubuSecretSpendGainUsedThisTurn) {
    for (const server of Object.values(state.servers)) {
      for (const id of server.root) {
        const card = state.cards[id];
        if (!card?.rezzed || !card.firstRevealSecretlySpentCreditsGainThatManyEachTurn) {
          continue;
        }
        const gained = psi.corpBid;
        if (gained > 0) {
          state.corp.credits += gained;
          state.turn.hyoubuSecretSpendGainUsedThisTurn = true;
          log(
            state,
            `${card.title} — gain ${gained}¢ (first secretly spent credits revealed this turn).`,
          );
        }
        break;
      }
      if (state.turn.hyoubuSecretSpendGainUsedThisTurn) break;
    }
  }
  // Fumiko Yamamori: meat when secretly spent amounts differ.
  if (psi.runnerBid !== psi.corpBid) {
    for (const server of Object.values(state.servers)) {
      for (const id of server.root) {
        const card = state.cards[id];
        const n = card?.rezzed
          ? (card.meatDamageWhenSecretSpendAmountsDiffer ?? 0)
          : 0;
        if (n <= 0) continue;
        dealDamage(state, "meat", n, id);
        log(
          state,
          `${card!.title} — ${n} meat damage (secret spends differed).`,
        );
      }
    }
  }
  const effect = match ? psi.ifBidsMatch : psi.ifBidsDiffer;
  state.psi = null;
  const r = evalEffect({ state, sourceId: psi.sourceId }, effect);
  if (!r.ok) {
    log(state, `Psi branch failed: ${r.error}`);
  }
}
