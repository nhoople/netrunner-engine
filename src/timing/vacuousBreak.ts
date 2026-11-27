/**
 * "All" of an empty set is already satisfied (CR 9.12.2d).
 * Forked trashes the first ice of the named subtype once every subroutine
 * on it is broken, including when it has none.
 */
import { log } from "../state/setupAndEnd/createGame.js";
import type { GameState } from "../state/types/game.js";
import { CR } from "./labels.js";
import { trashCard } from "../state/hostingAndTrash/trash.js";
import { allSubroutinesBrokenByRunner } from "../state/turnAndActions/break.js";
import { effectiveIceSubtypes } from "../cards/stubs.js";

export function noteVacuousFullBreak(state: GameState): void {
  const run = state.run;
  const enc = run?.encounter;
  if (!run || !enc || run.endedTheRun) return;
  const broken = enc.broken ?? [];
  // Subroutines that resolved or were skipped are not broken (CR 6.5.7a).
  if (!allSubroutinesBrokenByRunner(enc)) return;
  const ice = state.cards[enc.iceId];
  if (broken.length === 0 && !enc.fullyBrokenByRunner && ice) {
    log(
      state,
      `${ice.title} has no subroutines — all of them are broken (CR ${CR.vacuousAll.number}).`,
    );
  }
  enc.fullyBrokenByRunner = true;
  const subtype = run.trashFirstFullyBrokenSubtype;
  if (!subtype || run.trashFirstFullyBrokenSubtypeUsed) return;
  if (!ice?.rezzed) return;
  // The ice's current subtypes, gained ones included (Sub Boost's barrier).
  const matches = effectiveIceSubtypes(state, enc.iceId).some(
    (name) => name.toLowerCase() === subtype.toLowerCase(),
  );
  if (!matches) return;
  run.trashFirstFullyBrokenSubtypeUsed = true;
  log(
    state,
    `${ice.title} is trashed — every subroutine is broken (CR ${CR.vacuousAll.number}).`,
  );
  trashCard(state, enc.iceId, { by: "runner" });
}
