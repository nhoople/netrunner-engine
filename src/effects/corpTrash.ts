/**
 * Trashing a Corp card to Archives, and the hooks that fire when it leaves
 * play. Runner heap trash and Corp trash choices still call these.
 */
import { log } from "../state/createGame.js";
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
import { CR } from "../timing/labels.js";
import { evalEffect } from "./eval.js";
import { iceStrength } from "./iceStrength.js";

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
  const victims: string[] = [];
  for (const id of state.runner.rig) {
    const card = state.cards[id];
    if (!card || typeof card.trashHostWhenStrengthLte !== "number") continue;
    const hostId = card.hostId;
    if (!hostId) continue;
    const host = state.cards[hostId];
    if (!host || host.type !== "ice") continue;
    const str = iceStrength(state, hostId);
    if (str > card.trashHostWhenStrengthLte) continue;
    victims.push(hostId);
  }
  for (const hostId of [...new Set(victims)]) {
    const host = state.cards[hostId];
    if (!host || host.type !== "ice") continue;
    const str = iceStrength(state, hostId);
    trashCorpCardToArchives(state, hostId);
    if (state.run?.encounter?.iceId === hostId) state.run.encounter = null;
    log(
      state,
      `Trash ${host.title} — host strength ${str} ≤ parasite threshold (CR ${CR.trashing.number}).`,
    );
  }
}

export function trashCorpCardToArchives(state: GameState, cardId: string): void {
  const card = state.cards[cardId];
  const wasRezzed = Boolean(card.rezzed);
  const printedRez = card.rezCost ?? null;
  const zoneBefore = card.zone;
  const wasFromHq = zoneBefore === "corp:hq";
  const wasInstalled = zoneBefore.startsWith("server:");
  // Kessleroid: Runner cannot trash while rezzed.
  if (
    card.cannotBeTrashedByRunnerWhileRezzed &&
    wasRezzed &&
    state.activeSide === "runner"
  ) {
    log(state, `Cannot trash rezzed ${card.title}.`);
    return;
  }
  maybeFireThreatGiveTagsOnRezzedTrash(state, card, wasRezzed);
  // Marilyn Campaign: when would be trashed, may shuffle into R&D instead.
  if (card.mayShuffleIntoRdWhenTrashed && card.rezzed) {
    removeCardFromCurrentZone(state, cardId);
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
    const r = evalEffect({ state, sourceId: cardId }, card.onTrashWhileAccessed);
    if (!r.ok) {
      log(state, `onTrashWhileAccessed failed on ${card.title}: ${r.error}`);
    }
    return;
  }
  removeCardFromCurrentZone(state, cardId);
  state.corp.discard.push(cardId);
  card.zone = "corp:archives";
  card.faceup = true;
  card.rezzed = false;
  noteCorpCardAddedToArchives(state);
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
  noteFirstCorpCardTrashEachTurn(state);
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
    const r = evalEffect(
      { state, sourceId: id },
      up.onRunnerTrashFromThisServerRootOrProtecting,
    );
    if (!r.ok) {
      log(
        state,
        `onRunnerTrashFromThisServerRootOrProtecting failed on ${up.title}: ${r.error}`,
      );
    }
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
  const r = evalEffect(
    { state, sourceId: idCard.id },
    idCard.onRezzedCardTrashed,
  );
  if (!r.ok) {
    log(state, `onRezzedCardTrashed failed on ${idCard.title}: ${r.error}`);
  }
}
