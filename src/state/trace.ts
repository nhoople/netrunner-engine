/** Trace initiation and resolution (CR 10.8). */

import { evalEffect, type EffectCtx } from "../effects/eval.js";
import type { Effect } from "../effects/ir.js";
import { log } from "./createGame.js";
import type { GameState } from "./types.js";
import { CR } from "../timing/labels.js";
import { runnerCreditsFor, spendRunnerCreditsFor } from "./costs.js";

/** Credits available for Corp trace boosts (bank + Making News-class recurring). */
export function corpCreditsForTrace(state: GameState): number {
  let total = state.corp.credits;
  const id = state.cards[state.corp.identityId];
  if ((id?.recurringSpendFor ?? []).includes("trace")) {
    total += id?.recurringCredits ?? 0;
  }
  for (const server of Object.values(state.servers)) {
    for (const rid of [...server.root, ...server.ice]) {
      const card = state.cards[rid];
      if (!card?.rezzed) continue;
      if ((card.recurringSpendFor ?? []).includes("trace")) {
        total += card.recurringCredits ?? 0;
      }
    }
  }
  return total;
}

/** Spend Corp credits for a trace boost, preferring `trace` recurring pools. */
function spendCorpCreditsForTrace(state: GameState, amount: number): void {
  let left = amount;
  if (left <= 0) return;
  const trySpend = (cardId: string): void => {
    if (left <= 0) return;
    const card = state.cards[cardId];
    if (!card) return;
    if (!(card.recurringSpendFor ?? []).includes("trace")) return;
    const pool = card.recurringCredits ?? 0;
    if (pool <= 0) return;
    const take = Math.min(left, pool);
    card.recurringCredits = pool - take;
    left -= take;
    if (take > 0) {
      log(
        state,
        `Spend ${take}¢ from ${card.title} recurring credits (trace).`,
      );
    }
  };
  trySpend(state.corp.identityId);
  for (const server of Object.values(state.servers)) {
    for (const rid of [...server.root, ...server.ice]) {
      if (!state.cards[rid]?.rezzed) continue;
      trySpend(rid);
    }
  }
  state.corp.credits -= left;
}

let traceSeq = 0;

export function startTrace(
  state: GameState,
  sourceId: string,
  baseStrength: number,
  onSuccess: Effect,
  onFailure?: Effect,
): void {
  state.trace = {
    id: `trace-${++traceSeq}`,
    sourceId,
    baseStrength,
    corpSpent: 0,
    runnerLinkSpent: 0,
    onSuccess,
    onFailure,
  };
  // Net Quarantine: first trace each turn → Runner link treated as 0.
  if (!state.turn.netQuarantineFirstTraceUsedThisTurn) {
    const nq = state.corp.score.some(
      (id) => state.cards[id]?.firstTraceEachTurnRunnerLinkTreatedAs0,
    );
    if (nq) {
      state.trace.netQuarantineLinkZero = true;
      state.turn.netQuarantineFirstTraceUsedThisTurn = true;
    }
  }
  log(
    state,
    `Trace initiated strength ${baseStrength} (CR ${CR.trace.number}) from ${sourceId}.`,
  );
  for (const id of state.runner.rig) {
    const card = state.cards[id];
    const n = card?.gainCreditsOnTraceInitiated ?? 0;
    if (n > 0) {
      state.runner.credits += n;
      log(state, `${card.title} — gain ${n}¢ (trace initiated).`);
    }
  }
}

export function boostTrace(state: GameState, credits: number): string | null {
  if (!state.trace) return "No trace in progress.";
  if (credits < 0) return "Cannot spend negative credits.";
  if (corpCreditsForTrace(state) < credits) {
    return "Insufficient Corp credits.";
  }
  spendCorpCreditsForTrace(state, credits);
  state.trace.corpSpent += credits;
  log(
    state,
    `Corp boosts trace by ${credits}¢ → strength ${traceStrength(state)} (CR ${CR.traceStrength.number}).`,
  );
  return null;
}

/**
 * Runner spends credits to increase link strength (CR 10.8.3 / 10.8.6d).
 * `amount` is credits spent (Action type remains `spend_link` for API stability).
 * Link strength = base link + credits spent this attempt.
 * Prefers Compromised Employee-class `trace` recurring credits.
 */
export function spendLink(state: GameState, amount: number): string | null {
  if (!state.trace) return "No trace in progress.";
  if (amount < 0) return "Cannot spend negative credits.";
  if (runnerCreditsFor(state, "trace") < amount) {
    return "Insufficient Runner credits.";
  }
  spendRunnerCreditsFor(state, amount, "trace");
  state.trace.runnerLinkSpent += amount;
  // Net Quarantine: Corp gains 1¢ for every 2¢ Runner spends for link.
  const nqGain = state.corp.score.some(
    (id) => state.cards[id]?.gainCreditsWhenRunnerSpendsForLinkPer2Spent,
  );
  if (nqGain && amount >= 2) {
    const gain = Math.floor(amount / 2);
    state.corp.credits += gain;
    log(state, `Net Quarantine — Corp gains ${gain}¢ (Runner spent ${amount}¢ for link).`);
  }
  log(
    state,
    `Runner spends ${amount}¢ → link strength ${runnerTraceLink(state)} (CR ${CR.linkStrength.number}).`,
  );
  return null;
}

export function traceStrength(state: GameState): number {
  if (!state.trace) return 0;
  return state.trace.baseStrength + state.trace.corpSpent;
}

/** Runner link strength = link value + credits spent (CR 10.8.3). */
export function runnerTraceLink(state: GameState): number {
  if (!state.trace) return 0;
  const base = state.trace.netQuarantineLinkZero ? 0 : state.runner.link;
  return base + state.trace.runnerLinkSpent;
}

/** Resolve the current trace. Success if strength >= runner link strength
 * (CR 10.8).
 */
export function resolveTrace(
  state: GameState,
): { ok: true } | { ok: false; error: string } {
  const trace = state.trace;
  if (!trace) return { ok: false, error: "No trace in progress." };
  const strength = traceStrength(state);
  const link = runnerTraceLink(state);
  const success = strength >= link;
  const excess = Math.max(0, strength - link);
  state.turn.lastTraceExcess = excess;
  state.turn.lastResolvedTraceStrength = strength;
  log(
    state,
    `Trace resolves: strength ${strength} vs link ${link} → ${success ? "success" : "failure"} (excess ${excess}) (CR ${CR.trace.number}).`,
  );
  const effect = success ? trace.onSuccess : trace.onFailure;
  state.trace = null;

  // Spinal Modem / ChiLo City Grid: successful trace during a run.
  // Aryabhata Tech: whenever there is a successful trace (any context).
  if (success) {
    for (const server of Object.values(state.servers)) {
      for (const rid of [...server.root, ...server.ice]) {
        const card = state.cards[rid];
        if (!card?.rezzed || !card.onAnySuccessfulTraceGainAndRunnerLose) continue;
        const { gain, lose } = card.onAnySuccessfulTraceGainAndRunnerLose;
        state.corp.credits += gain;
        const lost = Math.min(lose, state.runner.credits);
        state.runner.credits -= lost;
        log(
          state,
          `${card.title} — successful trace: Corp +${gain}¢, Runner −${lost}¢.`,
        );
      }
    }
  }
  if (success && state.run) {
    const fireTraceHook = (cardId: string): void => {
      const card = state.cards[cardId];
      if (!card?.onSuccessfulTraceDuringRun) return;
      const r = evalEffect(
        { state, sourceId: cardId },
        card.onSuccessfulTraceDuringRun,
      );
      if (!r.ok) {
        log(
          state,
          `onSuccessfulTraceDuringRun failed on ${card.title}: ${r.error}`,
        );
      }
    };
    fireTraceHook(state.runner.identityId);
    for (const id of state.runner.rig) {
      fireTraceHook(id);
    }
    // Corp root cards protecting the attacked server (ChiLo City Grid).
    const attacked = state.servers[state.run.attackedServerId];
    if (attacked) {
      for (const rid of attacked.root) {
        const card = state.cards[rid];
        if (!card?.rezzed) continue;
        fireTraceHook(rid);
      }
    }
  }

  if (effect) {
    const ctx: EffectCtx = { state, sourceId: trace.sourceId };
    const r = evalEffect(ctx, effect);
    if (!r.ok) return { ok: false, error: r.error };
  }
  return { ok: true };
}

/**
 * Heuristic auto-resolve: Corp spends 0, Runner spends 0 credits.
 * Used when cards fire traces mid-effect without an interactive host.
 */
export function autoResolveTrace(
  state: GameState,
  sourceId: string,
  baseStrength: number,
  onSuccess: Effect,
  onFailure?: Effect,
): { ok: true } | { ok: false; error: string } {
  startTrace(state, sourceId, baseStrength, onSuccess, onFailure);
  return resolveTrace(state);
}
