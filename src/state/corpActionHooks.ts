import { log } from "./createGame.js";
import type { GameState } from "./types.js";

/** Corp action-type tracking (Wage Workers). */
export function noteCorpActionType(state: GameState, actionKind: string): void {
  if (state.activeSide !== "corp") return;
  const counts = state.turn.corpActionTypeCounts;
  counts[actionKind] = (counts[actionKind] ?? 0) + 1;
  const n = counts[actionKind]!;
  if (n !== 3) return;
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
