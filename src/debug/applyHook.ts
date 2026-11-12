/**
 * A debug hook that runs after each top-level `applyAction` that succeeds.
 * Tests use it to check state invariants after every action
 * (`tests/setup/invariants.ts`). Unset by default; the engine never sets it.
 */

import type { Action, GameState } from "../state/types.js";

export type ApplyHook = (state: GameState, action: Action) => void;

let hook: ApplyHook | null = null;

/** Set (or clear, with null) the hook. Returns the previous one. */
export function setApplyHook(next: ApplyHook | null): ApplyHook | null {
  const previous = hook;
  hook = next;
  return previous;
}

/** Called by `applyAction` with the state it returns. */
export function runApplyHook(state: GameState, action: Action): void {
  if (hook) hook(state, action);
}
