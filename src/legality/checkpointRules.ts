/** The checkpoint's other steps, CR 10.3.1b through 10.3.1l: expired durations, agenda point wins, uniqueness, hosting and memory restrictions, remotes, positions, cards entering a breached root, discard piles. */
import type {
  GameState,
  CardInstance,
  RuleCite,
  Side,
} from "../state/types.js";
import type { CheckpointDiff } from "../state/triggers/checkpointSnapshot.js";
import {
  evaluateTriggerPredicate,
  PREDICATE_ENTERED_BREACHED_ROOT,
} from "../state/triggers/triggerPredicates.js";
import { clearAppliedReplacements } from "../state/triggers/replacements.js";
import { removeRevertedHostDurations } from "../state/triggers/hostDuration.js";
import { trashDurationPassedCurrents } from "../state/continuous/currents.js";
import { CR } from "../timing/labels.js";
import { expireLingeringEffects } from "../state/continuous/lingeringEffects.js";
import { currentCheckpoint } from "./checkpoints.js";
import {
  agendaPointsFor,
  checkWinConditions,
} from "../state/turnAndActions/scoring.js";
import { trashCard } from "../state/hostingAndTrash/trash.js";
import {
  usedMemory,
  memoryLimit,
  programMemoryCosts,
} from "../state/turnAndActions/turn.js";
import { openPendingChoose } from "../state/triggers/pendingChoice.js";
import { ceaseVacantPositions } from "../state/uninstallAndPosition/uninstall.js";
import { getCardDef } from "../cards/load.js";
import { returnHostedIdentityToOutsideGame } from "../state/setupAndEnd/additionalIdentities.js";
import { abilitiesSuppressed } from "../state/continuous/abilities.js";

/**
 * CR 10.3.1j. Queue cards that entered the breached root since the previous
 * checkpoint via entered_breached_root (zone diff at 10.3.1a, before the early
 * snapshot commit). Step j reads the void after that commit.
 */
export function noteRootEntriesFromZoneDiff(
  state: GameState,
  diff: CheckpointDiff,
): void {
  const match = evaluateTriggerPredicate(
    state,
    diff,
    PREDICATE_ENTERED_BREACHED_ROOT,
  );
  if (
    match.kind !== "entered_breached_root" ||
    match.serverId === null ||
    match.cardIds.length === 0
  ) {
    return;
  }
  for (const id of match.cardIds) {
    noteCardEnteredRootDuringBreach(state, match.serverId, id);
  }
}

/**
 * CR 10.3.1b / 9.10.1. A lingering effect whose duration has passed is
 * removed here. Encounter-duration strength ends after the encounter
 * (CR 10.3.1b.ex1 / 3.9.5b). A current such as Targeted Marketing is
 * trashed after an agenda is stolen (CR 10.3.1b.ex2). Run-duration and
 * turn-duration effects wait for the next checkpoint after that run or
 * turn ends.
 */
export function removeExpiredDurationAbilities(state: GameState): void {
  clearAppliedReplacements(state);
  let removed = removeRevertedHostDurations(state);
  removed += trashDurationPassedCurrents(state);
  const afterEncounter = currentCheckpoint(state)?.cites.some(
    (cite) => cite.number === CR.encounterIcePhase.number,
  );
  const passedRun = state.turn.runDurationPassed === true;
  state.turn.runDurationPassed = undefined;
  const endedTurn = state.turn.turnDurationsPassed;
  if (endedTurn) {
    state.turn.turnDurationsPassed = undefined;
  }
  // Registry lingerings (CR 9.10.1) expire alongside ad-hoc duration fields.
  removed += expireLingeringEffects(state, {
    turn: endedTurn,
    run: passedRun,
    // A run that ends ends the encounter in progress with it (CR 6.1.4,
    // 6.9.6), so its encounter durations pass at this checkpoint too.
    encounter: Boolean(afterEncounter && state.run) || passedRun,
    untilCheckpoint: true,
  });
  if (removed === 0) {
    state.log.push(
      `Duration abilities checked (CR ${CR.checkpointDurationAbilities.number}); none removed.`,
    );
    return;
  }
  state.log.push(
    `Duration abilities checked (CR ${CR.checkpointDurationAbilities.number}); ${removed} removed.`,
  );
}

/**
 * CR 10.3.1c. Count each score area. A side at the agenda-point total wins.
 * Below that total, nobody wins.
 */
export function checkAgendaPointWin(state: GameState): void {
  const need = state.config.agendaPointsToWin;
  const corpPts = agendaPointsFor(state, "corp");
  const runnerPts = agendaPointsFor(state, "runner");
  if (corpPts >= need || runnerPts >= need) {
    checkWinConditions(state);
    return;
  }
  state.log.push(
    `Agenda points checked (CR ${CR.checkpointAgendaPoints.number}); neither player has ${need}.`,
  );
}

/**
 * CR 10.3.1d. Active unique cards that share a name, and installed consoles
 * under one player, keep only the one that became active most recently.
 */
export function checkUniqueness(state: GameState): void {
  const active = activeCardsByActivation(state);
  const trashIds = new Set<string>();
  const uniques = new Map<string, CardInstance[]>();
  for (const card of active) {
    if (!card.unique) continue;
    const group = uniques.get(card.title) ?? [];
    group.push(card);
    uniques.set(card.title, group);
  }
  for (const group of uniques.values()) markOlderCopies(group, trashIds);
  for (const side of ["corp", "runner"] as const) {
    const consoles = active.filter(
      (card) =>
        card.side === side &&
        isInstalled(state, card) &&
        ((card.subtypes ?? []).includes("console") || card.maxConsole),
    );
    markOlderCopies(consoles, trashIds);
  }
  if (trashIds.size === 0) {
    state.log.push(
      `Uniqueness checked (CR ${CR.checkpointUniqueness.number}); nothing trashed.`,
    );
    return;
  }
  for (const id of trashIds) {
    trashByCheckpoint(state, id, CR.checkpointUniqueness, " for uniqueness");
  }
}

/**
 * A checkpoint trashes a card (CR 10.3.1d, 10.3.1e, 10.3.1f, 10.3.1g). The
 * procedure is `trashCard` with `cause: "checkpoint"`: no player trashes it,
 * and the card's own "when trashed" ability is noted for 10.3.1a.
 */
function trashByCheckpoint(
  state: GameState,
  id: string,
  cite: RuleCite,
  why = "",
): void {
  trashCard(state, id, { cause: "checkpoint", cite, why });
}

/**
 * CR 10.3.1e. A forbidden host has one appropriate card, so it is trashed.
 * Memory (CR 10.3.1e.ex2) and an active remote-server limit (CR 4.6.8f)
 * list every other minimal set. One set is trashed here. Several sets
 * pause the checkpoint until the player who chooses has picked one.
 * Returns true when the checkpoint is waiting on that choice.
 */
export function checkCardRestrictions(state: GameState): boolean {
  const cite = CR.checkpointCardRestrictions.number;
  const forbidden = hostedOnForbiddenHost(state).length;
  trashCardsOnForbiddenHosts(state);
  const used = usedMemory(state);
  const limit = memoryLimit(state);
  const plans = restrictionPlans(state);
  if (plans.length === 0) {
    if (used > limit || remoteLimitBroken(state)) {
      state.log.push(
        `Card restrictions checked (CR ${cite}); a restriction is broken and no set was chosen.`,
      );
      return false;
    }
    if (forbidden === 0) {
      state.log.push(
        `Card restrictions checked (CR ${cite}); memory ${used} of ${limit}; nothing trashed.`,
      );
    }
    return false;
  }
  if (plans.length === 1) {
    applyRestrictionPlan(state, plans[0]!);
    return false;
  }
  if (state.pendingChoice) {
    state.log.push(
      `Card restrictions checked (CR ${cite}); a restriction is broken and the open choice comes first.`,
    );
    return false;
  }
  const chooser = restrictionChooser(state, plans);
  const both = restrictionSetsMixSides(state, plans);
  openPendingChoose(state, {
    sourceId: plans[0]?.programs[0] ?? state.corp.identityId,
    chooser,
    options: plans.map((plan) => ({
      id: restrictionOptionId(plan),
      label: restrictionPlanLabel(state, plan),
      effect: {
        op: "do",
        action: { kind: "gain_credits", side: chooser, amount: 0 },
      },
    })),
  });
  const who = both ? "active player" : chooser === "runner" ? "Runner" : "Corp";
  state.log.push(
    `Card restrictions checked (CR ${cite}); the ${who} chooses which set to trash.`,
  );
  return true;
}

/**
 * CR 10.3.1f. Objects hosted on an agenda that moved from a score area to
 * any zone other than a score area are trashed.
 */
export function checkHostedOnAgenda(state: GameState): void {
  const departed = state.turn.agendasLeftScoreArea ?? [];
  state.turn.agendasLeftScoreArea = undefined;
  let trashed = 0;
  for (const { agendaId, hostedIds } of departed) {
    const agenda = state.cards[agendaId];
    if (!agenda) continue;
    if (agenda.zone === "corp:score" || agenda.zone === "runner:score")
      continue;
    for (const id of hostedIds) {
      if (!state.cards[id]) continue;
      trashHostedCard(state, id, CR.checkpointHostedOnAgenda);
      trashed += 1;
    }
    trashed += discardPileCounters(agenda);
    clearDiscardPileCounters(agenda);
  }
  if (trashed === 0) {
    state.log.push(
      `Hosted on agendas checked (CR ${CR.checkpointHostedOnAgenda.number}); nothing trashed.`,
    );
    return;
  }
  state.log.push(
    `Hosted on agendas checked (CR ${CR.checkpointHostedOnAgenda.number}); ${trashed} trashed.`,
  );
}

/**
 * CR 10.3.1g. Cards still hosted on a card in Archives, the heap, or
 * removed from the game are trashed. Cards in a set-aside zone are left
 * (CR 9.5.5). The step repeats while a trash reveals another such card.
 * Hosted counters are not removed here.
 */
export function checkHostedOnUninstalled(state: GameState): void {
  let trashed = 0;
  for (let pass = 0; pass < 32; pass++) {
    const batch = hostedOnUninstalledCard(state);
    if (batch.length === 0) break;
    for (const id of batch) trashHostedCard(state, id);
    trashed += batch.length;
  }
  state.turn.hostsUninstalled = undefined;
  if (trashed === 0) {
    state.log.push(
      `Hosted on uninstalled cards checked (CR ${CR.checkpointHostedOnUninstalled.number}); nothing trashed.`,
    );
  }
}

/**
 * CR 10.3.1h. A remote with no cards protecting it, in its root, or in the
 * process of being installed into it ceases to exist. A run against that
 * server ends once any open paid ability window closes (CR 4.6.8e).
 */
export function checkRemoteServers(state: GameState): void {
  const spared = state.turn.installDestinationServerId;
  const empty = Object.values(state.servers).filter(
    (server) =>
      server.kind === "remote" &&
      server.id !== spared &&
      server.ice.length === 0 &&
      server.root.length === 0,
  );
  if (empty.length === 0) {
    state.log.push(
      `Remote servers checked (CR ${CR.checkpointRemoteServer.number}); none ceased to exist.`,
    );
    return;
  }
  for (const server of empty) {
    delete state.servers[server.id];
    state.log.push(
      `${server.id} ceased to exist (CR ${CR.checkpointRemoteServer.number}).`,
    );
    if (state.run?.attackedServerId === server.id)
      noteAttackedServerCeased(state);
  }
}

function noteAttackedServerCeased(state: GameState): void {
  const run = state.run;
  if (!run) return;
  if (state.priorityStack.length > 0) {
    run.endAfterPaidAbilityWindow = true;
    state.log.push(
      `Run on ${run.attackedServerId} ends when the paid ability window closes (CR ${CR.remoteCease.number}).`,
    );
    return;
  }
  run.endedTheRun = true;
  state.log.push(
    `Run ends because ${run.attackedServerId} ceased to exist (CR ${CR.remoteCease.number}).`,
  );
}

/**
 * CR 10.3.1i. A protecting position with no ice ceases to exist, unless the
 * Runner is currently there (CR 6.2.4). `ceaseVacantPositions` owns the ice
 * lists and keeps the Runner's position (CR 6.2.6).
 */
export function checkVacantPositions(state: GameState): void {
  const ceased = ceaseVacantPositions(state);
  if (ceased === 0) {
    state.log.push(
      `Vacant positions checked (CR ${CR.checkpointVacantPosition.number}); none ceased to exist.`,
    );
  }
}

/**
 * CR 10.3.1j. Record that a card entered the breached root since the previous
 * checkpoint. Filled from the zone diff at 10.3.1a; also used to re-queue when
 * the declaration waits on an open choice.
 */
function noteCardEnteredRootDuringBreach(
  state: GameState,
  serverId: string,
  cardId: string,
): void {
  const run = state.run;
  if (!run || state.timing.structure !== "breach") return;
  if (run.attackedServerId !== serverId) return;
  if (!run.cardsEnteredRootSinceCheckpoint) {
    run.cardsEnteredRootSinceCheckpoint = [];
  }
  if (!run.cardsEnteredRootSinceCheckpoint.includes(cardId)) {
    run.cardsEnteredRootSinceCheckpoint.push(cardId);
  }
}

export function offerRootEntry(state: GameState, ids: string[]): void {
  const [cardId, ...rest] = ids;
  if (!cardId || !state.run) return;
  state.run.pendingRootEntryIds = rest;
  const cite = CR.checkpointCardEnteringRoot.number;
  openPendingChoose(state, {
    sourceId: cardId,
    chooser: "runner",
    options: [
      {
        id: `root-access:yes:${cardId}`,
        label: "The card that entered the root becomes a candidate for access",
        effect: {
          op: "do",
          action: { kind: "gain_credits", side: "runner", amount: 0 },
        },
      },
      {
        id: `root-access:no:${cardId}`,
        label: "The card that entered the root does not become a candidate",
        effect: {
          op: "do",
          action: { kind: "gain_credits", side: "runner", amount: 0 },
        },
      },
    ],
  });
  state.log.push(
    `The Runner declares whether the card that entered the root becomes a candidate (CR ${cite}).`,
  );
}

export function checkCardsEnteringRootDuringBreach(state: GameState): void {
  const cite = CR.checkpointCardEnteringRoot.number;
  const run = state.run;
  const entered = run?.cardsEnteredRootSinceCheckpoint ?? [];
  if (run) run.cardsEnteredRootSinceCheckpoint = [];
  if (state.timing.structure !== "breach" || !run) {
    state.log.push(
      `Cards entering a root during a breach checked (CR ${cite}); no breach is open, so the Runner declares no new candidate.`,
    );
    return;
  }
  if (entered.length === 0) {
    state.log.push(
      `Cards entering a root during a breach checked (CR ${cite}); no card entered the root, so the Runner declares no new candidate.`,
    );
    return;
  }
  if (state.pendingChoice) {
    run.cardsEnteredRootSinceCheckpoint = entered;
    state.log.push(
      `Cards entering a root during a breach checked (CR ${cite}); the declaration waits for the open choice.`,
    );
    return;
  }
  offerRootEntry(state, entered);
}

/**
 * CR 10.3.1k. A card in Archives or the heap that was converted into a
 * counter or an agenda returns to its printed characteristics.
 */
export function checkDiscardPileCards(state: GameState): void {
  let restored = 0;
  for (const id of [...state.corp.discardPile, ...state.runner.discardPile]) {
    const card = state.cards[id];
    if (!card?.convertedInto || !card.defId) continue;
    const printed = getCardDef(card.defId);
    card.type = printed.type;
    card.title = printed.title;
    card.subtypes = [...(printed.subtypes ?? [])];
    card.agendaPoints = printed.agendaPoints;
    card.strength = printed.strength;
    card.convertedInto = undefined;
    restored += 1;
    state.log.push(
      `${card.title} returns to its printed characteristics (CR ${CR.checkpointDiscardPileCards.number}).`,
    );
  }
  if (restored === 0) {
    state.log.push(
      `Discard pile cards checked (CR ${CR.checkpointDiscardPileCards.number}); nothing returns to its printed characteristics.`,
    );
  }
}

/**
 * CR 10.3.1l. Counters in a discard pile return to the bank.
 * A run event that is the source of the open run keeps its counters until
 * that run ends (CR 1.2.1): Raindrops Cut Stone reads them when the run ends.
 */
export function checkDiscardPileCounters(state: GameState): void {
  let returned = 0;
  for (const id of [...state.corp.discardPile, ...state.runner.discardPile]) {
    const card = state.cards[id];
    if (!card) continue;
    const sitting = discardPileCounters(card);
    if (sitting === 0) continue;
    if (state.run && state.run.runSourceId === id) continue;
    returned += sitting;
    clearDiscardPileCounters(card);
  }
  if (returned === 0) {
    state.log.push(
      `Discard pile counters checked (CR ${CR.checkpointDiscardPileCounters.number}); no counter returns to the bank.`,
    );
    return;
  }
  state.log.push(
    `Discard pile counters checked (CR ${CR.checkpointDiscardPileCounters.number}); ${returned} return to the bank.`,
  );
}

function clearDiscardPileCounters(card: CardInstance): void {
  card.advancementCounters = 0;
  card.virusCounters = 0;
  card.powerCounters = 0;
  card.agendaCounters = 0;
  card.badPublicityCounters = 0;
  card.hostedCredits = 0;
  card.recurringCredits = 0;
}

function discardPileCounters(card: CardInstance): number {
  return (
    (card.advancementCounters ?? 0) +
    (card.virusCounters ?? 0) +
    (card.powerCounters ?? 0) +
    (card.agendaCounters ?? 0) +
    (card.badPublicityCounters ?? 0) +
    (card.hostedCredits ?? 0) +
    (card.recurringCredits ?? 0)
  );
}

function hostedOnUninstalledCard(state: GameState): string[] {
  const ids: string[] = [];
  for (const card of Object.values(state.cards)) {
    if (!card.hostId) continue;
    if (card.zone === "runner:set-aside" || card.zone === "corp:set-aside") {
      continue;
    }
    const host = state.cards[card.hostId];
    if (!host) continue;
    if (!leftPlay(host.zone) && !hostedWhenUninstalled(state, card)) continue;
    ids.push(card.id);
  }
  return ids;
}

/**
 * The card was hosted on its host when the host was uninstalled, so it is
 * trashed even when the host went to a score area (CR 8.5.1b, 10.3.1g).
 */
function hostedWhenUninstalled(state: GameState, card: CardInstance): boolean {
  return (state.turn.hostsUninstalled ?? []).some(
    (entry) =>
      entry.hostId === card.hostId && entry.hostedIds.includes(card.id),
  );
}

function leftPlay(zone: CardInstance["zone"]): boolean {
  return (
    zone === "corp:archives" ||
    zone === "corp:hq" ||
    zone === "corp:rd" ||
    zone === "runner:heap" ||
    zone === "runner:grip" ||
    zone === "runner:stack" ||
    zone === "removed-from-game"
  );
}

function trashHostedCard(
  state: GameState,
  id: string,
  cite: RuleCite = CR.checkpointHostedOnUninstalled,
): void {
  const card = state.cards[id];
  const host = card?.hostId ? state.cards[card.hostId] : undefined;
  // A hosted identity on a Fenris-class host returns to the outside-game
  // pile instead (CR 1.5.4b).
  if (
    card?.type === "identity" &&
    host &&
    (host.returnHostedIdentityToOutsideGameOnUninstall ||
      host.gainsTextOfHostedIdentity)
  ) {
    returnHostedIdentityToOutsideGame(state, host.id, id);
    return;
  }
  trashByCheckpoint(state, id, cite);
}

function hostedOnForbiddenHost(state: GameState): string[] {
  const ids: string[] = [];
  for (const card of Object.values(state.cards)) {
    if (!card.hostId) continue;
    const host = state.cards[card.hostId];
    if (!host?.cannotHostCards || !host.rezzed) continue;
    if (abilitiesSuppressed(state, host.id)) continue;
    ids.push(card.id);
  }
  return ids;
}

/** Trash cards hosted on a rezzed card that cannot host (CR 10.3.1e). */
export function trashCardsOnForbiddenHosts(state: GameState): void {
  for (const id of hostedOnForbiddenHost(state)) {
    trashHostedCard(state, id, CR.checkpointCardRestrictions);
  }
}

interface RestrictionPlan {
  /** Programs whose memory cost makes this set minimal. */
  programs: string[];
  /** Remote servers to keep. Null when no remote limit is broken. */
  keep: string[] | null;
}

function restrictionPlans(state: GameState): RestrictionPlan[] {
  const excess = usedMemory(state) - memoryLimit(state);
  const memorySets =
    excess > 0 ? minimalMemorySets(programMemoryCosts(state), excess) : [[]];
  if (excess > 0 && memorySets.length === 0) return [];
  const remoteIds = Object.values(state.servers)
    .filter((server) => server.kind === "remote")
    .map((server) => server.id)
    .sort();
  const remoteLimit = activeRemoteLimit(state);
  const keepSets =
    remoteLimit !== undefined && remoteIds.length > remoteLimit
      ? combinations(remoteIds, remoteLimit)
      : [null];
  if (
    remoteLimit !== undefined &&
    remoteIds.length > remoteLimit &&
    keepSets.length === 0
  ) {
    return [];
  }
  const plans: RestrictionPlan[] = [];
  for (const programs of memorySets) {
    for (const keep of keepSets) {
      if (programs.length === 0 && keep === null) continue;
      plans.push({
        programs: [...programs].sort(),
        keep: keep === null ? null : [...keep].sort(),
      });
    }
  }
  return plans;
}

function minimalMemorySets(
  costs: { id: string; cost: number }[],
  excess: number,
): string[][] {
  const programs = costs.filter((entry) => entry.cost > 0);
  const sets: string[][] = [];
  const chosen: { id: string; cost: number }[] = [];
  const walk = (start: number, sum: number): void => {
    if (sum >= excess) {
      const smallest = Math.min(...chosen.map((entry) => entry.cost));
      if (sum - smallest < excess) sets.push(chosen.map((entry) => entry.id));
      return;
    }
    for (let i = start; i < programs.length; i++) {
      const entry = programs[i];
      if (!entry) continue;
      chosen.push(entry);
      walk(i + 1, sum + entry.cost);
      chosen.pop();
    }
  };
  walk(0, 0);
  return sets;
}

function combinations(items: string[], count: number): string[][] {
  if (count === 0) return [[]];
  if (items.length < count) return [];
  const [head, ...rest] = items;
  if (!head) return [];
  return [
    ...combinations(rest, count - 1).map((combo) => [head, ...combo]),
    ...combinations(rest, count),
  ];
}

function remoteLimitBroken(state: GameState): boolean {
  const limit = activeRemoteLimit(state);
  if (limit === undefined) return false;
  const remotes = Object.values(state.servers).filter(
    (server) => server.kind === "remote",
  ).length;
  return remotes > limit;
}

function activeRemoteLimit(state: GameState): number | undefined {
  let limit: number | undefined;
  for (const card of activeCardsInOrder(state)) {
    if (card.maxRemoteServers === undefined) continue;
    limit =
      limit === undefined
        ? card.maxRemoteServers
        : Math.min(limit, card.maxRemoteServers);
  }
  return limit;
}

function restrictionOptionId(plan: RestrictionPlan): string {
  const keep = plan.keep === null ? "*" : plan.keep.join(",");
  return `restrict:${plan.programs.join(",")}|${keep}`;
}

function restrictionPlanLabel(state: GameState, plan: RestrictionPlan): string {
  const parts: string[] = [];
  if (plan.programs.length > 0) {
    parts.push(
      plan.programs.map((id) => state.cards[id]?.title ?? id).join(" and "),
    );
  }
  if (plan.keep !== null) {
    const dropped = Object.values(state.servers)
      .filter(
        (server) => server.kind === "remote" && !plan.keep?.includes(server.id),
      )
      .map((server) => server.id);
    parts.push(
      dropped.length > 0
        ? `trash cards in ${dropped.join(" and ")}`
        : "keep the remote servers",
    );
  }
  return `Trash ${parts.join("; ")}`;
}

function restrictionSetsMixSides(
  state: GameState,
  plans: RestrictionPlan[],
): boolean {
  const sides = new Set<Side>();
  for (const id of cardsInRestrictionPlans(state, plans)) {
    const side = state.cards[id]?.side;
    if (side) sides.add(side);
  }
  return sides.size > 1;
}

function restrictionChooser(state: GameState, plans: RestrictionPlan[]): Side {
  if (restrictionSetsMixSides(state, plans)) return state.activeSide;
  for (const id of cardsInRestrictionPlans(state, plans)) {
    const side = state.cards[id]?.side;
    if (side) return side;
  }
  return "runner";
}

function cardsInRestrictionPlans(
  state: GameState,
  plans: RestrictionPlan[],
): string[] {
  const ids = new Set<string>();
  for (const plan of plans) {
    for (const id of plan.programs) ids.add(id);
    if (plan.keep === null) continue;
    const keep = new Set(plan.keep);
    for (const server of Object.values(state.servers)) {
      if (server.kind !== "remote" || keep.has(server.id)) continue;
      for (const id of [...server.ice, ...server.root]) ids.add(id);
    }
  }
  return [...ids];
}

export function applyRestrictionPlan(
  state: GameState,
  plan: RestrictionPlan,
): void {
  for (const id of plan.programs) {
    trashRestrictionCard(state, id);
  }
  if (plan.keep === null) return;
  const keep = new Set(plan.keep);
  for (const server of Object.values(state.servers)) {
    if (server.kind !== "remote" || keep.has(server.id)) continue;
    for (const id of [...server.ice, ...server.root])
      trashRestrictionCard(state, id);
    delete state.servers[server.id];
  }
}

function trashRestrictionCard(state: GameState, id: string): void {
  trashByCheckpoint(state, id, CR.checkpointCardRestrictions);
}

function markOlderCopies(cards: CardInstance[], trashIds: Set<string>): void {
  if (cards.length < 2) return;
  for (const card of cards.slice(0, -1)) trashIds.add(card.id);
}

function isInstalled(state: GameState, card: CardInstance): boolean {
  if (state.runner.installed.includes(card.id)) return true;
  return card.rezzed && card.zone.startsWith("server:");
}

function activeCardsInOrder(state: GameState): CardInstance[] {
  const seen = new Set<string>();
  const out: CardInstance[] = [];
  const add = (id: string | undefined, requireRezzed = false) => {
    if (!id || seen.has(id)) return;
    const card = state.cards[id];
    if (!card) return;
    if (requireRezzed && !card.rezzed) return;
    seen.add(id);
    out.push(card);
  };
  add(state.corp.identityId);
  add(state.runner.identityId);
  for (const id of state.corp.scoreArea) add(id);
  for (const id of state.runner.scoreArea) add(id);
  // A facedown installed Runner card has no name or subtypes and is not
  // active (CR 8.1.4a), so it is neither a unique copy nor a console.
  for (const id of state.runner.installed) {
    if (state.cards[id]?.faceup === false) continue;
    add(id);
  }
  const servers = Object.values(state.servers).sort((a, b) =>
    a.id.localeCompare(b.id),
  );
  for (const server of servers) {
    for (const id of server.ice) add(id, true);
    for (const id of server.root) add(id, true);
  }
  return out;
}

/**
 * Active cards, oldest first by when each became active (CR 10.3.1d).
 * The state keeps the order: a card that is active now and was not at the
 * last checkpoint goes to the end, and a card that stopped being active is
 * dropped, so it counts as new if it becomes active again.
 */
function activeCardsByActivation(state: GameState): CardInstance[] {
  const active = activeCardsInOrder(state);
  const activeIds = new Set(active.map((card) => card.id));
  const order = (state.activeOrder ?? []).filter((id) => activeIds.has(id));
  const known = new Set(order);
  for (const card of active) {
    if (!known.has(card.id)) order.push(card.id);
  }
  state.activeOrder = order;
  const rank = new Map(order.map((id, index) => [id, index]));
  return [...active].sort((a, b) => rank.get(a.id)! - rank.get(b.id)!);
}
