import type { GameState, PendingEffectContinuation } from "../state/types.js";

function chainAfter(
  first: PendingEffectContinuation,
  later: PendingEffectContinuation,
): PendingEffectContinuation {
  if (!first.followedBy) return { ...first, followedBy: later };
  return { ...first, followedBy: chainAfter(first.followedBy, later) };
}

/** Queue `next` to run before any continuation already waiting. */
export function deferContinuationBefore(
  state: GameState,
  next: PendingEffectContinuation,
): void {
  const prior = state.pendingEffectContinuation;
  state.pendingEffectContinuation = prior ? chainAfter(next, prior) : next;
}

/** Queue `next` to run after any continuation already waiting. */
export function deferContinuationAfter(
  state: GameState,
  next: PendingEffectContinuation,
): void {
  const prior = state.pendingEffectContinuation;
  state.pendingEffectContinuation = prior ? chainAfter(prior, next) : next;
}

/** True while a paused window still has to resolve before a continuation. */
export function effectResolutionBlocked(state: GameState): boolean {
  return Boolean(
    state.pendingChoice ||
      state.pendingTrashProgram ||
      state.pendingSabotage ||
      state.pendingDamage ||
      state.pendingTags ||
      state.pendingExpose ||
      state.pendingTrashPrevent ||
      state.trace ||
      state.psi,
  );
}
