/**
 * Replacement effects (CR 9.9.9).
 *
 * Duration-altering hosted statics (Gebrselassie / Gamedragon Pro) and the
 * System Seizure run-grant live in `hostDuration.ts` and are the duration
 * subclass of this layer (CR 9.9.9 / 9.9.9a).
 *
 * This module owns:
 * - **9.9.9b** — apply already-active expected-effect replacements as an
 *   interrupt window opens (before interrupt abilities become pending).
 * - **9.9.9c** — each replacement applies at most once to a single effect.
 */

import { log } from "./createGame.js";
import type { ExpectedEffects, GameState } from "./types.js";
import { CR } from "../timing/labels.js";

/** Allocate a unique identity for one imminent effect occurrence. */
export function allocateEffectIdentity(
  state: GameState,
  prefix: string,
): string {
  state.turn.effectIdentitySeq = (state.turn.effectIdentitySeq ?? 0) + 1;
  return `${prefix}:${state.turn.effectIdentitySeq}`;
}

function appliedList(state: GameState, effectId: string): string[] {
  return state.turn.appliedReplacements?.[effectId] ?? [];
}

/** True when this replacement has already applied to the effect (CR 9.9.9c). */
export function replacementAlreadyApplied(
  state: GameState,
  effectId: string,
  replacementId: string,
): boolean {
  return appliedList(state, effectId).includes(replacementId);
}

/** Record that a replacement applied to an effect (CR 9.9.9c). */
export function noteReplacementApplied(
  state: GameState,
  effectId: string,
  replacementId: string,
): void {
  const bag = (state.turn.appliedReplacements ??= {});
  const list = bag[effectId] ?? [];
  if (list.includes(replacementId)) return;
  bag[effectId] = [...list, replacementId];
}

/**
 * Apply a replacement once to an effect. Returns false if it already applied
 * (CR 9.9.9c).
 */
export function tryApplyReplacement(
  state: GameState,
  effectId: string,
  replacementId: string,
): boolean {
  if (replacementAlreadyApplied(state, effectId, replacementId)) return false;
  noteReplacementApplied(state, effectId, replacementId);
  return true;
}

/**
 * Active expected-effect replacement (CR 9.9.9b). Duration rewrites are
 * handled separately in `hostDuration.ts`.
 */
export type ActiveExpectedReplacement = {
  id: string;
  sourceId: string;
  /**
   * Return updated expected effects when this replacement applies, or null
   * when it does not match the imminent effects.
   */
  apply: (
    state: GameState,
    expected: ExpectedEffects,
  ) => ExpectedEffects | null;
};

/**
 * Collect active expected-effect replacements. Corpus static replacements of
 * imminent expected effects are uncommon (most "instead" abilities are
 * interrupts that create replacements under CR 9.9.10). Duration rewrites
 * do not appear here.
 */
export function listActiveExpectedReplacements(
  _state: GameState,
): ActiveExpectedReplacement[] {
  return [];
}

/**
 * Apply already-active expected-effect replacements as the interrupt window
 * opens (CR 9.9.9b). Call before interrupt abilities are checked against the
 * expected effects.
 */
export function applyActiveReplacementsAtInterruptOpen(
  state: GameState,
  expected: ExpectedEffects,
  effectId: string,
): ExpectedEffects {
  let next: ExpectedEffects = { ...expected };
  if (expected.damage) next.damage = { ...expected.damage };
  if (expected.tags) next.tags = { ...expected.tags };
  if (expected.breakSubroutine) {
    next.breakSubroutine = { ...expected.breakSubroutine };
  }
  if (expected.trashCardIds) next.trashCardIds = [...expected.trashCardIds];
  if (expected.exposeCardIds) next.exposeCardIds = [...expected.exposeCardIds];
  if (expected.notes) next.notes = [...expected.notes];

  for (const repl of listActiveExpectedReplacements(state)) {
    if (replacementAlreadyApplied(state, effectId, repl.id)) continue;
    const updated = repl.apply(state, next);
    if (!updated) continue;
    if (!tryApplyReplacement(state, effectId, repl.id)) continue;
    next = updated;
    const title = state.cards[repl.sourceId]?.title ?? repl.sourceId;
    log(
      state,
      `${title} — active replacement applied as the interrupt window opened (CR ${CR.replacementEffectsApplyAsInterruptOpens.number}).`,
    );
  }
  return next;
}

/** Drop applied-replacement bookkeeping at a checkpoint. */
export function clearAppliedReplacements(state: GameState): void {
  state.turn.appliedReplacements = undefined;
}
