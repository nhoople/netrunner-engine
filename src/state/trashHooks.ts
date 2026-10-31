/**
 * Trash-triggered card abilities (Steelskin / Mavirus-class).
 */

import { dealDamage } from "./damage.js";
import { maybeOpenTrashPrevent } from "./trashPrevent.js";
import { log } from "./createGame.js";
import { returnHostedIdentityToOutsideGame } from "./fenris.js";
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
  type StoredConditionalMark,
} from "./storedTriggers.js";
import { noteStoredConditionals } from "./storedConditionalHooks.js";
import { checkpointAfterInstruction } from "../legality/checkpoints.js";

function noteAndCheckpointStored(
  state: GameState,
  items: StoredConditionalMark[],
  openedBy: string,
  options?: { independentOfSource?: boolean },
): void {
  noteStoredConditionals(state, items, options);
  if ((state.turn.storedConditionalPending ?? []).length > 0) {
    checkpointAfterInstruction(state, openedBy);
  }
}

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
  noteAndCheckpointStored(state, items, "agenda.addedToRunnerScore");
}

/**
 * Epiphany-class: first Runner steal/trash of a Corp card this turn. Records
 * the condition for the next 10.3.1a scanner pass (phase 3). Does not mark
 * pending here. Still notes the turn tracker for play gates.
 */
export function noteRunnerStoleOrTrashedCorpCard(state: GameState): void {
  state.turn.runnerStoleOrTrashedCorpCardThisTurn = true;
  if (state.turn.firstRunnerStoleOrTrashedUsedThisTurn) return;
  if (state.turn.firstRunnerStoleOrTrashedMetPending) return;
  const idCard = state.cards[state.runner.identityId];
  if (idCard?.onFirstRunnerStoleOrTrashedCorpCardThisTurn) {
    state.turn.firstRunnerStoleOrTrashedMetPending = true;
    return;
  }
  for (const id of [...state.runner.installed]) {
    if (abilitiesSuppressed(state, id)) continue;
    const card = state.cards[id];
    if (!card?.onFirstRunnerStoleOrTrashedCorpCardThisTurn) continue;
    state.turn.firstRunnerStoleOrTrashedMetPending = true;
    return;
  }
}

/**
 * Sebastião "had no tags" is marked at 10.3.1a from the checkpoint tag diff
 * (CR 9.6.6a), not mid-instruction. Kept as a no-op so tag-application call
 * sites stay stable until those imports are cleaned up.
 */
export function fireOnTakeTagsWhenUntagged(
  _state: GameState,
  _tagsBefore: number,
  _amount: number,
): void {
  // Marked in markHadNoTagsFromCheckpointDiff (CR 9.6.6a / 10.3.1a).
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
  // play (including turn-begin leftovers on the bag; CR 9.6.5d). Scoped to
  // cardId so other cards' pendings (and later on-trash triggers for this
  // card) are untouched.
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
  // Tri-maf / Rolodex-class: onTrash when Runner card hits heap — note for 10.3.1a.
  if (card.onTrash) {
    noteAndCheckpointStored(
      state,
      [
        {
          abilityKey: "on-trash",
          sourceId: cardId,
          controller: "runner",
          mandatory: true,
          effectKey: "onTrash",
          logLine: `${card.title} becomes pending — trashed.`,
        },
      ],
      "runner.trash.onTrash",
      { independentOfSource: true },
    );
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
    noteFirstInstalledTrashForReaver(state);
  }
}

/**
 * Reaver: first trash of an installed card each turn. Records the condition
 * for the next 10.3.1a scanner pass (phase 3). Does not mark pending here.
 */
export function noteFirstInstalledTrashForReaver(state: GameState): void {
  if (state.turn.mlReaverDrawUsedThisTurn) return;
  if (state.turn.firstInstalledTrashMetPending) return;
  for (const rid of state.runner.installed) {
    if (abilitiesSuppressed(state, rid)) continue;
    const reaver = state.cards[rid];
    if (!reaver?.drawOnFirstTrashInstalledEachTurn) continue;
    state.turn.firstInstalledTrashMetPending = true;
    return;
  }
}

/**
 * Aniccam-class: first event trashed each turn. Records the condition for the
 * next 10.3.1a scanner pass (phase 3). Does not mark pending here.
 */
export function fireOnFirstEventTrashedThisTurn(state: GameState): void {
  if (state.turn.firstEventTrashedUsedThisTurn) return;
  if (state.turn.firstEventTrashedMetPending) return;
  for (const id of [...state.runner.installed]) {
    if (abilitiesSuppressed(state, id)) continue;
    const card = state.cards[id];
    if (!card?.onFirstEventTrashedThisTurn) continue;
    state.turn.firstEventTrashedMetPending = true;
    return;
  }
}

/** Recompute Runner link from identity + installed cards with printed link. */
export function recomputeRunnerLink(state: GameState): void {
  let n = 0;
  const identityId = state.runner.identityId;
  if (!abilitiesSuppressed(state, identityId)) {
    n += state.cards[identityId]?.link ?? 0;
  }
  for (const id of state.runner.installed) {
    if (abilitiesSuppressed(state, id)) continue;
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
    if (abilitiesSuppressed(state, id)) continue;
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
  noteAndCheckpointStored(state, items, "install.firstInServerRoot");
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
  noteAndCheckpointStored(
    state,
    [
      {
        abilityKey: "on-trash-from-grip-or-stack",
        sourceId: card.id,
        controller: "runner",
        mandatory: true,
        effectKey: "onTrashFromGripOrStack",
        logLine: `${card.title} becomes pending — trashed from grip/stack.`,
      },
    ],
    "runner.trash.fromGripOrStack",
    { independentOfSource: true },
  );
}

function fireOnUninstall(state: GameState, card: CardInstance): void {
  if (!card.onUninstall) return;
  noteAndCheckpointStored(
    state,
    [
      {
        abilityKey: "on-uninstall",
        sourceId: card.id,
        controller: "runner",
        mandatory: true,
        effectKey: "onUninstall",
        logLine: `${card.title} becomes pending — uninstalled.`,
      },
    ],
    "runner.uninstall",
  );
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

/**
 * Buffer Drive-class: first grip/stack trash batch this turn. Records the
 * condition for the next 10.3.1a scanner pass (phase 3). Keeps batch ids on
 * the turn for `may_add_one_of_card_ids_to_stack_bottom` until the effect
 * offers. Does not mark pending here.
 */
function flushGripOrStackTrashBatch(state: GameState): void {
  const batch = [...(state.turn.pendingGripOrStackTrashBatchIds ?? [])];
  state.turn.pendingGripOrStackTrashBatchIds = [];
  if (batch.length === 0) return;
  if (state.turn.bufferDriveGripStackTrashUsedThisTurn) return;
  if (state.turn.bufferDriveGripStackTrashMetPending) return;
  for (const id of [...state.runner.installed]) {
    if (abilitiesSuppressed(state, id)) continue;
    const card = state.cards[id];
    if (!card?.onFirstGripOrStackTrashBatchEachTurn) continue;
    // Leave batch ids on turn for may_add_one_of_card_ids_to_stack_bottom.
    state.turn.pendingGripOrStackTrashBatchIds = batch;
    state.turn.bufferDriveGripStackTrashMetPending = true;
    return;
  }
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
      if (abilitiesSuppressed(state, id)) continue;
      const card = state.cards[id];
      if (!card?.rezzed) continue;
      const n = card.netDamageWheneverRunnerTrashesCorpCard;
      if (!n) continue;
      dealDamage(state, "net", n, id);
      if (state.pendingChoice || state.pendingDamage) return;
    }
  }
  // First-trash conditionals mark at 10.3.1a (phase 3). Hostile net damage
  // above stays immediate (continuous trigger while resolving the trash).
  if (state.turn.firstCorpCardTrashUsedThisTurn) return;
  if (state.turn.firstCorpCardTrashMetPending) return;
  for (const id of [...state.runner.installed]) {
    if (abilitiesSuppressed(state, id)) continue;
    if (state.cards[id]?.onFirstCorpCardTrashEachTurn) {
      state.turn.firstCorpCardTrashMetPending = true;
      return;
    }
  }
  for (const id of [...state.corp.scoreArea]) {
    if (abilitiesSuppressed(state, id)) continue;
    if (state.cards[id]?.onFirstCorpCardTrashEachTurn) {
      state.turn.firstCorpCardTrashMetPending = true;
      return;
    }
  }
  const idCard = state.cards[state.corp.identityId];
  if (idCard?.onFirstCorpCardTrashEachTurn) {
    state.turn.firstCorpCardTrashMetPending = true;
  }
}

/**
 * Audrey v2-class: whenever the Runner trashes a card they are accessing,
 * fire `onAccessTrash` on installed Runner cards (every trash, no gate).
 * Mâché-class: first access trash records MetPending for the next 10.3.1a
 * scanner pass (phase 3), after recording `lastAccessTrashCost`.
 */
export function noteAccessTrash(
  state: GameState,
  trashCost?: number,
): void {
  if (trashCost !== undefined) {
    state.turn.lastAccessTrashCost = Math.max(0, trashCost);
  }
  if (
    !state.turn.firstAccessTrashUsedThisTurn &&
    !state.turn.firstAccessTrashMetPending
  ) {
    for (const id of [...state.runner.installed]) {
      if (abilitiesSuppressed(state, id)) continue;
      if (state.cards[id]?.onFirstAccessTrashEachTurn) {
        state.turn.firstAccessTrashMetPending = true;
        break;
      }
    }
  }
  const items: StoredConditionalMark[] = [];
  for (const id of [...state.runner.installed]) {
    if (abilitiesSuppressed(state, id)) continue;
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
  noteAndCheckpointStored(state, items, "access.trash");
}

/**
 * District 99-class: first program or hardware trash each turn. Records the
 * condition for the next 10.3.1a scanner pass (phase 3). Does not mark
 * pending here.
 */
export function noteFirstProgramOrHardwareTrashEachTurn(
  state: GameState,
  cardId: string,
): void {
  const card = state.cards[cardId];
  if (!card || (card.type !== "program" && card.type !== "hardware")) return;
  if (state.turn.firstProgramOrHardwareTrashUsedThisTurn) return;
  if (state.turn.firstProgramOrHardwareTrashMetPending) return;
  for (const id of [...state.runner.installed]) {
    if (abilitiesSuppressed(state, id)) continue;
    if (state.cards[id]?.onFirstProgramOrHardwareTrashEachTurn) {
      state.turn.firstProgramOrHardwareTrashMetPending = true;
      return;
    }
  }
}

/**
 * Lago Paranoá-class: first Corp install into a server root each turn.
 */
/**
 * A Teia: first Corp install on a remote root or remote ice each turn.
 * Records the condition for the next 10.3.1a scanner pass (phase 3). Sets
 * Used immediately so markSwapInstall (CR 8.8.4b) does not also mark from
 * the same zone change. Does not create pending here.
 */
export function noteFirstRemoteInstallThisTurn(
  state: GameState,
  serverId: import("./types.js").ServerId,
): void {
  const server = state.servers[serverId];
  if (!server || server.kind !== "remote") return;
  state.turn.triggerRemoteInstallServerId = serverId;
  if (state.turn.firstRemoteInstallThisTurnUsed) return;
  if (state.turn.firstRemoteInstallMetPending) return;
  state.turn.firstRemoteInstallThisTurnUsed = true;
  const idCard = state.cards[state.corp.identityId];
  if (
    !idCard?.onFirstRemoteInstallThisTurn ||
    abilitiesSuppressed(state, idCard.id)
  ) {
    return;
  }
  state.turn.firstRemoteInstallMetPending = true;
}

/**
 * Lago-class: first Corp root install each turn. Records the condition for the
 * next 10.3.1a scanner pass (phase 3). Does not mark pending here.
 */
export function noteFirstCorpRootInstallEachTurn(state: GameState): void {
  if (state.turn.firstCorpRootInstallUsedThisTurn) return;
  if (state.turn.firstCorpRootInstallMetPending) return;
  for (const id of [...state.runner.installed]) {
    if (abilitiesSuppressed(state, id)) continue;
    const card = state.cards[id];
    if (!card?.onFirstCorpRootInstallEachTurn) continue;
    state.turn.firstCorpRootInstallMetPending = true;
    return;
  }
}

/**
 * HB ETF / Asa-class: first Corp card install each turn. Records the condition
 * for the next 10.3.1a scanner pass (phase 3). Does not mark pending here.
 */
export function noteFirstCorpCardInstallEachTurn(state: GameState): void {
  if (state.turn.firstCorpCardInstallUsedThisTurn) return;
  if (state.turn.firstCorpCardInstallMetPending) return;
  const id = state.corp.identityId;
  const card = state.cards[id];
  if (!card?.onFirstCorpCardInstallEachTurn) return;
  if (abilitiesSuppressed(state, id)) return;
  state.turn.firstCorpCardInstallMetPending = true;
}


/**
 * After a Corp card reaches Archives via trash, fire `onTrash` if present.
 * Call only for actual trash (not Marilyn shuffle-into-R&D).
 */

/**
 * Storgotic Resonator: first trash each turn matching Runner ID faction.
 * Records the condition for the next 10.3.1a scanner pass (phase 3). Does not
 * mark pending here.
 */
export function noteTrashMatchingRunnerIdentityFaction(
  state: GameState,
  trashedCardId: string,
): void {
  if (state.turn.firstTrashMatchingRunnerIdentityFactionUsedThisTurn) return;
  if (state.turn.firstTrashMatchingRunnerIdentityFactionMetPending) return;
  const trashed = state.cards[trashedCardId];
  const idCard = state.cards[state.runner.identityId];
  const faction = idCard?.faction;
  if (!trashed || !faction || trashed.faction !== faction) return;
  for (const server of Object.values(state.servers)) {
    for (const id of [...server.root]) {
      if (abilitiesSuppressed(state, id)) continue;
      const card = state.cards[id];
      if (!card?.rezzed || !card.onFirstTrashMatchingRunnerIdentityFactionEachTurn) {
        continue;
      }
      state.turn.firstTrashMatchingRunnerIdentityFactionMetPending = true;
      return;
    }
  }
}

export function fireCorpOnTrash(state: GameState, cardId: string): void {
  const card = state.cards[cardId];
  if (!card?.onTrash) return;
  noteAndCheckpointStored(
    state,
    [
      {
        abilityKey: "on-trash",
        sourceId: cardId,
        controller: "corp",
        mandatory: true,
        effectKey: "onTrash",
        logLine: `${card.title} becomes pending — trashed.`,
      },
    ],
    "corp.trash.onTrash",
    { independentOfSource: true },
  );
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
    if (abilitiesSuppressed(state, id)) continue;
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
    if (abilitiesSuppressed(state, cur.id)) continue;
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
      const keep =
        host && !abilitiesSuppressed(state, host.id) && host.preventOneVirusPurgeOnHostedProgram
          ? 1
          : 0;
      removed += n - keep;
      card.virusCounters = keep;
    }
  }
  for (const card of Object.values(state.cards)) {
    if (abilitiesSuppressed(state, card.id)) continue;
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
    // Note each still-installed source; inactive sources drop at mark /
    // resolve (CR 9.6.10) if an earlier purge ability trashed them.
    noteStoredConditionals(state, [
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
  if ((state.turn.storedConditionalPending ?? []).length > 0) {
    checkpointAfterInstruction(state, "virus.purge");
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
      cancelPendingIfSourceInactive(state, (inst) => inst.sourceId !== id);
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
    if (abilitiesSuppressed(state, id)) continue;
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
  noteStoredConditionals(state, items);
  const avoidOrRemove = fireOnFirstAvoidOrRemoveTagThisTurn(state);
  if (!avoidOrRemove.ok) return avoidOrRemove;
  if ((state.turn.storedConditionalPending ?? []).length > 0) {
    checkpointAfterInstruction(state, "tags.removed");
  }
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
    if (abilitiesSuppressed(state, id)) continue;
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
  noteAndCheckpointStored(state, items, "tags.firstAvoidOrRemove");
  return { ok: true };
}
