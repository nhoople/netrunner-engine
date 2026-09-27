/**
 * Trash-triggered card abilities (Steelskin / Mavirus-class).
 */

import { evalEffect } from "../effects/eval.js";
import { log } from "./createGame.js";
import { removeCardFromCurrentZone } from "./scoring.js";
import type { CardInstance, GameState } from "./types.js";
import { CR } from "../timing/labels.js";

/** Move a Runner card to the heap, firing grip/stack trash triggers. */
export function moveRunnerCardToHeap(state: GameState, cardId: string): void {
  const card = state.cards[cardId];
  if (!card) return;
  const fromZone = card.zone;
  const wasInstalled = fromZone === "runner:rig" || state.runner.rig.includes(cardId);
  removeCardFromCurrentZone(state, cardId);
  // Nanuq-class: uninstall → RFG instead of heap.
  if (wasInstalled && card.rfgOnUninstall) {
    card.zone = "removed-from-game";
    card.faceup = true;
    if (!state.removedFromGame.includes(cardId)) {
      state.removedFromGame.push(cardId);
    }
    log(
      state,
      `${card.title} removed from the game on uninstall (CR ${CR.trashing.number}).`,
    );
    return;
  }
  state.runner.discard.push(cardId);
  card.zone = "runner:heap";
  card.faceup = true;
  fireOnTrashFromGripOrStack(state, card, fromZone);
}

function fireOnTrashFromGripOrStack(
  state: GameState,
  card: CardInstance,
  fromZone: string,
): void {
  if (!card.onTrashFromGripOrStack) return;
  if (fromZone !== "runner:grip" && fromZone !== "runner:stack") return;
  log(
    state,
    `${card.title} — trashed from ${fromZone === "runner:grip" ? "grip" : "stack"} (CR ${CR.trashing.number}).`,
  );
  const r = evalEffect(
    { state, sourceId: card.id },
    card.onTrashFromGripOrStack,
  );
  if (!r.ok) {
    log(state, `onTrashFromGripOrStack failed on ${card.title}: ${r.error}`);
  }
}

/**
 * After a Corp card reaches Archives via trash, fire `onTrash` if present.
 * Call only for actual trash (not Marilyn shuffle-into-R&D).
 */
export function fireCorpOnTrash(state: GameState, cardId: string): void {
  const card = state.cards[cardId];
  if (!card?.onTrash) return;
  const r = evalEffect({ state, sourceId: cardId }, card.onTrash);
  if (!r.ok) {
    log(state, `onTrash failed on ${card.title}: ${r.error}`);
  }
}

/** Remove all virus counters from every card; trash `trashOnVirusPurge` cards. */
export function purgeVirusCounters(state: GameState, sourceId: string): void {
  let removed = 0;
  const toTrash: string[] = [];
  for (const card of Object.values(state.cards)) {
    const n = card.virusCounters ?? 0;
    if (n > 0) {
      removed += n;
      card.virusCounters = 0;
    }
  }
  for (const card of Object.values(state.cards)) {
    if (!card.trashOnVirusPurge) continue;
    if (card.side === "runner" && state.runner.rig.includes(card.id)) {
      toTrash.push(card.id);
    } else if (card.side === "corp" && card.zone.startsWith("server:")) {
      toTrash.push(card.id);
    }
  }
  log(
    state,
    `Purge virus counters — removed ${removed} (from ${state.cards[sourceId]?.title ?? sourceId}) (CR ${CR.trashing.number}).`,
  );
  for (const id of toTrash) {
    const card = state.cards[id]!;
    if (card.side === "runner") {
      moveRunnerCardToHeap(state, id);
      log(state, `${card.title} trashed by virus purge.`);
    } else {
      removeCardFromCurrentZone(state, id);
      state.corp.discard.push(id);
      card.zone = "corp:archives";
      card.faceup = true;
      card.rezzed = false;
      log(state, `${card.title} trashed by virus purge.`);
      fireCorpOnTrash(state, id);
    }
  }
}

/** Count Corp cards entering Archives this turn (Regenesis). */
export function noteCorpCardAddedToArchives(state: GameState): void {
  state.turn.corpCardsAddedToArchivesThisTurn += 1;
}
