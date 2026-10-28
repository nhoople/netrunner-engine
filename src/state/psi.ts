/** Psi games (CR 10.14.6) — v0 sequential bids like trace boost. */

import { evalEffect } from "../effects/eval.js";
import { firePsiCreditsRevealed } from "./storedTriggers.js";
import type { Effect } from "../effects/ir.js";
import { abilitiesSuppressed } from "./abilities.js";
import { log } from "./createGame.js";
import {
  activeCorpCurrentIds,
  activeRunnerCurrentIds,
} from "./currents.js";
import { dealDamage } from "./damage.js";
import { hostedCreditsSpendableDuringRuns, subtractRunnerCreditPool } from "./costs.js";
import type { GameState } from "./types.js";
import { CR } from "../timing/labels.js";

let psiSeq = 0;

function secretSpendBannedAmount(state: GameState): number | null {
  for (const id of [
    ...activeCorpCurrentIds(state),
    ...activeRunnerCurrentIds(state),
  ]) {
    if (abilitiesSuppressed(state, id)) continue;
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
  opts?: { corpGuess?: "amount" | "parity" },
): void {
  state.psi = {
    id: `psi-${++psiSeq}`,
    sourceId,
    maxBid,
    runnerBid: null,
    corpBid: null,
    ifBidsDiffer: structuredClone(ifBidsDiffer),
    ifBidsMatch: structuredClone(ifBidsMatch),
    corpGuess: opts?.corpGuess,
  };
  log(
    state,
    `Psi game initiated (max bid ${maxBid}¢) from ${sourceId} (CR ${CR.trace.number} analog).`,
  );
}

function runnerCannotSpendForBid(state: GameState): boolean {
  return Boolean(
    state.run?.runnerCannotSpendCreditsForRun ||
      state.run?.runnerCannotSpendCredits,
  );
}

/** Credits the Runner can spend on a psi bid (CR 10.14.3). */
export function runnerPsiSpendable(state: GameState): number {
  if (runnerCannotSpendForBid(state)) return 0;
  return state.runner.credits + hostedCreditsSpendableDuringRuns(state);
}

/** Credits the Corp can spend on a psi bid (CR 10.14.3). */
export function corpPsiSpendable(state: GameState): number {
  return state.corp.credits;
}

function spendRunnerPsiBid(state: GameState, amount: number): void {
  let left = amount;
  const fromPool = Math.min(left, state.runner.credits);
  subtractRunnerCreditPool(state, fromPool);
  left -= fromPool;
  if (left <= 0 || !state.run) return;
  for (const id of state.runner.installed) {
    if (left <= 0) break;
    if (abilitiesSuppressed(state, id)) continue;
    const card = state.cards[id];
    if (!card?.spendHostedCreditsDuringRuns) continue;
    const pool = card.hostedCredits ?? 0;
    if (pool <= 0) continue;
    const take = Math.min(left, pool);
    card.hostedCredits = pool - take;
    left -= take;
    log(state, `Spend ${take}¢ from ${card.title}.`);
  }
}

export function psiRunnerBid(state: GameState, amount: number): string | null {
  const psi = state.psi;
  if (!psi) return "No psi game in progress.";
  if (psi.runnerBid !== null) return "Runner already bid.";
  const banned = secretSpendBannedAmount(state);
  if (banned !== null && amount === banned) {
    return `Cannot secretly spend exactly ${banned}¢ (Government Investigations).`;
  }
  if (amount < 0 || amount > psi.maxBid) return "Bid is outside the allowed range.";
  const spendable = runnerPsiSpendable(state);
  if (amount > spendable) {
    return `Cannot bid ${amount}¢ — the Runner can spend ${spendable}¢ (CR ${CR.bidPossible.number}).`;
  }
  psi.runnerBid = amount;
  log(
    state,
    `Runner bids ${amount}¢ in psi game (CR ${CR.bidPossible.number}).`,
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
  if (psi.corpGuess === "parity") {
    if (amount !== 0 && amount !== 1) {
      return "Guess 0 (even) or 1 (odd).";
    }
  } else if (amount < 0 || amount > psi.maxBid) {
    return "Bid is outside the allowed range.";
  }
  if (!psi.corpGuess) {
    const spendable = corpPsiSpendable(state);
    if (amount > spendable) {
      return `Cannot bid ${amount}¢ — the Corp can spend ${spendable}¢ (CR ${CR.bidPossible.number}).`;
    }
  }
  psi.corpBid = amount;
  log(
    state,
    psi.corpGuess
      ? `Corp guesses in psi game from ${psi.sourceId}.`
      : `Corp bids ${amount}¢ in psi game (CR ${CR.bidPossible.number}).`,
  );
  resolvePsi(state);
  return null;
}

function resolvePsi(state: GameState): void {
  const psi = state.psi;
  if (!psi || psi.runnerBid === null || psi.corpBid === null) return;
  const match =
    psi.corpGuess === "parity"
      ? psi.runnerBid % 2 === psi.corpBid
      : psi.runnerBid === psi.corpBid;
  spendRunnerPsiBid(state, psi.runnerBid);
  state.turn.lastRevealedRunnerSecretSpend = psi.runnerBid;
  if (!psi.corpGuess) state.corp.credits -= psi.corpBid;
  log(
    state,
    psi.corpGuess
      ? `Revealed — Runner spent ${psi.runnerBid}¢; the Corp guessed ${psi.corpGuess === "parity" ? (psi.corpBid === 0 ? "even" : "odd") : `${psi.corpBid}¢`} (CR ${CR.psiRevealSpend.number}).`
      : `Bids revealed — Runner spends ${psi.runnerBid}¢ and the Corp spends ${psi.corpBid}¢ (CR ${CR.psiRevealSpend.number}).`,
  );
  firePsiCreditsRevealed(state);
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
  if (!psi.corpGuess && psi.runnerBid !== psi.corpBid) {
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
