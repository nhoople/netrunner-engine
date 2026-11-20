/**
 * The hooks that fire when a Corp card is trashed to Archives. The trash
 * itself is `trashCard` in `src/state/procedures/trash.ts`.
 */
import { abilitiesSuppressed } from "../state/abilities.js";
import { log } from "../state/createGame.js";
import { CR } from "../timing/labels.js";
import { agendaPointsFor } from "../state/scoring.js";
import {
  fireCorpOnTrash,
  fireCotcOnCorpCardTrashed,
  fireRonaldFiveOnCorpTrash,
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
import { evalEffect, maybeFireNuvemFirstRdTrash } from "./eval.js";
import { iceStrength } from "./iceStrength.js";
import { trashCard } from "../state/procedures/trash.js";
import {
  fireOnRezzedCardTrashed,
  fireOnRunnerTrashFromThisServerRootOrProtecting,
} from "../state/miscConditionalHooks.js";

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
    if (host.playersCannotTrashThisIce && !abilitiesSuppressed(state, hostId)) {
      noteStaticConditionResolvedWithNoEffect(
        state,
        id,
        card.title,
        host.title,
      );
      continue;
    }
    if (trashed.has(hostId)) continue;
    trashed.add(hostId);
    // The Runner controls the hosted card's ability (CR 1.14.5).
    trashCard(state, hostId, { by: "runner" });
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
    state.turn.staticConditionNoEffect = {
      timingKey: key,
      sourceIds: [sourceId],
    };
  } else {
    recorded.sourceIds.push(sourceId);
  }
  log(
    state,
    `${sourceTitle}'s ability resolves once; ${hostTitle} cannot be trashed (CR ${CR.staticConditionNoEffect.number}).`,
  );
}

/** What a Corp card was before `trashCard` moved it to Archives. */
export interface CorpTrashOrigin {
  trashedBy: "corp" | "runner" | null;
  zoneBefore: string;
  wasRezzed: boolean;
  printedRez: number | null;
  /** The caller marks the set's "whenever the Runner trashes" triggers. */
  simultaneousSet?: boolean;
  /**
   * `false` when a replacement sent the trashed card somewhere other than
   * Archives (Marilyn Campaign, Director Haas). It is still trashed, so the
   * trash triggers fire, but nothing entered Archives.
   */
  inArchives?: boolean;
}

/**
 * Trash triggers for a Corp card that has just arrived in Archives
 * (CR 1.19.1). `trashCard` (`src/state/procedures/trash.ts`) places the card,
 * then calls this. Conditions that care who trashed a card read `trashedBy`,
 * not whose turn it is (CR 1.14.5a).
 */
export function noteCorpCardTrashedToArchives(
  state: GameState,
  cardId: string,
  origin: CorpTrashOrigin,
): void {
  const { trashedBy, zoneBefore, wasRezzed, printedRez } = origin;
  const card = state.cards[cardId];
  const wasInstalled = zoneBefore.startsWith("server:");
  const wasFromHq = zoneBefore === "corp:hq";
  const inArchives = origin.inArchives ?? true;
  if (
    inArchives &&
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
  if (inArchives) noteCorpCardAddedToArchives(state);
  // Persistent (CR 9.12.5a): when the Runner trashes a rezzed card they are
  // accessing, its persistent abilities last until the run ends. Flagship's
  // access cap is the only one the engine models; it is printed persistent.
  if (
    trashedBy === "runner" &&
    wasRezzed &&
    state.run?.accessingCardId === cardId &&
    card.maxAccessOtherThanSelf !== undefined
  ) {
    state.run.persistentAccessCaps = {
      ...(state.run.persistentAccessCaps ?? {}),
      [cardId]: card.maxAccessOtherThanSelf,
    };
  }
  if (wasInstalled) {
    onInstalledCorpCardTrashed(state, card, wasRezzed);
    if (trashedBy === "runner") {
      const serverId = zoneBefore.split(
        ":",
      )[1] as import("../state/types.js").ServerId;
      if (serverId) onRunnerTrashedFromServer(state, serverId);
    }
  }
  // Capture host server for onTrash effects (Vaporframe Fabricator).
  const zoneMatch = /^server:([^:]+):(root|ice)$/.exec(zoneBefore);
  state.turn.onTrashSourceServerId = zoneMatch
    ? (zoneMatch[1] as import("../state/types.js").ServerId)
    : null;
  // Hostile Infrastructure's "whenever the Runner trashes a Corp card" sees
  // its own trash too. In a simultaneous set the caller marks one instance
  // per card, this one included (CR 9.1.8g.ex1), so it is not noted again.
  if (!(
    origin.simultaneousSet && card.netDamageWheneverRunnerTrashesCorpCard
  )) {
    fireCorpOnTrash(state, cardId);
  }
  fireRonaldFiveOnCorpTrash(state);
  fireCotcOnCorpCardTrashed(state);
  noteTrashMatchingRunnerIdentityFaction(state, cardId);
  state.turn.onTrashSourceServerId = null;
  noteFirstCorpCardTrashEachTurn(
    state,
    trashedBy ?? "corp",
    origin.simultaneousSet,
    wasInstalled,
  );
  maybeFireOnRezzedCardTrashed(state, wasRezzed, printedRez, trashedBy);
  maybeFireHostileArchitecture(
    state,
    wasInstalled,
    cardId,
    wasRezzed,
    trashedBy,
  );
  maybeFireYakovCredits(state, wasInstalled, cardId, zoneBefore, wasRezzed);
  if (!origin.simultaneousSet) {
    maybeFireWarroidTracker(state, wasInstalled, trashedBy, zoneBefore);
  }
  maybeFireAuCoOnHqTrash(state, wasFromHq);
  // Nuvem SA: "The first time you trash a card from R&D during each of your
  // turns": the Corp's trash, on the Corp's turn, whatever trashed it. A
  // Runner card trashing from R&D does not meet it (CR 1.14.5).
  if (
    zoneBefore === "corp:rd" &&
    trashedBy !== "runner" &&
    state.activeSide === "corp"
  ) {
    maybeFireNuvemFirstRdTrash(state);
  }
}

/**
 * Corp-side "cannot be trashed" checks, before the trash begins: Players
 * cannot trash this ice, and Kessleroid-class "the Runner cannot trash this
 * while rezzed". Returns the log line when the trash does not happen.
 */
export function corpTrashRefused(
  state: GameState,
  cardId: string,
  trashedBy: "corp" | "runner" | null,
): string | null {
  const card = state.cards[cardId];
  if (
    card.playersCannotTrashThisIce &&
    card.zone.endsWith(":ice") &&
    !abilitiesSuppressed(state, cardId)
  ) {
    return `Players cannot trash ${card.title}.`;
  }
  if (runnerCannotTrashWhileRezzed(state, cardId) && trashedBy === "runner") {
    return `Cannot trash rezzed ${card.title}.`;
  }
  return null;
}

/**
 * Threat assets: "When the Runner trashes this asset (while it is rezzed)".
 * Only a Runner trash meets it (CR 1.14.5a).
 */
export function maybeFireThreatOnTrash(
  state: GameState,
  cardId: string,
  trashedBy: "corp" | "runner" | null,
): void {
  if (trashedBy !== "runner") return;
  const card = state.cards[cardId];
  maybeFireThreatGiveTagsOnRezzedTrash(state, card, Boolean(card.rezzed));
}

function maybeFireHostileArchitecture(
  state: GameState,
  wasInstalled: boolean,
  trashedId: string,
  trashedWasRezzed: boolean,
  trashedBy: "corp" | "runner" | null,
): void {
  // "The first time each turn the Runner trashes": a Corp trash neither
  // meets it nor uses up the turn (CR 1.14.5a).
  if (trashedBy !== "runner") return;
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
    const active = id === trashedId ? trashedWasRezzed : Boolean(card?.rezzed);
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
  trashedWasRezzed: boolean,
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
    // Yakov's ability is active only while it is rezzed: a trashed Yakov
    // pays if it was rezzed when trashed (CR 9.1.8g).
    const active = id === trashedId ? trashedWasRezzed : Boolean(card?.rezzed);
    if (!active) continue;
    state.corp.credits += n;
    log(state, `${card!.title} — gain ${n}¢ (card trashed from this server).`);
  }
}

function maybeFireWarroidTracker(
  state: GameState,
  wasInstalled: boolean,
  trashedBy: "corp" | "runner" | null,
  zoneBefore: string,
): void {
  if (!wasInstalled) return;
  // "Whenever the Runner trashes": met by the Runner's trash on either
  // player's turn, and not by the Corp's (CR 1.14.5a).
  if (trashedBy !== "runner") return;
  const m = /^server:([^:]+):(root|ice)$/.exec(zoneBefore);
  if (!m) return;
  const sid = m[1]!;
  const server = state.servers[sid as import("../state/types.js").ServerId];
  if (!server) return;
  for (const id of [...server.root]) {
    if (state.pendingChoice) break;
    const up = state.cards[id];
    if (!up?.rezzed || !up.onRunnerTrashFromThisServerRootOrProtecting)
      continue;
    fireOnRunnerTrashFromThisServerRootOrProtecting(state, id);
  }
}

function maybeFireOnRezzedCardTrashed(
  state: GameState,
  wasRezzed: boolean,
  printedRez: number | null,
  trashedBy: "corp" | "runner" | null,
): void {
  if (!wasRezzed) return;
  // Always record printed rez for Kimberlite / Ob Superheavy consumers.
  if (printedRez !== null) {
    state.turn.lastTrashedRezzedPrintedRezCost = printedRez;
  }
  if (state.turn.corpInstallInProgress) return;
  // Ob Superheavy Logistics: "When you trash a rezzed card": the Corp's
  // trash only; a Runner trash neither meets it nor uses it up (CR 1.14.5).
  if (trashedBy === "runner") return;
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
