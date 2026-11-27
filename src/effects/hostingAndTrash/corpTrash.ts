/**
 * The hooks that fire when a Corp card is trashed to Archives. The trash
 * itself is `trashCard` in `src/state/hostingAndTrash/trash.ts`.
 */
import { abilitiesSuppressed } from "../../state/continuous/abilities.js";
import { isCardActive } from "../../state/continuous/active.js";
import { log } from "../../state/setupAndEnd/createGame.js";
import { CR } from "../../timing/labels.js";
import { agendaPointsFor } from "../../state/turnAndActions/scoring.js";
import {
  fireCorpOnTrash,
  fireCotcOnCorpCardTrashed,
  noteCorpCardAddedToArchives,
  noteFirstCorpCardTrashEachTurn,
  noteTrashMatchingRunnerIdentityFaction,
} from "../../state/hostingAndTrash/trashHooks.js";
import type { GameState } from "../../state/types.js";
import { onInstalledCorpCardTrashed } from "../../state/cardFlags/staticFlags.js";
import {
  onRunnerTrashedFromServer,
  runnerCannotTrashWhileRezzed,
} from "../../state/cardFlags/cardDeclarations.js";
import { evalEffect } from "../eval.js";
import { maybeFireNuvemFirstRdTrash } from "./trashTargetsAndHooks.js";
import { iceStrength } from "../continuous/iceStrength.js";
import { createPendingAbilityInstance } from "../../state/triggers/pendingAbilities.js";
import {
  fireOnRezzedCardTrashed,
  fireOnRunnerTrashFromThisServerRootOrProtecting,
} from "../../state/triggers/miscConditionalHooks.js";

/**
 * Ronald Five: "Whenever the Runner trashes a Corp card (including this
 * asset), they lose [click]." Only a Runner trash meets it (CR 1.14.5a).
 * Ronald Five trashed by the Runner meets its own trigger condition as it
 * moves to Archives, and the ability stays active until it resolves
 * (CR 9.1.8g).
 * The click is lost through the lose-click procedure (`lose_clicks`).
 */
function fireRonaldFiveOnRunnerTrash(
  state: GameState,
  trashedId: string,
  trashedBy: "corp" | "runner" | null | undefined,
  wasRezzed: boolean,
): void {
  if (trashedBy !== "runner") return;
  const sources: string[] = [];
  for (const server of Object.values(state.servers)) {
    for (const id of server.root) {
      const card = state.cards[id];
      if (!card?.rezzed || !card.runnerLosesClickWhenTrashesCorpCard) continue;
      if (abilitiesSuppressed(state, id)) continue;
      sources.push(id);
    }
  }
  if (
    wasRezzed &&
    state.cards[trashedId]?.runnerLosesClickWhenTrashesCorpCard &&
    !sources.includes(trashedId)
  ) {
    sources.push(trashedId);
  }
  for (const id of sources) {
    log(
      state,
      `${state.cards[id]!.title} — the Runner trashed a Corp card; they lose [click] (CR ${CR.abilityRemainsActive.number}).`,
    );
    const r = evalEffect(
      { state, sourceId: id },
      {
        op: "do",
        action: { kind: "lose_clicks", side: "runner", amount: 1 },
      },
    );
    if (!r.ok) log(state, `${state.cards[id]!.title} — ${r.error}`);
  }
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

const STATIC_TRASH_HOST_KEY = "static:trash-host";

/**
 * Parasite ("When the strength of host ice is 0 or less, trash it") and
 * Trypano ("When there are 5 or more virus counters on this program, trash
 * host ice") are conditional abilities with a static condition (CR 9.6.7).
 * During 10.3.1a of each checkpoint, each one whose condition is true at the
 * beginning of that checkpoint becomes pending (CR 9.6.7a, 9.6.7b), unless an
 * instance from the same source is already pending, imminent or resolving
 * (CR 9.6.7c). It resolves in the checkpoint's reaction window (CR 10.3.2),
 * where the Runner trashes the host (CR 1.14.5).
 */
export function markStaticHostTrashConditions(state: GameState): void {
  for (const id of [...state.runner.installed]) {
    const card = state.cards[id];
    const hostId = card?.hostId;
    if (!card || !hostId) continue;
    const host = state.cards[hostId];
    if (!host || host.type !== "ice" || !host.zone.endsWith(":ice")) continue;
    if (abilitiesSuppressed(state, id)) continue;
    const lte = card.trashHostWhenStrengthLte;
    const atVirus = card.trashHostAtVirus;
    const weak = typeof lte === "number" && iceStrength(state, hostId) <= lte;
    const infested =
      typeof atVirus === "number" && (card.virusCounters ?? 0) >= atVirus;
    if (!weak && !infested) continue;
    const open = state.pendingAbilities.some(
      (p) =>
        p.sourceId === id &&
        p.abilityKey === STATIC_TRASH_HOST_KEY &&
        (p.status === "pending" ||
          p.status === "imminent" ||
          p.status === "resolving"),
    );
    if (open) continue;
    // Only while the host ice is rezzed and active (CR 1.8.3a, 9.1.8).
    if (
      host.playersCannotTrashThisIce &&
      isCardActive(state, hostId) &&
      !abilitiesSuppressed(state, hostId)
    ) {
      noteStaticConditionResolvedWithNoEffect(
        state,
        id,
        card.title,
        host.title,
      );
      continue;
    }
    createPendingAbilityInstance(state, {
      abilityKey: STATIC_TRASH_HOST_KEY,
      sourceId: id,
      controller: "runner",
      mandatory: true,
      payload: {
        kind: "inline_conditional",
        effect: {
          op: "do",
          action: { kind: "trash_corp_card", cardId: hostId },
        },
      },
    });
    log(
      state,
      `${card.title} becomes pending — ${weak ? `${host.title} is at strength ${iceStrength(state, hostId)}` : `${card.virusCounters} virus counters`} (CR ${CR.staticConditionPending.number}).`,
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
 * (CR 1.19.1). `trashCard` (`src/state/hostingAndTrash/trash.ts`) places the card,
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
      )[1] as import("../../state/types.js").ServerId;
      if (serverId) onRunnerTrashedFromServer(state, serverId);
    }
  }
  // Capture host server for onTrash effects (Vaporframe Fabricator).
  const zoneMatch = /^server:([^:]+):(root|ice)$/.exec(zoneBefore);
  state.turn.onTrashSourceServerId = zoneMatch
    ? (zoneMatch[1] as import("../../state/types.js").ServerId)
    : null;
  // Every Corp "trash" trigger reads "When the Runner trashes this card"
  // (Hostile Infrastructure: "...a Corp card (including Hostile
  // Infrastructure)"). It is met only when the Runner trashes the card
  // (CR 1.14.5a, 9.6.5c), and only while the card is active, so an unrezzed
  // card's trigger is never met (CR 9.1.7); the ability then stays active in
  // Archives until its instance resolves (CR 9.1.8g). In a simultaneous set
  // the caller marks one instance per card, this one included
  // (CR 9.1.8g.ex1), so it is not noted again.
  if (
    trashedBy === "runner" &&
    wasRezzed &&
    !(origin.simultaneousSet && card.netDamageWheneverRunnerTrashesCorpCard)
  ) {
    fireCorpOnTrash(state, cardId, origin.simultaneousSet);
  }
  // A simultaneous set marks Ronald Five for every card of the set
  // (trashCorpCardSet, CR 9.12.2a).
  if (!origin.simultaneousSet) {
    fireRonaldFiveOnRunnerTrash(state, cardId, trashedBy, wasRezzed);
  }
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
  // Architect's "Players cannot trash this ice" applies only while the ice
  // is rezzed and active (CR 1.8.3a, 9.1.8): an unrezzed Architect is
  // trashed like any other ice, so the trash cannot tell a facedown
  // Architect from another facedown ice (CR 10.2.2b).
  if (
    card.playersCannotTrashThisIce &&
    card.zone.endsWith(":ice") &&
    isCardActive(state, cardId) &&
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
  const server = state.servers[sid as import("../../state/types.js").ServerId];
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
  const server = state.servers[sid as import("../../state/types.js").ServerId];
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
