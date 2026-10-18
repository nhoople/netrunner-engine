/**
 * CR 1.7.2c — a required Corp draw that cannot finish because R&D is empty
 * ends the game. The Runner wins.
 */
import { log } from "./createGame.js";
import type { GameState } from "./types.js";
import { CR } from "../timing/labels.js";

export function runnerWinsOnEmptyRnd(state: GameState): void {
  if (state.winner) return;
  state.winner = "runner";
  state.winReason = "empty_rd";
  state.done = true;
  log(
    state,
    `Runner wins — the Corp cannot draw from an empty R&D (CR ${CR.emptyRnd.number}).`,
  );
}
