/** Bad publicity take hooks (The Outfit; Editorial Division). */

import { abilitiesSuppressed } from "./abilities.js";
import { log } from "./createGame.js";
import type { GameState } from "./types.js";
import {
  fireStoredConditionals,
  type StoredConditionalMark,
} from "./storedTriggers.js";

/**
 * After Corp takes ≥1 bad publicity:
 * - The Outfit-class: gain credits every take (`gainCreditsOnEachBadPublicityTake`)
 * - Editorial Division-class: once-per-turn `onFirstBadPublicityTakeEachTurn`
 */
export function fireFirstBadPublicityTake(state: GameState, amount: number): void {
  if (amount <= 0) return;
  const eachTake: StoredConditionalMark[] = [];
  for (const id of state.runner.installed) {
    const card = state.cards[id];
    if (!card?.onEachCorpBadPublicityTake) continue;
    if (abilitiesSuppressed(state, id)) continue;
    eachTake.push({
      abilityKey: "on-each-corp-bad-publicity-take",
      sourceId: id,
      controller: "runner",
      mandatory: true,
      effectKey: "onEachCorpBadPublicityTake",
      logLine: `${card.title} becomes pending — Corp took bad publicity.`,
    });
  }
  fireStoredConditionals(state, eachTake);

  const identity = state.cards[state.corp.identityId];
  if (
    identity &&
    typeof identity.gainCreditsOnEachBadPublicityTake === "number" &&
    !abilitiesSuppressed(state, identity.id)
  ) {
    const n = identity.gainCreditsOnEachBadPublicityTake;
    state.corp.credits += n;
    log(
      state,
      `${identity.title} — gain ${n}¢ (took bad publicity) → ${state.corp.credits}¢.`,
    );
  }
  if (state.turn.firstBadPublicityTakeUsedThisTurn) return;
  const firstTake: StoredConditionalMark[] = [];
  const candidates = [state.corp.identityId];
  for (const server of Object.values(state.servers)) {
    for (const id of server.root) candidates.push(id);
  }
  for (const id of candidates) {
    const card = state.cards[id];
    if (!card?.onFirstBadPublicityTakeEachTurn) continue;
    if (card.type !== "identity" && !card.rezzed) continue;
    if (abilitiesSuppressed(state, id)) continue;
    firstTake.push({
      abilityKey: "on-first-bad-publicity-take",
      sourceId: id,
      controller: "corp",
      mandatory: true,
      effectKey: "onFirstBadPublicityTakeEachTurn",
      logLine: `${card.title} becomes pending — first bad publicity take this turn.`,
    });
    break;
  }
  if (firstTake.length === 0) return;
  state.turn.firstBadPublicityTakeUsedThisTurn = true;
  fireStoredConditionals(state, firstTake);
}
