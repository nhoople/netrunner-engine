import { abilitiesSuppressed } from "./abilities.js";
import { log } from "./createGame.js";
import type { GameState } from "./types.js";

/**
 * Corp action tracking (Wage Workers + MirrorMorph). `actionKind` names the
 * action: the basic action, or the ability and the card it is on. Actions
 * with the same name are the same action (CR 5.2.5a, 5.2.5b).
 */
export function noteCorpActionType(state: GameState, actionKind: string): void {
  if (state.activeSide !== "corp") return;
  const counts = state.turn.corpActionTypeCounts;
  counts[actionKind] = (counts[actionKind] ?? 0) + 1;
  const n = counts[actionKind]!;

  // Wage Workers: third of the *same* kind → gain 1 click.
  if (n === 3) {
    for (const server of Object.values(state.servers)) {
      for (const id of [...server.root, ...server.ice]) {
        const card = state.cards[id];
        if (!card?.wageWorkersTrackActions || !card.rezzed) continue;
        // CR 9.12.1d — blanked continuous click-gain does not fire.
        if (abilitiesSuppressed(state, id)) continue;
        state.corp.clicks += 1;
        log(
          state,
          `${card.title} — third ${actionKind} this turn → gain 1 click.`,
        );
      }
    }
  }

  // MirrorMorph: if the first three actions are all different, queue for
  // the next 10.3.1a scanner pass (phase 3). Wage Workers stay immediate.
  const order = state.turn.corpActionKindsInOrderThisTurn ?? [];
  if (!order.includes(actionKind)) {
    order.push(actionKind);
    state.turn.corpActionKindsInOrderThisTurn = order;
  }
  const sequence = state.turn.corpActionSequenceThisTurn ?? [];
  sequence.push(actionKind);
  state.turn.corpActionSequenceThisTurn = sequence;
  // Only the first three actions count, and they must all be different. A
  // repeat among them rules the ability out for the turn (CR 5.2.5b.ex1).
  if (
    sequence.length > 3 ||
    state.turn.mirrormorphThirdDistinctFiredThisTurn ||
    state.turn.mirrormorphThirdDistinctMetPending
  ) {
    return;
  }
  if (new Set(sequence).size < sequence.length) {
    state.turn.mirrormorphThirdDistinctFiredThisTurn = true;
    return;
  }
  if (sequence.length === 3) {
    const idCard = state.cards[state.corp.identityId];
    if (
      idCard?.mirrormorphOnThirdDistinctAction &&
      !abilitiesSuppressed(state, idCard.id)
    ) {
      state.turn.mirrormorphThirdDistinctMetPending = true;
    }
  }
}
