/**
 * "All" of an empty set is already satisfied (CR 9.12.2d).
 * Forked trashes the first ice of the named subtype once every subroutine
 * on it is broken, including when it has none.
 */
import { trashCorpCardToArchives } from "../effects/corpTrash.js";
import { log } from "../state/createGame.js";
import type { GameState } from "../state/types.js";
import { CR } from "./labels.js";

export function noteVacuousFullBreak(state: GameState): void {
  const run = state.run;
  const enc = run?.encounter;
  if (!run || !enc || run.endedTheRun) return;
  const broken = enc.broken ?? [];
  if (!broken.every(Boolean)) return;
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
  const matches = (ice.subtypes ?? []).some(
    (name) => name.toLowerCase() === subtype.toLowerCase(),
  );
  if (!matches) return;
  run.trashFirstFullyBrokenSubtypeUsed = true;
  log(
    state,
    `${ice.title} is trashed — every subroutine is broken (CR ${CR.vacuousAll.number}).`,
  );
  trashCorpCardToArchives(state, enc.iceId);
}
