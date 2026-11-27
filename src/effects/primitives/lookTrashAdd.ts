import { abilitiesSuppressed } from "../../state/continuous/abilities.js";
import { log } from "../../state/setupAndEnd/createGame.js";
import type { GameState } from "../../state/types.js";

/** Indian Union Stock Exchange: rez/play out-of-faction → gain credits. */
export function fireSiAfterCorpRezOrPlay(
  state: GameState,
  cardId: string,
): void {
  const played = state.cards[cardId];
  if (!played) return;
  const idFaction = state.cards[state.corp.identityId]?.faction;
  for (const server of Object.values(state.servers)) {
    for (const rid of server.root) {
      const exchange = state.cards[rid];
      if (!exchange?.rezzed) continue;
      const gain = exchange.onRezOrPlayOutOfFactionGainCredits;
      if (typeof gain !== "number") continue;
      const cardFaction = played.faction;
      const isSelf = cardId === rid;
      const isOutOfFaction =
        Boolean(idFaction) && Boolean(cardFaction) && cardFaction !== idFaction;
      if (!isSelf && !isOutOfFaction) continue;
      state.corp.credits += gain;
      log(
        state,
        `${exchange.title} — rez/play ${played.title}: gain ${gain}¢.`,
      );
    }
  }
}

/** Jeeves: first time spend ≥N clicks on same paid ability each turn → gain click. */
export function fireSiAfterPaidAbilityClicks(
  state: GameState,
  clicksSpent: number,
): void {
  if (clicksSpent < 1) return;
  if (state.turn.siJeevesGainClickUsedThisTurn) return;
  for (const server of Object.values(state.servers)) {
    for (const rid of server.root) {
      const jeeves = state.cards[rid];
      if (!jeeves?.rezzed) continue;
      // A blanked Jeeves gives no click (CR 9.1.9a).
      if (abilitiesSuppressed(state, rid)) continue;
      const need = jeeves.gainClickFirstTimeSpendClicksGteOnSameActionEachTurn;
      if (typeof need !== "number" || clicksSpent < need) continue;
      state.corp.clicks += 1;
      state.turn.siJeevesGainClickUsedThisTurn = true;
      log(
        state,
        `${jeeves.title} — spent ${clicksSpent} [click] on one action; gain [click] → ${state.corp.clicks}.`,
      );
      return;
    }
  }
}
