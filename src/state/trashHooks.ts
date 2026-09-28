/**
 * Trash-triggered card abilities (Steelskin / Mavirus-class).
 */

import { evalEffect } from "../effects/eval.js";
import { log } from "./createGame.js";
import { removeCardFromCurrentZone } from "./scoring.js";
import type { CardInstance, GameState } from "./types.js";
import { CR } from "../timing/labels.js";

/** Runner stole or trashed a Corp card — turn flags + Epiphany identity hook. */
export function noteRunnerStoleOrTrashedCorpCard(state: GameState): void {
  state.turn.runnerStoleOrTrashedCorpCardThisTurn = true;
  if (state.turn.firstRunnerStoleOrTrashedUsedThisTurn) return;
  state.turn.firstRunnerStoleOrTrashedUsedThisTurn = true;
  const idCard = state.cards[state.runner.identityId];
  if (idCard?.onFirstRunnerStoleOrTrashedCorpCardThisTurn) {
    log(
      state,
      `${idCard.title} — first Runner steal/trash of a Corp card this turn.`,
    );
    const r = evalEffect(
      { state, sourceId: idCard.id },
      idCard.onFirstRunnerStoleOrTrashedCorpCardThisTurn,
    );
    if (!r.ok) {
      log(
        state,
        `onFirstRunnerStoleOrTrashedCorpCardThisTurn failed on ${idCard.title}: ${r.error}`,
      );
    }
    if (state.pendingChoice) return;
  }
  for (const id of [...state.runner.rig]) {
    const card = state.cards[id];
    if (!card?.onFirstRunnerStoleOrTrashedCorpCardThisTurn) continue;
    log(
      state,
      `${card.title} — first Runner steal/trash of a Corp card this turn.`,
    );
    const r = evalEffect(
      { state, sourceId: id },
      card.onFirstRunnerStoleOrTrashedCorpCardThisTurn,
    );
    if (!r.ok) {
      log(
        state,
        `onFirstRunnerStoleOrTrashedCorpCardThisTurn failed on ${card.title}: ${r.error}`,
      );
    }
    if (state.pendingChoice) return;
  }
}

/** Sebastião: Runner identity when taking tags from untagged. */
export function fireOnTakeTagsWhenUntagged(
  state: GameState,
  tagsBefore: number,
  amount: number,
): void {
  if (tagsBefore !== 0 || amount <= 0) return;
  const idCard = state.cards[state.runner.identityId];
  if (!idCard?.onTakeTagsWhenUntagged) return;
  const r = evalEffect(
    { state, sourceId: idCard.id },
    idCard.onTakeTagsWhenUntagged,
  );
  if (!r.ok) {
    log(state, `onTakeTagsWhenUntagged failed on ${idCard.title}: ${r.error}`);
  }
}

/** Move a Runner card to the heap, firing grip/stack trash triggers. */
export function moveRunnerCardToHeap(state: GameState, cardId: string): void {
  const card = state.cards[cardId];
  if (!card) return;
  releaseHostedCardsOnTrash(state, cardId);
  const fromZone = card.zone;
  const wasInstalled = fromZone === "runner:rig" || state.runner.rig.includes(cardId);
  if (wasInstalled) {
    state.turn.runnerTrashedOwnInstalledThisTurn = true;
    const enc = state.run?.encounter;
    if (enc?.iceId) {
      const ice = state.cards[enc.iceId];
      if (ice?.maxInstalledRunnerTrashesPerEncounter) {
        enc.installedRunnerTrashesThisEncounter =
          (enc.installedRunnerTrashesThisEncounter ?? 0) + 1;
      }
    }
  }
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

/**
 * When a host is trashed, hosted Corp cards go to Archives (faceup, not
 * installed); hosted Runner cards go to the heap.
 */
export function releaseHostedCardsOnTrash(
  state: GameState,
  hostId: string,
): void {
  const host = state.cards[hostId];
  if (!host?.hostedCardIds?.length) return;
  const hosted = [...host.hostedCardIds];
  host.hostedCardIds = [];
  for (const id of hosted) {
    const card = state.cards[id];
    if (!card) continue;
    card.hostId = undefined;
    if (card.side === "corp") {
      if (!state.corp.discard.includes(id)) {
        state.corp.discard.push(id);
      }
      card.zone = "corp:archives";
      card.faceup = true;
      card.rezzed = false;
      log(
        state,
        `${card.title} — hosted on ${host.title}; moves to Archives.`,
      );
    } else {
      if (!state.runner.discard.includes(id)) {
        state.runner.discard.push(id);
      }
      card.zone = "runner:heap";
      card.faceup = true;
      log(
        state,
        `${card.title} — hosted on ${host.title}; moves to heap.`,
      );
    }
  }
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

/** Solidarity Badge-class: first Runner trash of a Corp card each turn. */
export function noteFirstCorpCardTrashEachTurn(state: GameState): void {
  noteRunnerStoleOrTrashedCorpCard(state);
  if (state.turn.firstCorpCardTrashUsedThisTurn) return;
  state.turn.firstCorpCardTrashUsedThisTurn = true;
  for (const id of [...state.runner.rig]) {
    const card = state.cards[id];
    if (!card?.onFirstCorpCardTrashEachTurn) continue;
    const r = evalEffect(
      { state, sourceId: id },
      card.onFirstCorpCardTrashEachTurn,
    );
    if (!r.ok) {
      log(
        state,
        `onFirstCorpCardTrashEachTurn failed on ${card.title}: ${r.error}`,
      );
    }
    if (state.pendingChoice) return;
  }
  for (const id of [...state.corp.score]) {
    const card = state.cards[id];
    if (!card?.onFirstCorpCardTrashEachTurn) continue;
    const r = evalEffect(
      { state, sourceId: id },
      card.onFirstCorpCardTrashEachTurn,
    );
    if (!r.ok) {
      log(
        state,
        `onFirstCorpCardTrashEachTurn failed on ${card.title}: ${r.error}`,
      );
    }
    if (state.pendingChoice) return;
  }
}

/**
 * Audrey v2-class: whenever the Runner trashes a card they are accessing,
 * fire `onAccessTrash` on installed Runner cards (every trash, no gate).
 */
export function noteAccessTrash(state: GameState): void {
  for (const id of [...state.runner.rig]) {
    const card = state.cards[id];
    if (!card?.onAccessTrash) continue;
    const r = evalEffect({ state, sourceId: id }, card.onAccessTrash);
    if (!r.ok) {
      log(state, `onAccessTrash failed on ${card.title}: ${r.error}`);
    }
    if (state.pendingChoice) return;
  }
}

/**
 * Lago Paranoá-class: first Corp install into a server root each turn.
 */
/**
 * A Teia: first Corp install on a remote root or remote ice each turn.
 */
export function noteFirstRemoteInstallThisTurn(
  state: GameState,
  serverId: import("./types.js").ServerId,
): void {
  const server = state.servers[serverId];
  if (!server || server.kind !== "remote") return;
  state.turn.triggerRemoteInstallServerId = serverId;
  if (state.turn.firstRemoteInstallThisTurnUsed) return;
  state.turn.firstRemoteInstallThisTurnUsed = true;
  const idCard = state.cards[state.corp.identityId];
  if (!idCard?.onFirstRemoteInstallThisTurn) return;
  const r = evalEffect(
    { state, sourceId: idCard.id },
    idCard.onFirstRemoteInstallThisTurn,
  );
  if (!r.ok) {
    log(
      state,
      `onFirstRemoteInstallThisTurn failed on ${idCard.title}: ${r.error}`,
    );
  }
}

export function noteFirstCorpRootInstallEachTurn(state: GameState): void {
  if (state.turn.firstCorpRootInstallUsedThisTurn) return;
  state.turn.firstCorpRootInstallUsedThisTurn = true;
  for (const id of [...state.runner.rig]) {
    const card = state.cards[id];
    if (!card?.onFirstCorpRootInstallEachTurn) continue;
    const r = evalEffect(
      { state, sourceId: id },
      card.onFirstCorpRootInstallEachTurn,
    );
    if (!r.ok) {
      log(
        state,
        `onFirstCorpRootInstallEachTurn failed on ${card.title}: ${r.error}`,
      );
    }
    if (state.pendingChoice) return;
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
  const onPurgeEffects: string[] = [];
  for (const card of Object.values(state.cards)) {
    const n = card.virusCounters ?? 0;
    if (n > 0) {
      removed += n;
      card.virusCounters = 0;
    }
  }
  for (const card of Object.values(state.cards)) {
    if (card.onVirusPurge) {
      const installed =
        (card.side === "runner" && state.runner.rig.includes(card.id)) ||
        (card.side === "corp" && card.zone.startsWith("server:"));
      if (installed) onPurgeEffects.push(card.id);
    }
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
  for (const id of onPurgeEffects) {
    const card = state.cards[id];
    if (!card?.onVirusPurge) continue;
    // May already be gone if an earlier onVirusPurge trashed it.
    const stillInstalled =
      (card.side === "runner" && state.runner.rig.includes(id)) ||
      (card.side === "corp" && card.zone.startsWith("server:"));
    if (!stillInstalled) continue;
    const r = evalEffect({ state, sourceId: id }, card.onVirusPurge);
    if (!r.ok) {
      log(state, `onVirusPurge failed on ${card.title}: ${r.error}`);
    }
  }
  for (const id of toTrash) {
    const card = state.cards[id];
    if (!card) continue;
    // Skip if already trashed by onVirusPurge.
    if (card.side === "runner" && !state.runner.rig.includes(id)) continue;
    if (card.side === "corp" && !card.zone.startsWith("server:")) continue;
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

/**
 * Valentina-class: whenever 1+ tags are removed, fire `onRemoveTags` on
 * installed Runner cards. Returns the first failure if any effect fails.
 */
export function fireOnRemoveTags(
  state: GameState,
): { ok: true } | { ok: false; error: string; cites: import("./types.js").RuleCite[] } {
  for (const id of [...state.runner.rig]) {
    const card = state.cards[id];
    if (!card?.onRemoveTags) continue;
    const r = evalEffect({ state, sourceId: id }, card.onRemoveTags);
    if (!r.ok) {
      return { ok: false, error: r.error, cites: r.cites ?? [] };
    }
  }
  if (!state.turn.firstCorpOnRemoveTagsThisTurn) {
    const corpId = state.cards[state.corp.identityId];
    if (corpId?.onRemoveTags) {
      state.turn.firstCorpOnRemoveTagsThisTurn = true;
      const r = evalEffect(
        { state, sourceId: corpId.id },
        corpId.onRemoveTags,
      );
      if (!r.ok) {
        return { ok: false, error: r.error, cites: r.cites ?? [] };
      }
    }
  }
  return { ok: true };
}
