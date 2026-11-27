/** Expose-up-to instructions and first-reveal bookkeeping (CR 9.6.4b, 10.3.1a), moved out of `effects/eval.ts`. */
import type { GameState } from "../../state/types/game.js";
import { fireOnFirstRevealEachTurn } from "../../state/triggers/miscConditionalHooks.js";
import { exposeLegalTargets } from "../../state/visibility/expose.js";
import { log } from "../../state/setupAndEnd/createGame.js";
import type { Effect } from "../ir/effect.js";
import { openCardName } from "../../state/visibility/seatVisibility.js";
import { openPendingChoose } from "../../state/triggers/pendingChoice.js";
import { abilitiesSuppressed } from "../../state/continuous/abilities.js";
import { diffAgainstPreviousCheckpoint } from "../../state/triggers/checkpointSnapshot.js";
import { occurCheckpoint } from "../../legality/checkpoints.js";
import { CR } from "../../timing/labels.js";

/** Record Hyoubu-class first-reveal-each-turn for the next 10.3.1a (phase 3). */
export function noteCardRevealed(
  state: GameState,
  _cardId: string,
  _revealerSourceId: string,
): void {
  fireOnFirstRevealEachTurn(state, state.corp.identityId);
}

/** One expose-up-to instruction: both cards are exposed before its checkpoint (CR 9.6.4b). */
export function openExposeUpTo(
  state: GameState,
  sourceId: string,
  max: number,
  remaining: number,
): void {
  state.turn.deferBlackguardCheckpoint = true;
  if (remaining <= 0) {
    finishExposeUpTo(state, sourceId);
    return;
  }
  const targets = exposeLegalTargets(state);
  const source = state.cards[sourceId];
  if (targets.length === 0) {
    log(state, `${source?.title ?? "Expose"} — no cards left to expose.`);
    finishExposeUpTo(state, sourceId);
    return;
  }
  const options: Array<{ id: string; label: string; effect: Effect }> =
    targets.map((id) => ({
      id: `expose-up:${id}`,
      label: `Expose ${openCardName(state, id, "runner")}`,
      effect: {
        op: "do" as const,
        action: {
          kind: "expose_one_of_up_to" as const,
          cardId: id,
          max,
          remaining: remaining - 1,
        },
      },
    }));
  options.push({
    id: "decline",
    label: "Decline further exposes",
    effect: {
      op: "do" as const,
      action: { kind: "end_expose_up_to" as const },
    },
  });
  openPendingChoose(state, { sourceId, chooser: "runner", options });
  log(
    state,
    `${source?.title ?? "Expose"} — may expose up to ${remaining} more card(s).`,
  );
}

export function finishExposeUpTo(state: GameState, sourceId: string): void {
  state.turn.deferBlackguardCheckpoint = false;
  state.turn.exposeUpToAfter = undefined;
  const hasBlackguard = state.runner.installed.some(
    (id) =>
      state.cards[id]?.blackguardForceRezOnExpose &&
      !abilitiesSuppressed(state, id),
  );
  if (!hasBlackguard) return;
  const exposed = diffAgainstPreviousCheckpoint(state).exposedIds;
  if (exposed.length === 0) return;
  occurCheckpoint(
    state,
    "instruction",
    "Exposed cards",
    [CR.conditionMetMultipleTimes],
    sourceId,
  );
}

/** Continue an expose-up-to instruction once its current expose has finished. */
export function resumeExposeUpTo(state: GameState): void {
  const after = state.turn.exposeUpToAfter;
  if (!after) return;
  if (
    state.pendingChoice ||
    state.pendingExpose ||
    state.pendingDamage ||
    state.pendingTrashPrevent
  ) {
    return;
  }
  state.turn.exposeUpToAfter = undefined;
  openExposeUpTo(state, after.sourceId, after.max, after.remaining);
}
