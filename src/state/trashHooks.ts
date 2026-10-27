/**
 * Trash-triggered card abilities (Steelskin / Mavirus-class).
 */

import { dealDamage } from "./damage.js";
import { maybeOpenTrashPrevent } from "./trashPrevent.js";
import { log } from "./createGame.js";
import {
  returnHostedIdentityToOutsideGame,
  runnerAbilityCarrierIds,
} from "./fenris.js";
import { recomputeRunnerMaxHandSize } from "./handSize.js";
import { removeCardFromCurrentZone } from "./scoring.js";
import type { CardInstance, GameState } from "./types.js";
import { CR } from "../timing/labels.js";
import { fireHardwareInstallOrTrash } from "./programHardwareInstall.js";
import { abilitiesSuppressed } from "./abilities.js";
import {
  cancelPendingIfSourceInactive,
} from "./pendingAbilities.js";
import { onInstalledProgramTrashed } from "./staticFlags.js";
import {
  fireStoredConditionals,
  type StoredConditionalMark,
} from "./storedTriggers.js";

/** Mr. Stone: taking tags makes its meat damage imminent. */
export function fireMeatDamageWhenRunnerTakesTags(state: GameState): void {
  for (const server of Object.values(state.servers)) {
    for (const id of server.root) {
      const card = state.cards[id];
      const amount = card?.meatDamageWhenRunnerTakesTags;
      if (!card?.rezzed || typeof amount !== "number" || amount <= 0) continue;
      if (abilitiesSuppressed(state, id)) continue;
      dealDamage(state, "meat", amount, id);
    }
  }
}
/** Conditional abilities that trigger when an agenda enters the Runner score area (CR 1.17.7). */
export function fireOnAgendaAddedToRunnerScore(state: GameState): void {
  const items: StoredConditionalMark[] = [];
  const ids = [state.runner.identityId, ...state.runner.installed];
  for (const id of ids) {
    const card = state.cards[id];
    if (!card?.onAgendaAddedToRunnerScore) continue;
    if (abilitiesSuppressed(state, id)) continue;
    items.push({
      abilityKey: "on-agenda-added-to-runner-score",
      sourceId: id,
      controller: "runner",
      mandatory: true,
      effectKey: "onAgendaAddedToRunnerScore",
      logLine: `${card.title} becomes pending — an agenda was added to the Runner's score area (CR ${CR.stealingAgenda.number}).`,
    });
  }
  fireStoredConditionals(state, items);
}

export function noteRunnerStoleOrTrashedCorpCard(state: GameState): void {
  state.turn.runnerStoleOrTrashedCorpCardThisTurn = true;
  if (state.turn.firstRunnerStoleOrTrashedUsedThisTurn) return;
  state.turn.firstRunnerStoleOrTrashedUsedThisTurn = true;
  const items: StoredConditionalMark[] = [];
  const idCard = state.cards[state.runner.identityId];
  if (idCard?.onFirstRunnerStoleOrTrashedCorpCardThisTurn) {
    items.push({
      abilityKey: "on-first-runner-stole-or-trashed",
      sourceId: idCard.id,
      controller: "runner",
      mandatory: true,
      effectKey: "onFirstRunnerStoleOrTrashedCorpCardThisTurn",
      logLine: `${idCard.title} becomes pending — first Runner steal/trash of a Corp card this turn.`,
    });
  }
  for (const id of [...state.runner.installed]) {
    const card = state.cards[id];
    if (!card?.onFirstRunnerStoleOrTrashedCorpCardThisTurn) continue;
    items.push({
      abilityKey: "on-first-runner-stole-or-trashed",
      sourceId: id,
      controller: "runner",
      mandatory: true,
      effectKey: "onFirstRunnerStoleOrTrashedCorpCardThisTurn",
      logLine: `${card.title} becomes pending — first Runner steal/trash of a Corp card this turn.`,
    });
  }
  fireStoredConditionals(state, items);
}

/** Sebastião: Runner identity (and Fenris carriers) when taking tags from untagged. */
export function fireOnTakeTagsWhenUntagged(
  state: GameState,
  tagsBefore: number,
  amount: number,
): void {
  if (tagsBefore !== 0 || amount <= 0) return;
  const items: StoredConditionalMark[] = [];
  for (const carrierId of runnerAbilityCarrierIds(state)) {
    if (abilitiesSuppressed(state, carrierId)) continue;
    const idCard = state.cards[carrierId];
    if (!idCard?.onTakeTagsWhenUntagged) continue;
    items.push({
      abilityKey: "on-take-tags-when-untagged",
      sourceId: idCard.id,
      controller: "runner",
      mandatory: true,
      effectKey: "onTakeTagsWhenUntagged",
      logLine: `${idCard.title} becomes pending — took tags while untagged.`,
    });
  }
  fireStoredConditionals(state, items);
}

function skorpiosIdentity(state: GameState): CardInstance | undefined {
  const idCard = state.cards[state.corp.identityId];
  if (!idCard?.skorpiosRfgOneTrashedRunnerCardOncePerTurn) return undefined;
  if (abilitiesSuppressed(state, idCard.id)) return undefined;
  if (state.turn.skorpiosRfgUsedThisTurn) return undefined;
  if (state.pendingChoice || state.turn.pendingSkorpiosTrash) return undefined;
  return idCard;
}

/** Corp may remove this trashed Runner card from the game instead of the heap. */
function offerSkorpiosRfgInsteadOfHeap(
  state: GameState,
  card: CardInstance,
  fromZone: string,
  wasInstalled: boolean,
): boolean {
  const idCard = skorpiosIdentity(state);
  if (!idCard) return false;
  state.turn.pendingSkorpiosTrash = {
    cardId: card.id,
    fromZone,
    wasInstalled,
  };
  state.pendingChoice = {
    sourceId: idCard.id,
    chooser: "corp",
    options: [
      {
        id: `skorpios-rfg:${card.id}`,
        label: `Remove ${card.title} from the game`,
        effect: {
          op: "do",
          action: { kind: "gain_credits", side: "corp", amount: 0 },
        },
      },
      {
        id: `skorpios-heap:${card.id}`,
        label: `Add ${card.title} to the heap`,
        effect: {
          op: "do",
          action: { kind: "gain_credits", side: "corp", amount: 0 },
        },
      },
    ],
  };
  log(
    state,
    `${idCard.title} may remove ${card.title} from the game instead of adding it to the heap.`,
  );
  return true;
}

/** Skorpios chose the destination of a trashed Runner card (CR 9.1.8b). */
export function resolveSkorpiosTrash(state: GameState, optionId: string): void {
  const pending = state.turn.pendingSkorpiosTrash;
  if (!pending) return;
  state.turn.pendingSkorpiosTrash = undefined;
  const card = state.cards[pending.cardId];
  if (!card) return;
  if (optionId.startsWith("skorpios-rfg:")) {
    state.turn.skorpiosRfgUsedThisTurn = true;
    card.zone = "removed-from-game";
    card.faceup = true;
    if (!state.removedFromGame.includes(card.id)) {
      state.removedFromGame.push(card.id);
    }
    const idCard = state.cards[state.corp.identityId];
    log(
      state,
      `${idCard?.title ?? "Skorpios"} removes ${card.title} from the game instead of adding it to the heap.`,
    );
    log(
      state,
      `${card.title} is not active (CR ${CR.abilityActiveInZone.number}).`,
    );
    return;
  }
  arriveRunnerCardInHeap(state, card, pending.fromZone, pending.wasInstalled);
}

/** Move a Runner card to the heap, firing grip/stack trash triggers. */
export function moveRunnerCardToHeap(state: GameState, cardId: string): void {
  const card = state.cards[cardId];
  if (!card) return;
  const fromZone = card.zone;
  const wasInstalled = fromZone === "runner:installed" || state.runner.installed.includes(cardId);
  if (maybeOpenTrashPrevent(state, cardId)) {
    return;
  }
  releaseHostedCardsOnTrash(state, cardId);
  if (wasInstalled) {
    state.turn.runnerTrashedOwnInstalledThisTurn = true;
    fireCotcOnRunnerInstalledTrashed(state);
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
  // CR 9.6.10: still-pending instances for this source die when it leaves
  // play. Scoped to cardId so other cards' pendings (and later on-trash
  // triggers for this card) are untouched.
  cancelPendingIfSourceInactive(state, (inst) => inst.sourceId !== cardId);
  if (wasInstalled && card.type === "program") onInstalledProgramTrashed(state);
  if (wasInstalled && card.type === "program") onInstalledProgramTrashed(state);
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
    fireOnUninstall(state, card);
    return;
  }
  if (wasInstalled && card.onUninstall) {
    fireOnUninstall(state, card);
  }
  if (offerSkorpiosRfgInsteadOfHeap(state, card, fromZone, wasInstalled)) {
    return;
  }
  arriveRunnerCardInHeap(state, card, fromZone, wasInstalled);
}

function arriveRunnerCardInHeap(
  state: GameState,
  card: CardInstance,
  fromZone: string,
  wasInstalled: boolean,
): void {
  const cardId = card.id;
  state.runner.discardPile.push(cardId);
  noteTrashMatchingRunnerIdentityFaction(state, cardId);
  card.zone = "runner:heap";
  card.faceup = true;
  fireOnTrashFromGripOrStack(state, card, fromZone);
  // Tri-maf / Rolodex-class: fire onTrash when Runner card hits heap.
  if (card.onTrash) {
    fireStoredConditionals(state, [
      {
        abilityKey: "on-trash",
        sourceId: cardId,
        controller: "runner",
        mandatory: true,
        effectKey: "onTrash",
        logLine: `${card.title} becomes pending — trashed.`,
      },
    ]);
  }
  noteGripOrStackTrashForBufferDrive(state, cardId, fromZone);
  noteFirstProgramOrHardwareTrashEachTurn(state, cardId);
  if (card.type === "event") {
    fireOnFirstEventTrashedThisTurn(state);
  }
  if (card.type === "hardware") {
    fireHardwareInstallOrTrash(state);
  }
  if (wasInstalled) {
    recomputeRunnerLink(state);
    // Reaver: first trash of an installed card each turn → draw 1.
    if (!state.turn.mlReaverDrawUsedThisTurn) {
      for (const rid of state.runner.installed) {
        const reaver = state.cards[rid];
        if (!reaver?.drawOnFirstTrashInstalledEachTurn) continue;
        state.turn.mlReaverDrawUsedThisTurn = true;
        if (state.runner.deck.length > 0) {
          const drawn = state.runner.deck.shift()!;
          state.runner.hand.push(drawn);
          state.cards[drawn]!.zone = "runner:grip";
          log(state, `${reaver.title} — draw 1 (first installed trash this turn).`);
        }
        break;
      }
    }
  }
}

/** Aniccam-class: first event trashed each turn. */
export function fireOnFirstEventTrashedThisTurn(state: GameState): void {
  if (state.turn.firstEventTrashedUsedThisTurn) return;
  const items: StoredConditionalMark[] = [];
  for (const id of [...state.runner.installed]) {
    const card = state.cards[id];
    if (!card?.onFirstEventTrashedThisTurn) continue;
    items.push({
      abilityKey: "on-first-event-trashed",
      sourceId: id,
      controller: "runner",
      mandatory: true,
      effectKey: "onFirstEventTrashedThisTurn",
      logLine: `${card.title} becomes pending — first event trashed this turn.`,
    });
    break;
  }
  if (items.length === 0) return;
  state.turn.firstEventTrashedUsedThisTurn = true;
  fireStoredConditionals(state, items);
}

/** Recompute Runner link from identity + installed cards with printed link. */
export function recomputeRunnerLink(state: GameState): void {
  let n = state.cards[state.runner.identityId]?.link ?? 0;
  for (const id of state.runner.installed) {
    n += state.cards[id]?.link ?? 0;
  }
  state.runner.link = n;
}

/** Tranquility-class: first install into this server's root each turn. */
export function noteFirstInstallInServerRootThisTurn(
  state: GameState,
  serverId: import("./types.js").ServerId,
  installedCardId: string,
): void {
  const server = state.servers[serverId];
  if (!server) return;
  void installedCardId;
  if (!state.turn.firstInstallInServerRootUsedIds) {
    state.turn.firstInstallInServerRootUsedIds = [];
  }
  const items: StoredConditionalMark[] = [];
  for (const id of server.root) {
    const card = state.cards[id];
    if (!card?.rezzed || !card.onFirstInstallInThisServerRootThisTurn) continue;
    if (state.turn.firstInstallInServerRootUsedIds.includes(id)) continue;
    state.turn.firstInstallInServerRootUsedIds.push(id);
    items.push({
      abilityKey: "on-first-install-in-server-root",
      sourceId: id,
      controller: "corp",
      mandatory: true,
      effectKey: "onFirstInstallInThisServerRootThisTurn",
      logLine: `${card.title} becomes pending — first install in this server's root this turn.`,
    });
  }
  fireStoredConditionals(state, items);
}


/**
 * When a host is trashed, hosted Corp cards go to Archives (faceup, not
 * installed); hosted Runner cards go to the heap — except hosted identities
 * on Fenris-class hosts, which return to the outside-game pile (CR 1.5.4b).
 */
export function releaseHostedCardsOnTrash(
  state: GameState,
  hostId: string,
): void {
  const host = state.cards[hostId];
  if (host?.hostedCardIds?.length) {
    const hosted = [...host.hostedCardIds];
    host.hostedCardIds = [];
    for (const id of hosted) {
      const card = state.cards[id];
      if (!card) continue;
      if (
        card.type === "identity" &&
        (host.returnHostedIdentityToOutsideGameOnUninstall ||
          host.gainsTextOfHostedIdentity)
      ) {
        returnHostedIdentityToOutsideGame(state, hostId, id);
        continue;
      }
      card.hostId = undefined;
      if (card.side === "corp") {
        if (!state.corp.discardPile.includes(id)) {
          state.corp.discardPile.push(id);
        }
        card.zone = "corp:archives";
        card.faceup = true;
        card.rezzed = false;
        log(
          state,
          `${card.title} — hosted on ${host.title}; moves to Archives.`,
        );
      } else {
        if (!state.runner.discardPile.includes(id)) {
          state.runner.discardPile.push(id);
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
  // Hackerspace-class: installed resources hosted via hostId also leave play.
  const hostedInstalled = state.runner.installed.filter(
    (id) => id !== hostId && state.cards[id]?.hostId === hostId,
  );
  for (const id of hostedInstalled) {
    const card = state.cards[id];
    if (!card) continue;
    card.hostId = undefined;
    moveRunnerCardToHeap(state, id);
  }
  if (hostedInstalled.length > 0) {
    recomputeRunnerMaxHandSize(state);
  }
}

function fireOnTrashFromGripOrStack(
  state: GameState,
  card: CardInstance,
  fromZone: string,
): void {
  if (!card.onTrashFromGripOrStack) return;
  if (fromZone !== "runner:grip" && fromZone !== "runner:stack") return;
  if (state.turn.lethalDamageSkippingTrashTriggers) {
    log(
      state,
      `${card.title} does not resolve — the Runner has suffered more damage than they have cards (CR ${CR.multipleDamageSimultaneous.number}).`,
    );
    return;
  }
  if ((state.turn.gripOrStackTrashBatchDepth ?? 0) > 0) {
    if (!state.turn.deferredGripTrashTriggers) {
      state.turn.deferredGripTrashTriggers = [];
    }
    state.turn.deferredGripTrashTriggers.push({ cardId: card.id, fromZone });
    return;
  }
  log(
    state,
    `${card.title} — trashed from ${fromZone === "runner:grip" ? "grip" : "stack"} (CR ${CR.trashing.number}).`,
  );
  fireStoredConditionals(state, [
    {
      abilityKey: "on-trash-from-grip-or-stack",
      sourceId: card.id,
      controller: "runner",
      mandatory: true,
      effectKey: "onTrashFromGripOrStack",
      logLine: `${card.title} becomes pending — trashed from grip/stack.`,
    },
  ]);
}

function fireOnUninstall(state: GameState, card: CardInstance): void {
  if (!card.onUninstall) return;
  fireStoredConditionals(state, [
    {
      abilityKey: "on-uninstall",
      sourceId: card.id,
      controller: "runner",
      mandatory: true,
      effectKey: "onUninstall",
      logLine: `${card.title} becomes pending — uninstalled.`,
    },
  ]);
}

/** Begin a simultaneous grip/stack trash batch (damage multi-trash). */
export function beginGripOrStackTrashBatch(state: GameState): void {
  state.turn.gripOrStackTrashBatchDepth =
    (state.turn.gripOrStackTrashBatchDepth ?? 0) + 1;
}

/** End a simultaneous grip/stack trash batch and fire Buffer Drive if needed. */
export function endGripOrStackTrashBatch(state: GameState): void {
  const depth = state.turn.gripOrStackTrashBatchDepth ?? 0;
  if (depth <= 0) return;
  state.turn.gripOrStackTrashBatchDepth = depth - 1;
  if (state.turn.gripOrStackTrashBatchDepth === 0) {
    const deferred = state.turn.deferredGripTrashTriggers ?? [];
    state.turn.deferredGripTrashTriggers = undefined;
    for (const pending of deferred) {
      const card = state.cards[pending.cardId];
      if (!card?.onTrashFromGripOrStack) continue;
      if (!state.turn.lethalDamageSkippingTrashTriggers) {
        log(
          state,
          `${card.title} resolves after the other damage cards have left the grip (${state.runner.hand.length} still in the grip) (CR ${CR.sequentialDamageSelection.number}).`,
        );
      }
      fireOnTrashFromGripOrStack(state, card, pending.fromZone);
    }
    flushGripOrStackTrashBatch(state);
  }
}

function noteGripOrStackTrashForBufferDrive(
  state: GameState,
  cardId: string,
  fromZone: string,
): void {
  if (fromZone !== "runner:grip" && fromZone !== "runner:stack") return;
  if (!state.turn.pendingGripOrStackTrashBatchIds) {
    state.turn.pendingGripOrStackTrashBatchIds = [];
  }
  state.turn.pendingGripOrStackTrashBatchIds.push(cardId);
  if ((state.turn.gripOrStackTrashBatchDepth ?? 0) === 0) {
    flushGripOrStackTrashBatch(state);
  }
}

function flushGripOrStackTrashBatch(state: GameState): void {
  const batch = [...(state.turn.pendingGripOrStackTrashBatchIds ?? [])];
  state.turn.pendingGripOrStackTrashBatchIds = [];
  if (batch.length === 0) return;
  if (state.turn.bufferDriveGripStackTrashUsedThisTurn) return;
  const items: StoredConditionalMark[] = [];
  for (const id of [...state.runner.installed]) {
    const card = state.cards[id];
    if (!card?.onFirstGripOrStackTrashBatchEachTurn) continue;
    state.turn.bufferDriveGripStackTrashUsedThisTurn = true;
    // Leave batch ids on turn for may_add_one_of_card_ids_to_stack_bottom.
    state.turn.pendingGripOrStackTrashBatchIds = batch;
    items.push({
      abilityKey: "on-first-grip-or-stack-trash-batch",
      sourceId: id,
      controller: "runner",
      mandatory: true,
      effectKey: "onFirstGripOrStackTrashBatchEachTurn",
      logLine: `${card.title} becomes pending — first grip/stack trash batch this turn (${batch.length}).`,
    });
    break;
  }
  fireStoredConditionals(state, items);
  // Options bake card ids; clear batch snapshot after offering.
  state.turn.pendingGripOrStackTrashBatchIds = [];
}

/** Solidarity Badge-class: first Runner trash of a Corp card each turn. */
export function noteFirstCorpCardTrashEachTurn(
  state: GameState,
  trashedBy: "corp" | "runner" = "runner",
): void {
  noteRunnerStoleOrTrashedCorpCard(state);
  state.turn.runnerTrashedCorpCardThisTurn = trashedBy === "runner";
  // Hostile Infrastructure meets its trigger only when the Runner trashes
  // the Corp card (CR 1.14.5a).
  if (trashedBy !== "runner") return;
  for (const server of Object.values(state.servers)) {
    for (const id of [...server.root, ...server.ice]) {
      const card = state.cards[id];
      if (!card?.rezzed) continue;
      const n = card.netDamageWheneverRunnerTrashesCorpCard;
      if (!n) continue;
      dealDamage(state, "net", n, id);
      if (state.pendingChoice || state.pendingDamage) return;
    }
  }
  if (state.turn.firstCorpCardTrashUsedThisTurn) return;
  state.turn.firstCorpCardTrashUsedThisTurn = true;
  const items: StoredConditionalMark[] = [];
  for (const id of [...state.runner.installed]) {
    const card = state.cards[id];
    if (!card?.onFirstCorpCardTrashEachTurn) continue;
    items.push({
      abilityKey: "on-first-corp-card-trash",
      sourceId: id,
      controller: "runner",
      mandatory: true,
      effectKey: "onFirstCorpCardTrashEachTurn",
      logLine: `${card.title} becomes pending — first Corp card trashed this turn.`,
    });
  }
  for (const id of [...state.corp.scoreArea]) {
    const card = state.cards[id];
    if (!card?.onFirstCorpCardTrashEachTurn) continue;
    items.push({
      abilityKey: "on-first-corp-card-trash",
      sourceId: id,
      controller: "corp",
      mandatory: true,
      effectKey: "onFirstCorpCardTrashEachTurn",
      logLine: `${card.title} becomes pending — first Corp card trashed this turn.`,
    });
  }
  // NBN: Controlling the Message — Corp identity
  {
    const id = state.corp.identityId;
    const card = id ? state.cards[id] : undefined;
    if (card?.onFirstCorpCardTrashEachTurn) {
      items.push({
        abilityKey: "on-first-corp-card-trash",
        sourceId: id,
        controller: "corp",
        mandatory: true,
        effectKey: "onFirstCorpCardTrashEachTurn",
        logLine: `${card.title} becomes pending — first Corp card trashed this turn.`,
      });
    }
  }
  fireStoredConditionals(state, items);
}

/**
 * Audrey v2-class: whenever the Runner trashes a card they are accessing,
 * fire `onAccessTrash` on installed Runner cards (every trash, no gate).
 * Mâché-class: also fire `onFirstAccessTrashEachTurn` once, after recording
 * `lastAccessTrashCost`.
 */
export function noteAccessTrash(
  state: GameState,
  trashCost?: number,
): void {
  if (trashCost !== undefined) {
    state.turn.lastAccessTrashCost = Math.max(0, trashCost);
  }
  const items: StoredConditionalMark[] = [];
  if (!state.turn.firstAccessTrashUsedThisTurn) {
    for (const id of [...state.runner.installed]) {
      const card = state.cards[id];
      if (!card?.onFirstAccessTrashEachTurn) continue;
      state.turn.firstAccessTrashUsedThisTurn = true;
      items.push({
        abilityKey: "on-first-access-trash",
        sourceId: id,
        controller: "runner",
        mandatory: true,
        effectKey: "onFirstAccessTrashEachTurn",
        logLine: `${card.title} becomes pending — first access trash this turn.`,
      });
      break;
    }
  }
  for (const id of [...state.runner.installed]) {
    const card = state.cards[id];
    if (!card?.onAccessTrash) continue;
    items.push({
      abilityKey: "on-access-trash",
      sourceId: id,
      controller: "runner",
      mandatory: true,
      effectKey: "onAccessTrash",
      logLine: `${card.title} becomes pending — access trash.`,
    });
  }
  fireStoredConditionals(state, items);
}

/** District 99-class: first program or hardware trash each turn. */
export function noteFirstProgramOrHardwareTrashEachTurn(
  state: GameState,
  cardId: string,
): void {
  const card = state.cards[cardId];
  if (!card || (card.type !== "program" && card.type !== "hardware")) return;
  if (state.turn.firstProgramOrHardwareTrashUsedThisTurn) return;
  state.turn.firstProgramOrHardwareTrashUsedThisTurn = true;
  const items: StoredConditionalMark[] = [];
  for (const id of [...state.runner.installed]) {
    const host = state.cards[id];
    if (!host?.onFirstProgramOrHardwareTrashEachTurn) continue;
    items.push({
      abilityKey: "on-first-program-or-hardware-trash",
      sourceId: id,
      controller: "runner",
      mandatory: true,
      effectKey: "onFirstProgramOrHardwareTrashEachTurn",
      logLine: `${host.title} becomes pending — first program/hardware trash this turn.`,
    });
  }
  fireStoredConditionals(state, items);
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
  fireStoredConditionals(state, [
    {
      abilityKey: "on-first-remote-install",
      sourceId: idCard.id,
      controller: "corp",
      mandatory: true,
      effectKey: "onFirstRemoteInstallThisTurn",
      logLine: `${idCard.title} becomes pending — first remote install this turn.`,
    },
  ]);
}

export function noteFirstCorpRootInstallEachTurn(state: GameState): void {
  if (state.turn.firstCorpRootInstallUsedThisTurn) return;
  state.turn.firstCorpRootInstallUsedThisTurn = true;
  const items: StoredConditionalMark[] = [];
  for (const id of [...state.runner.installed]) {
    const card = state.cards[id];
    if (!card?.onFirstCorpRootInstallEachTurn) continue;
    items.push({
      abilityKey: "on-first-corp-root-install",
      sourceId: id,
      controller: "runner",
      mandatory: true,
      effectKey: "onFirstCorpRootInstallEachTurn",
      logLine: `${card.title} becomes pending — first Corp root install this turn.`,
    });
  }
  fireStoredConditionals(state, items);
}

/** HB ETF-class: first time Corp installs any card each turn. */
export function noteFirstCorpCardInstallEachTurn(state: GameState): void {
  if (state.turn.firstCorpCardInstallUsedThisTurn) return;
  state.turn.firstCorpCardInstallUsedThisTurn = true;
  const id = state.corp.identityId;
  const card = state.cards[id];
  if (!card?.onFirstCorpCardInstallEachTurn) return;
  fireStoredConditionals(state, [
    {
      abilityKey: "on-first-corp-card-install",
      sourceId: id,
      controller: "corp",
      mandatory: true,
      effectKey: "onFirstCorpCardInstallEachTurn",
      logLine: `${card.title} becomes pending — first Corp card install this turn.`,
    },
  ]);
}


/**
 * After a Corp card reaches Archives via trash, fire `onTrash` if present.
 * Call only for actual trash (not Marilyn shuffle-into-R&D).
 */

/** Storgotic Resonator: first trash each turn matching Runner ID faction. */
export function noteTrashMatchingRunnerIdentityFaction(
  state: GameState,
  trashedCardId: string,
): void {
  if (state.turn.firstTrashMatchingRunnerIdentityFactionUsedThisTurn) return;
  const trashed = state.cards[trashedCardId];
  const idCard = state.cards[state.runner.identityId];
  const faction = idCard?.faction;
  if (!trashed || !faction || trashed.faction !== faction) return;
  state.turn.firstTrashMatchingRunnerIdentityFactionUsedThisTurn = true;
  const items: StoredConditionalMark[] = [];
  for (const server of Object.values(state.servers)) {
    for (const id of [...server.root]) {
      const card = state.cards[id];
      if (!card?.rezzed || !card.onFirstTrashMatchingRunnerIdentityFactionEachTurn) {
        continue;
      }
      items.push({
        abilityKey: "on-first-trash-matching-runner-id-faction",
        sourceId: id,
        controller: "corp",
        mandatory: true,
        effectKey: "onFirstTrashMatchingRunnerIdentityFactionEachTurn",
        logLine: `${card.title} becomes pending — first trash matching Runner identity faction (${faction}).`,
      });
    }
  }
  fireStoredConditionals(state, items);
}

export function fireCorpOnTrash(state: GameState, cardId: string): void {
  const card = state.cards[cardId];
  if (!card?.onTrash) return;
  fireStoredConditionals(state, [
    {
      abilityKey: "on-trash",
      sourceId: cardId,
      controller: "corp",
      mandatory: true,
      effectKey: "onTrash",
      logLine: `${card.title} becomes pending — trashed.`,
    },
  ]);
}

/** Ronald Five: whenever Runner trashes a Corp card, they lose [click]. */
export function fireRonaldFiveOnCorpTrash(state: GameState): void {
  if (state.activeSide !== "runner") return;
  for (const server of Object.values(state.servers)) {
    for (const id of [...server.root]) {
      const card = state.cards[id];
      if (!card?.rezzed || !card.runnerLosesClickWhenTrashesCorpCard) continue;
      if (abilitiesSuppressed(state, id)) continue;
      if (state.runner.clicks > 0) {
        state.runner.clicks -= 1;
        log(
          state,
          `${card.title} — Runner loses [click] → ${state.runner.clicks}.`,
        );
      } else {
        log(state, `${card.title} — Runner has no clicks to lose.`);
      }
    }
  }
}

/** Friday Chip / Death and Taxes: Runner trashed a Corp card. */
export function fireCotcOnCorpCardTrashed(state: GameState): void {
  for (const id of state.runner.installed) {
    const card = state.cards[id];
    if (!card?.mayPlaceVirusCounterWhenCorpCardTrashed) continue;
    card.virusCounters = (card.virusCounters ?? 0) + 1;
    log(
      state,
      `${card.title} — place 1 virus (Corp card trashed) → ${card.virusCounters}.`,
    );
  }
  for (const cur of Object.values(state.cards)) {
    if (
      cur.zone === "corp:play-area" &&
      cur.mayGainCreditWhenRunnerInstallsOrTrashesInstalled
    ) {
      // Only when trashing an *installed* Runner card — handled elsewhere.
    }
  }
}

/** Death and Taxes: Runner trashed an installed Runner card. */
export function fireCotcOnRunnerInstalledTrashed(state: GameState): void {
  for (const cur of Object.values(state.cards)) {
    if (
      cur.zone === "corp:play-area" &&
      cur.mayGainCreditWhenRunnerInstallsOrTrashesInstalled
    ) {
      state.corp.credits += 1;
      log(
        state,
        `${cur.title} — gain 1¢ (Runner trashed installed) → ${state.corp.credits}¢.`,
      );
    }
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
      const host = card.hostId ? state.cards[card.hostId] : undefined;
      const keep = host?.preventOneVirusPurgeOnHostedProgram ? 1 : 0;
      removed += n - keep;
      card.virusCounters = keep;
    }
  }
  for (const card of Object.values(state.cards)) {
    if (card.onVirusPurge) {
      const installed =
        (card.side === "runner" && state.runner.installed.includes(card.id)) ||
        (card.side === "corp" && card.zone.startsWith("server:")) ||
        state.corp.scoreArea.includes(card.id);
      if (installed) onPurgeEffects.push(card.id);
    }
    if (!card.trashOnVirusPurge) continue;
    if (card.side === "runner" && state.runner.installed.includes(card.id)) {
      toTrash.push(card.id);
    } else if (card.side === "corp" && card.zone.startsWith("server:")) {
      toTrash.push(card.id);
    }
  }
  log(
    state,
    `Purge virus counters — removed ${removed} (from ${state.cards[sourceId]?.title ?? sourceId}) (CR ${CR.trashing.number}).`,
  );
  state.turn.lastVirusCountersPurged = removed;
  for (const id of onPurgeEffects) {
    const card = state.cards[id];
    if (!card?.onVirusPurge) continue;
    // May already be gone if an earlier onVirusPurge trashed it.
    const stillInstalled =
      (card.side === "runner" && state.runner.installed.includes(id)) ||
      (card.side === "corp" && card.zone.startsWith("server:")) ||
      state.corp.scoreArea.includes(id);
    if (!stillInstalled) continue;
    if (card.onVirusPurgeOncePerTurn) {
      if (!state.turn.onVirusPurgeOncePerTurnFiredIds) {
        state.turn.onVirusPurgeOncePerTurnFiredIds = [];
      }
      if (state.turn.onVirusPurgeOncePerTurnFiredIds.includes(id)) continue;
      state.turn.onVirusPurgeOncePerTurnFiredIds.push(id);
    }
    // Resolve one at a time so a prior onVirusPurge that trashes
    // another can still skip it (re-check above on the next pass).
    fireStoredConditionals(state, [
      {
        abilityKey: "on-virus-purge",
        sourceId: id,
        controller: card.side === "corp" ? "corp" : "runner",
        mandatory: true,
        effectKey: "onVirusPurge",
        logLine: `${card.title} becomes pending — virus counters purged.`,
      },
    ]);
  }
  for (const id of toTrash) {
    const card = state.cards[id];
    if (!card) continue;
    // Skip if already trashed by onVirusPurge.
    if (card.side === "runner" && !state.runner.installed.includes(id)) continue;
    if (card.side === "corp" && !card.zone.startsWith("server:")) continue;
    if (card.side === "runner") {
      moveRunnerCardToHeap(state, id);
      log(state, `${card.title} trashed by virus purge.`);
    } else {
      removeCardFromCurrentZone(state, id);
      state.corp.discardPile.push(id);
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
  const items: StoredConditionalMark[] = [];
  for (const id of [...state.runner.installed]) {
    const card = state.cards[id];
    if (!card?.onRemoveTags) continue;
    items.push({
      abilityKey: "on-remove-tags",
      sourceId: id,
      controller: "runner",
      mandatory: true,
      effectKey: "onRemoveTags",
      logLine: `${card.title} becomes pending — tags removed.`,
    });
  }
  if (!state.turn.firstCorpOnRemoveTagsThisTurn) {
    const corpId = state.cards[state.corp.identityId];
    if (corpId?.onRemoveTags) {
      state.turn.firstCorpOnRemoveTagsThisTurn = true;
      items.push({
        abilityKey: "on-remove-tags",
        sourceId: corpId.id,
        controller: "corp",
        mandatory: true,
        effectKey: "onRemoveTags",
        logLine: `${corpId.title} becomes pending — tags removed.`,
      });
    }
  }
  fireStoredConditionals(state, items);
  const avoidOrRemove = fireOnFirstAvoidOrRemoveTagThisTurn(state);
  if (!avoidOrRemove.ok) return avoidOrRemove;
  return { ok: true };
}

/**
 * Thunder Art Gallery: first avoid or remove tag each turn while installed.
 */
export function fireOnFirstAvoidOrRemoveTagThisTurn(
  state: GameState,
): { ok: true } | { ok: false; error: string; cites: import("./types.js").RuleCite[] } {
  if (!state.turn.onFirstAvoidOrRemoveTagFiredIds) {
    state.turn.onFirstAvoidOrRemoveTagFiredIds = [];
  }
  const items: StoredConditionalMark[] = [];
  for (const id of [...state.runner.installed]) {
    const card = state.cards[id];
    if (!card?.onFirstAvoidOrRemoveTagThisTurn) continue;
    if (state.turn.onFirstAvoidOrRemoveTagFiredIds.includes(id)) continue;
    state.turn.onFirstAvoidOrRemoveTagFiredIds.push(id);
    items.push({
      abilityKey: "on-first-avoid-or-remove-tag",
      sourceId: id,
      controller: "runner",
      mandatory: true,
      effectKey: "onFirstAvoidOrRemoveTagThisTurn",
      logLine: `${card.title} becomes pending — first avoid/remove tag this turn.`,
    });
  }
  fireStoredConditionals(state, items);
  return { ok: true };
}
