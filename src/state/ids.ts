/**
 * Ids for frames and effects the engine creates during play (checkpoints,
 * priority windows, pending abilities, reaction windows, traces, psi games,
 * lingering effects).
 *
 * The counters live on the game state, so replaying the same intents on the
 * same state mints the same ids. Intents may therefore name these ids.
 */

import type { GameState } from "./types.js";

/** Next id for `prefix` in this game, e.g. `pa-1`, `pa-2`. */
export function nextId(state: GameState, prefix: string): string {
  const seq = (state.idSeq ??= {});
  const n = (seq[prefix] ?? 0) + 1;
  seq[prefix] = n;
  return `${prefix}-${n}`;
}
