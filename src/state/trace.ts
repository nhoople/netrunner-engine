/** Trace initiation and resolution (CR 10.8). */

import { evalEffect, type EffectCtx } from "../effects/eval.js";
import type { Effect } from "../effects/ir.js";
import { log } from "./createGame.js";
import type { GameState } from "./types.js";
import { CR } from "../timing/labels.js";

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
  log(
    state,
    `Trace initiated strength ${baseStrength} (CR ${CR.trace.number}) from ${sourceId}.`,
  );
}

export function boostTrace(state: GameState, credits: number): string | null {
  if (!state.trace) return "No trace in progress.";
  if (credits < 0) return "Cannot spend negative credits.";
  if (state.corp.credits < credits) return "Insufficient Corp credits.";
  state.corp.credits -= credits;
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
 */
export function spendLink(state: GameState, amount: number): string | null {
  if (!state.trace) return "No trace in progress.";
  if (amount < 0) return "Cannot spend negative credits.";
  if (state.runner.credits < amount) return "Insufficient Runner credits.";
  state.runner.credits -= amount;
  state.trace.runnerLinkSpent += amount;
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
  return state.runner.link + state.trace.runnerLinkSpent;
}

/**
 * Resolve the current trace. Success if strength >= runner link strength
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
  log(
    state,
    `Trace resolves: strength ${strength} vs link ${link} → ${success ? "success" : "failure"} (CR ${CR.trace.number}).`,
  );
  const effect = success ? trace.onSuccess : trace.onFailure;
  state.trace = null;
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
