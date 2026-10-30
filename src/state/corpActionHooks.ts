import { abilitiesSuppressed } from "./abilities.js";
import { log } from "./createGame.js";
import type { GameState } from "./types.js";

/** Corp action-type tracking (Wage Workers + MirrorMorph). */
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

  // MirrorMorph: track distinct action kinds; on third distinct, queue for
  // the next 10.3.1a scanner pass (phase 3). Wage Workers stay immediate.
  const order = state.turn.corpActionKindsInOrderThisTurn ?? [];
  if (!order.includes(actionKind)) {
    order.push(actionKind);
    state.turn.corpActionKindsInOrderThisTurn = order;
  }
  const sequence = state.turn.corpActionSequenceThisTurn ?? [];
  sequence.push(actionKind);
  state.turn.corpActionSequenceThisTurn = sequence;
  // The first three actions must all be different. Two matching actions
  // at the start of the turn make that impossible (CR 5.2.5b).
  if (
    sequence.length >= 2 &&
    sequence[0] === sequence[1] &&
    !state.turn.mirrormorphThirdDistinctFiredThisTurn
  ) {
    state.turn.mirrormorphThirdDistinctFiredThisTurn = true;
    state.turn.mirrormorphThirdDistinctMetPending = false;
  }
  if (
    order.length === 3 &&
    !state.turn.mirrormorphThirdDistinctFiredThisTurn &&
    !state.turn.mirrormorphThirdDistinctMetPending
  ) {
    const idCard = state.cards[state.corp.identityId];
    if (
      idCard?.mirrormorphOnThirdDistinctAction &&
      !abilitiesSuppressed(state, idCard.id)
    ) {
      state.turn.mirrormorphThirdDistinctMetPending = true;
    }
  }
}
