/**
 * A debug hook that sees each step of the timing graph the engine enters
 * (`enterStep` in `src/timing/machine.ts`), including the automatic steps
 * between two player actions that the apply hook (`applyHook.ts`) never sees.
 * The timing walk (CR audit tool 1.15, `tests/timing-walk/`) uses it to check
 * the steps the engine really passes through against the chapter 11 chart.
 *
 * Unset by default; the engine never sets it, and with no hook set
 * `runStepHook` returns before it reads anything. The hook gets a frozen
 * record copied from the state, never the state itself, so it cannot change
 * the game.
 */

import type { GameState } from "../state/types.js";

export interface StepRecord {
  /**
   * Which state object entered the step (`stateToken`). Legality trials
   * enter steps on copies of the state; a recorder keeps only the records of
   * the state a top-level `applyAction` returns.
   */
  readonly token: number;
  /** The step entered. */
  readonly key: string;
  /** The step the engine was on before it. */
  readonly previousKey: string;
  /** A run is in progress. */
  readonly inRun: boolean;
  /** The run in progress has been ended (CR 6.1.4). */
  readonly endedTheRun: boolean;
}

export type StepHook = (record: StepRecord) => void;

let hook: StepHook | null = null;

const tokens = new WeakMap<GameState, number>();
let nextToken = 1;

/** A number that names this state object while it lives. Reads nothing in it. */
export function stateToken(state: GameState): number {
  let token = tokens.get(state);
  if (token === undefined) {
    token = nextToken++;
    tokens.set(state, token);
  }
  return token;
}

/** Set (or clear, with null) the hook. Returns the previous one. */
export function setStepHook(next: StepHook | null): StepHook | null {
  const previous = hook;
  hook = next;
  return previous;
}

/** Called by `enterStep` right after it sets `state.timingKey`. */
export function runStepHook(state: GameState, previousKey: string): void {
  if (!hook) return;
  hook(
    Object.freeze({
      token: stateToken(state),
      key: state.timingKey,
      previousKey,
      inRun: state.run !== null,
      endedTheRun: Boolean(state.run?.endedTheRun),
    }),
  );
}
