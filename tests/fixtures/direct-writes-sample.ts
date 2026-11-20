/**
 * Writes that tests/direct-writes.ts must see, for the scanner check in
 * tests/procedure-write-guard.test.ts. Not imported by anything.
 */
import type { GameState } from "../../src/state/types.js";

export function sampleWrites(state: GameState): void {
  // A write through a cast.
  (state.run as { position?: number }).position = -1;
  // A compound assignment.
  if (state.run && state.run.position !== null) state.run.position -= 1;
  // A write through a non-null assertion.
  state.run!.attackedServerId = "hq";
  // An untracked property on an untracked type is not counted.
  const view = { label: "" };
  view.label = "x";
}
