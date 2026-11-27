import type { GameState } from "../types/game.js";
import type { Side } from "../types/shared.js";

/** True only while a hidden-zone search allows this seat to look (CR 8.7.1a). */
export function mayLookAtHiddenZone(state: GameState, side: Side): boolean {
  const search = state.turn.hiddenZoneSearch;
  return Boolean(search?.open && search.viewer === side);
}
