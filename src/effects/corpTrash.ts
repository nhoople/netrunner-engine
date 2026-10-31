/**
 * Trashing a Corp card to Archives, and the hooks that fire when it leaves
 * play. Runner heap trash and Corp trash choices still call these.
 */
import { abilitiesSuppressed } from "../state/abilities.js";
import { log } from "../state/createGame.js";
import { CR } from "../timing/labels.js";
import { agendaPointsFor, removeCardFromCurrentZone } from "../state/scoring.js";
import {
  fireCorpOnTrash,
  fireCotcOnCorpCardTrashed,
  fireRonaldFiveOnCorpTrash,
  moveRunnerCardToHeap,
  noteCorpCardAddedToArchives,
  noteFirstCorpCardTrashEachTurn,
  noteTrashMatchingRunnerIdentityFaction,
} from "../state/trashHooks.js";
import type { GameState } from "../state/types.js";
import { onInstalledCorpCardTrashed } from "../state/staticFlags.js";
import {
  onRunnerTrashedFromServer,
  runnerCannotTrashWhileRezzed,
} from "../state/cardDeclarations.js";
import { evalEffect } from "./eval.js";
import { iceStrength } from "./iceStrength.js";
import { cancelPendingIfSourceInactive } from "../state/pendingAbilities.js";
import { noteStoredConditionals } from "../state/storedConditionalHooks.js";
import { checkpointAfterInstruction } from "../legality/checkpoints.js";
import {
  fireOnRezzedCardTrashed,
  fireOnRunnerTrashFromThisServerRootOrProtecting,
} from "../state/miscConditionalHooks.js";

export function trashToHeap(state: GameState, cardId: string): void {
  moveRunnerCardToHeap(state, cardId);
}

function maybeFireThreatGiveTagsOnRezzedTrash(
  state: GameState,
  card: GameState["cards"][string],
  wasRezzed: boolean,
): void {
  const spec = card.threatGiveTagsOnRezzedTrash;
  if (!spec || !wasRezzed) return;
  const threatPts = Math.max(
    agendaPointsFor(state, "corp"),
    agendaPointsFor(state, "runner"),
  );
  if (threatPts < spec.level) return;
  state.runner.tags += spec.tags;
  log(
    state,
    `${card.title} — Threat ${spec.level}: give Runner ${spec.tags} tag(s) → ${state.runner.tags}.`,
  );
}


function maybeFireAuCoOnHqTrash(state: GameState, wasFromHq: boolean): void {
  if (!wasFromHq) return;
  const idCard = state.cards[state.corp.identityId];
  if (!idCard?.powerCounterOnDamageOrTrashFromHq) return;
  idCard.powerCounters = (idCard.powerCounters ?? 0) + 1;
  log(
    state,
    `${idCard.title} — place 1 power (trash from HQ) → ${idCard.powerCounters}.`,
  );
}

/** Parasite-class: trash host ice when effective strength ≤ threshold. */
export function maybeTrashHostsAtStrengthLte(state: GameState): void {
  const trashed = new Set<string>();
  for (const id of [...state.runner.installed]) {
    const card = state.cards[id];
    if (!card || typeof card.trashHostWhenStrengthLte !== "number") continue;
    const hostId = card.hostId;
    if (!hostId) continue;
    const host = state.cards[hostId];
    if (!host || host.type !== "ice") continue;
    const str = iceStrength(state, hostId);
    if (str > card.trashHostWhenStrengthLte) continue;
    if (
      host.playersCannotTrashThisIce &&
      !abilitiesSuppressed(state, hostId)
    ) {
      noteStaticConditionResolvedWithNoEffect(state, id, card.title, host.title);
      continue;
    }
    if (trashed.has(hostId)) continue;
    trashed.add(hostId);
    trashCorpCardToArchives(state, hostId);
    if (state.run?.encounter?.iceId === hostId) state.run.encounter = null;
    log(
      state,
      `Trash ${host.title} — host strength ${str} ≤ parasite threshold (CR ${CR.trashing.number}).`,
    );
  }
}

function noteStaticConditionResolvedWithNoEffect(
  state: GameState,
  sourceId: string,
  sourceTitle: string,
  hostTitle: string,
): void {
  const key = state.timingKey;
  const recorded = state.turn.staticConditionNoEffect;
  if (recorded?.timingKey === key && recorded.sourceIds.includes(sourceId)) {
    return;
  }
  if (!recorded || recorded.timingKey !== key) {
    state.turn.staticConditionNoEffect = { timingKey: key, sourceIds: [sourceId] };
  } else {
    recorded.sourceIds.push(sourceId);
  }
  log(
    state,
    `${sourceTitle}'s ability resolves once; ${hostTitle} cannot be trashed (CR ${CR.staticConditionNoEffect.number}).`,
  );
}

export function trashCorpCardToArchives(
  state: GameState,
  cardId: string,
  trashedBy: "corp" | "runner" = state.activeSide,
): void {
  const card = state.cards[cardId];
  const wasRezzed = Boolean(card.rezzed);
  const printedRez = card.rezCost ?? null;
  const zoneBefore = card.zone;
  const wasFromHq = zoneBefore === "corp:hq";
  const wasInstalled = zoneBefore.startsWith("server:");
  if (
    card.playersCannotTrashThisIce &&
    zoneBefore.endsWith(":ice") &&
    !abilitiesSuppressed(state, cardId)
  ) {
    log(state, `Players cannot trash ${card.title}.`);
    return;
  }
  // Kessleroid: Runner cannot trash while rezzed.
  if (
    runnerCannotTrashWhileRezzed(state, cardId) &&
    state.activeSide === "runner"
  ) {
    log(state, `Cannot trash rezzed ${card.title}.`);
    return;
  }
  maybeFireThreatGiveTagsOnRezzedTrash(state, card, wasRezzed);
  // Marilyn Campaign: when would be trashed, may shuffle into R&D instead.
  if (card.mayShuffleIntoRdWhenTrashed && card.rezzed) {
    removeCardFromCurrentZone(state, cardId);
    // CR 9.6.10: still-pending instances for this source die when it leaves play.
    cancelPendingIfSourceInactive(state, (inst) => inst.sourceId !== cardId);
    state.corp.deck.push(cardId);
    card.zone = "corp:rd";
    card.faceup = false;
    card.rezzed = false;
    card.hostedCredits = undefined;
    log(state, `${card.title} — shuffle into R&D instead of trash.`);
    return;
  }
  // Director Haas: while trashed and being accessed by the Runner, add to
  // the Runner's score area as an agenda instead of moving to Archives.
  if (card.onTrashWhileAccessed && state.run?.accessingCardId === cardId) {
    noteStoredConditionals(
      state,
      [
        {
          abilityKey: "on-trash-while-accessed",
          sourceId: cardId,
          controller: "corp",
          mandatory: true,
          effectKey: "onTrashWhileAccessed",
          logLine: `${card.title} becomes pending — trashed while accessed.`,
        },
      ],
      { independentOfSource: true },
    );
    if ((state.turn.storedConditionalPending ?? []).length > 0) {
      checkpointAfterInstruction(state, "corp.trash.whileAccessed");
    }
    return;
  }
  removeCardFromCurrentZone(state, cardId);
  // CR 9.6.10: still-pending instances for this source die when it leaves
  // play. Scoped to cardId so later on-trash triggers for this card remain.
  cancelPendingIfSourceInactive(state, (inst) => inst.sourceId !== cardId);
  state.corp.discardPile.push(cardId);
  card.zone = "corp:archives";
  card.faceup = true;
  card.rezzed = false;
  if (
    wasInstalled &&
    state.run?.attackedServerId === "archives" &&
    !state.run.accessCandidates.includes(cardId)
  ) {
    state.run.accessCandidates.push(cardId);
    log(
      state,
      `${card.title} enters Archives as a new object and is a candidate (CR ${CR.candidatesLeavingServer.number}).`,
    );
  }
  noteCorpCardAddedToArchives(state);
  if (wasInstalled) {
    onInstalledCorpCardTrashed(state, card, wasRezzed);
    if (state.activeSide === "runner") {
      const serverId = zoneBefore.split(":")[1] as import("../state/types.js").ServerId;
      if (serverId) onRunnerTrashedFromServer(state, serverId);
    }
  }
  // Capture host server for onTrash effects (Vaporframe Fabricator).
  const zoneMatch = /^server:([^:]+):(root|ice)$/.exec(zoneBefore);
  state.turn.onTrashSourceServerId = zoneMatch
    ? (zoneMatch[1] as import("../state/types.js").ServerId)
    : null;
  fireCorpOnTrash(state, cardId);
  fireRonaldFiveOnCorpTrash(state);
  fireCotcOnCorpCardTrashed(state);
  noteTrashMatchingRunnerIdentityFaction(state, cardId);
  state.turn.onTrashSourceServerId = null;
  noteFirstCorpCardTrashEachTurn(state, trashedBy);
  maybeFireOnRezzedCardTrashed(state, wasRezzed, printedRez);
  maybeFireHostileArchitecture(state, wasInstalled, cardId, wasRezzed);
  maybeFireYakovCredits(state, wasInstalled, cardId, zoneBefore);
  maybeFireWarroidTracker(state, wasInstalled, cardId, zoneBefore);
  maybeFireAuCoOnHqTrash(state, wasFromHq);

}

function maybeFireHostileArchitecture(
  state: GameState,
  wasInstalled: boolean,
  trashedId: string,
  trashedWasRezzed: boolean,
): void {
  if (!wasInstalled || state.turn.hostileArchitectureUsedThisTurn) return;
  // Include the just-trashed card (Hostile Architecture can fire on itself).
  const candidates: string[] = [trashedId];
  for (const server of Object.values(state.servers)) {
    for (const id of server.root) candidates.push(id);
  }
  for (const id of candidates) {
    const card = state.cards[id];
    const n = card?.meatDamageOnInstalledCorpTrashOncePerTurn ?? 0;
    if (n <= 0) continue;
    const active =
      id === trashedId ? trashedWasRezzed : Boolean(card?.rezzed);
    if (!active) continue;
    state.turn.hostileArchitectureUsedThisTurn = true;
    const r = evalEffect(
      { state, sourceId: id },
      { op: "do", action: { kind: "meat_damage", amount: n } },
    );
    if (!r.ok) {
      log(state, `${card!.title} meat damage failed: ${r.error}`);
    }
    return;
  }
}

function maybeFireYakovCredits(
  state: GameState,
  wasInstalled: boolean,
  trashedId: string,
  zoneBefore: string,
): void {
  if (!wasInstalled || state.turn.corpInstallInProgress) return;
  // zone like server:remote-1:root or server:hq:ice
  const m = /^server:([^:]+):(root|ice)$/.exec(zoneBefore);
  if (!m) return;
  const sid = m[1]!;
  const server = state.servers[sid as import("../state/types.js").ServerId];
  const candidates = new Set<string>([trashedId]);
  if (server) {
    for (const id of [...server.root, ...server.ice]) candidates.add(id);
  }
  for (const id of candidates) {
    const card = state.cards[id];
    const n = card?.creditsOnTrashFromThisServer ?? 0;
    if (n <= 0) continue;
    // Trashed Yakov still pays; other cards must be rezzed.
    if (id !== trashedId && !card?.rezzed) continue;
    state.corp.credits += n;
    log(state, `${card!.title} — gain ${n}¢ (card trashed from this server).`);
  }
}

function maybeFireWarroidTracker(
  state: GameState,
  wasInstalled: boolean,
  _trashedId: string,
  zoneBefore: string,
): void {
  if (!wasInstalled) return;
  if (state.activeSide !== "runner") return;
  const m = /^server:([^:]+):(root|ice)$/.exec(zoneBefore);
  if (!m) return;
  const sid = m[1]!;
  const server = state.servers[sid as import("../state/types.js").ServerId];
  if (!server) return;
  for (const id of [...server.root]) {
    if (state.pendingChoice) break;
    const up = state.cards[id];
    if (!up?.rezzed || !up.onRunnerTrashFromThisServerRootOrProtecting) continue;
    fireOnRunnerTrashFromThisServerRootOrProtecting(state, id);
  }
}

function maybeFireOnRezzedCardTrashed(
  state: GameState,
  wasRezzed: boolean,
  printedRez: number | null,
): void {
  if (!wasRezzed) return;
  // Always record printed rez for Kimberlite / Ob Superheavy consumers.
  if (printedRez !== null) {
    state.turn.lastTrashedRezzedPrintedRezCost = printedRez;
  }
  if (state.turn.corpInstallInProgress) return;
  if (state.turn.obSuperheavyUsedThisTurn) return;
  const idCard = state.cards[state.corp.identityId];
  if (!idCard?.onRezzedCardTrashed) return;
  if (printedRez === null) return;
  state.turn.obSuperheavyUsedThisTurn = true;
  log(
    state,
    `${idCard.title} — rezzed card trashed (printed rez ${printedRez}¢).`,
  );
  fireOnRezzedCardTrashed(state, idCard.id);
}
