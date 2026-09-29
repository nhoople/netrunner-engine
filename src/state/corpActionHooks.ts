import { log } from "./createGame.js";
import { evalEffect } from "../effects/eval.js";
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
        state.corp.clicks += 1;
        log(
          state,
          `${card.title} — third ${actionKind} this turn → gain 1 click.`,
        );
      }
    }
  }

  // MirrorMorph: track distinct action kinds; on third distinct, offer bonus.
  const order = state.turn.corpActionKindsInOrderThisTurn ?? [];
  if (!order.includes(actionKind)) {
    order.push(actionKind);
    state.turn.corpActionKindsInOrderThisTurn = order;
  }
  if (
    order.length === 3 &&
    !state.turn.mirrormorphThirdDistinctFiredThisTurn
  ) {
    const idCard = state.cards[state.corp.identityId];
    if (idCard?.mirrormorphOnThirdDistinctAction) {
      state.turn.mirrormorphThirdDistinctFiredThisTurn = true;
      const r = evalEffect(
        { state, sourceId: state.corp.identityId },
        idCard.mirrormorphOnThirdDistinctAction,
      );
      if (!r.ok) {
        log(
          state,
          `mirrormorphOnThirdDistinctAction failed: ${r.error}`,
        );
      }
    }
  }
}
