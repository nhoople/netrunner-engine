import type {
  CardInstance,
  CheckpointFrame,
  CheckpointKind,
  ForbiddenAction,
  GameState,
  Restriction,
  RuleCite,
} from "../state/types.js";
import { memoryLimit, usedMemory } from "../state/turn.js";
import { CR } from "../timing/labels.js";
import {
  agendaPointsFor,
  checkWinConditions,
  removeCardFromCurrentZone,
} from "../state/scoring.js";

let checkpointSeq = 0;

export function pushCheckpoint(
  state: GameState,
  kind: CheckpointKind,
  label: string,
  cites: RuleCite[],
  openedBy: string,
): CheckpointFrame {
  const frame: CheckpointFrame = {
    id: `cp-${++checkpointSeq}`,
    kind,
    label,
    cites,
    openedBy,
  };
  state.checkpoints.push(frame);
  state.log.push(
    `Checkpoint open [${kind}] ${label} (${cites.map((c) => c.number).join(", ")}) ← ${openedBy}`,
  );
  return frame;
}

export function popCheckpoint(state: GameState, expectedId?: string): CheckpointFrame | null {
  const frame = state.checkpoints.pop() ?? null;
  if (!frame) return null;
  if (expectedId && frame.id !== expectedId) {
    state.log.push(
      `Checkpoint mismatch: expected ${expectedId}, closed ${frame.id}`,
    );
  }
  state.log.push(
    `Checkpoint close [${frame.kind}] ${frame.label} (${frame.cites.map((c) => c.number).join(", ")})`,
  );
  return frame;
}

export function currentCheckpoint(state: GameState): CheckpointFrame | null {
  return state.checkpoints[state.checkpoints.length - 1] ?? null;
}

/**
 * Record that a checkpoint occurred, then close it.
 * CR 10.3.1a through CR 10.3.1l run before the frame closes.
 * CR 10.3.2 is checked after the frame closes. No conditional ability is
 * marked pending, so the reaction window stays closed.
 * The frame is what lets an instruction pause at the moments in CR 9.11.1.
 */
export function occurCheckpoint(
  state: GameState,
  kind: CheckpointKind,
  label: string,
  cites: RuleCite[],
  openedBy: string,
): void {
  const frame = pushCheckpoint(state, kind, label, cites, openedBy);
  markConditionalAbilities(state);
  removeExpiredDurationAbilities(state);
  checkAgendaPointWin(state);
  checkUniqueness(state);
  checkCardRestrictions(state);
  checkHostedOnAgenda(state);
  checkHostedOnUninstalled(state);
  checkRemoteServers(state);
  checkVacantPositions(state);
  checkCardsEnteringRootDuringBreach(state);
  checkDiscardPileCards(state);
  checkDiscardPileCounters(state);
  popCheckpoint(state, frame.id);
  closeCheckpointReactionWindow(state);
}

/**
 * CR 10.3.1a. A swap's install is met here (CR 8.8.4b). Otherwise none
 * are marked pending.
 */
function markConditionalAbilities(state: GameState): void {
  const serverId = state.turn.swapInstalledServerId;
  state.turn.swapInstalledServerId = null;
  const identity = serverId ? state.cards[state.corp.identityId] : undefined;
  if (
    serverId &&
    !state.turn.firstRemoteInstallThisTurnUsed &&
    identity?.onFirstRemoteInstallThisTurn
  ) {
    state.turn.swapInstallTriggerPending = true;
    state.turn.triggerRemoteInstallServerId = serverId;
    state.log.push(
      `${identity.title} becomes pending (CR ${CR.swapBecomeInstalled.number}).`,
    );
    return;
  }
  state.log.push(
    `Conditional abilities checked (CR ${CR.checkpointConditionalAbilities.number}); none marked pending.`,
  );
}

/**
 * CR 10.3.2. A reaction window opens after the checkpoint when conditional
 * abilities were marked pending. None are marked, so the window stays closed.
 */
function closeCheckpointReactionWindow(state: GameState): void {
  if (state.turn.swapInstallTriggerPending) {
    const title =
      state.cards[state.corp.identityId]?.title ?? "A conditional ability";
    state.log.push(
      `Reaction window (CR ${CR.checkpointReaction.number}); ${title} is pending.`,
    );
    return;
  }
  state.log.push(
    `Reaction window checked (CR ${CR.checkpointReaction.number}); none marked pending, so it stays closed.`,
  );
}

/**
 * CR 10.3.1b. No ability with a passed duration is registered yet, so the
 * checkpoint removes none.
 */
function removeExpiredDurationAbilities(state: GameState): void {
  state.log.push(
    `Duration abilities checked (CR ${CR.checkpointDurationAbilities.number}); none removed.`,
  );
}

/**
 * CR 10.3.1c. Count each score area. A side at the agenda-point total wins.
 * Below that total, nobody wins.
 */
function checkAgendaPointWin(state: GameState): void {
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
 * under one player, keep only the one latest in play order.
 */
function checkUniqueness(state: GameState): void {
  const active = activeCardsInOrder(state);
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
        (card.subtypes ?? []).includes("console"),
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
    const card = state.cards[id];
    if (!card) continue;
    removeCardFromCurrentZone(state, id);
    if (card.side === "runner") {
      card.zone = "runner:heap";
      card.faceup = true;
      state.runner.discard.push(id);
    } else {
      card.zone = "corp:archives";
      card.faceup = false;
      state.corp.discard.push(id);
    }
    card.rezzed = false;
    state.log.push(
      `${card.title} trashed for uniqueness (CR ${CR.checkpointUniqueness.number}).`,
    );
  }
}

/**
 * CR 10.3.1e. Memory, forbidden hosts, and an active remote-server limit
 * are scanned. A legal table trashes nothing. Choosing which set to trash
 * when a restriction is already broken is not done here.
 */
function checkCardRestrictions(state: GameState): void {
  const used = usedMemory(state);
  const limit = memoryLimit(state);
  const broken =
    used > limit ||
    hostedOnForbiddenHost(state).length > 0 ||
    remoteCountExceedsActiveLimit(state);
  if (!broken) {
    state.log.push(
      `Card restrictions checked (CR ${CR.checkpointCardRestrictions.number}); memory ${used} of ${limit}; nothing trashed.`,
    );
    return;
  }
  state.log.push(
    `Card restrictions checked (CR ${CR.checkpointCardRestrictions.number}); a restriction is broken and no set was chosen.`,
  );
}

/**
 * CR 10.3.1f. Objects hosted on an agenda that left a score area are trashed.
 * No departure from a score area is recorded yet, so this step trashes nothing.
 */
function checkHostedOnAgenda(state: GameState): void {
  state.log.push(
    `Hosted on agendas checked (CR ${CR.checkpointHostedOnAgenda.number}); nothing trashed.`,
  );
}

/**
 * CR 10.3.1g. Cards still hosted on a card in Archives, the heap, or
 * removed from the game are trashed. Cards in a set-aside zone are left
 * (CR 9.5.5). The step repeats while a trash reveals another such card.
 * Hosted counters are not removed here.
 */
function checkHostedOnUninstalled(state: GameState): void {
  let trashed = 0;
  for (let pass = 0; pass < 32; pass++) {
    const batch = hostedOnUninstalledCard(state);
    if (batch.length === 0) break;
    for (const id of batch) trashHostedCard(state, id);
    trashed += batch.length;
  }
  if (trashed === 0) {
    state.log.push(
      `Hosted on uninstalled cards checked (CR ${CR.checkpointHostedOnUninstalled.number}); nothing trashed.`,
    );
  }
}

/**
 * CR 10.3.1h. A remote with no cards protecting it or in its root ceases
 * to exist. This step only reports the table. It does not remove an empty
 * remote: an install can still be placing that server's first card, and a
 * run can still be aimed at one.
 */
function checkRemoteServers(state: GameState): void {
  const empty = Object.values(state.servers).filter(
    (server) =>
      server.kind === "remote" &&
      server.ice.length === 0 &&
      server.root.length === 0,
  );
  if (empty.length === 0) {
    state.log.push(
      `Remote servers checked (CR ${CR.checkpointRemoteServer.number}); none ceased to exist.`,
    );
    return;
  }
  state.log.push(
    `Remote servers checked (CR ${CR.checkpointRemoteServer.number}); ${empty.length} empty ${empty.length === 1 ? "remote remains" : "remotes remain"}.`,
  );
}

/**
 * CR 10.3.1i. A protecting position with no ice ceases to exist, unless the
 * Runner is currently there (CR 6.2.4). The ice list stores only card ids,
 * so a vacant position is a missing card. Ice being installed into a new
 * position is not tracked.
 */
function checkVacantPositions(state: GameState): void {
  let ceased = 0;
  for (const server of Object.values(state.servers)) {
    const kept: string[] = [];
    let removedBeforeRunner = 0;
    const onThisServer = state.run?.attackedServerId === server.id;
    const runnerPos = onThisServer ? (state.run?.position ?? null) : null;
    server.ice.forEach((id, index) => {
      const occupied = state.cards[id] != null;
      const current = runnerPos === index;
      if (occupied || current) {
        kept.push(id);
        return;
      }
      if (runnerPos != null && runnerPos > index) removedBeforeRunner += 1;
      ceased += 1;
      state.log.push(
        `Position ${index} on ${server.id} ceased to exist (CR ${CR.checkpointVacantPosition.number}).`,
      );
    });
    server.ice = kept;
    if (
      removedBeforeRunner > 0 &&
      state.run &&
      onThisServer &&
      state.run.position != null
    ) {
      state.run.position -= removedBeforeRunner;
    }
  }
  if (ceased === 0) {
    state.log.push(
      `Vacant positions checked (CR ${CR.checkpointVacantPosition.number}); none ceased to exist.`,
    );
  }
}

/**
 * CR 10.3.1j. During a breach, the Runner may add each card that entered
 * that server's root since the previous checkpoint to the access candidates.
 * Cards that entered a root are not recorded, so an open breach offers no
 * declaration.
 */
function checkCardsEnteringRootDuringBreach(state: GameState): void {
  const cite = CR.checkpointCardEnteringRoot.number;
  if (state.timing.structure !== "breach") {
    state.log.push(
      `Cards entering a root during a breach checked (CR ${cite}); no breach is open, so the Runner declares no new candidate.`,
    );
    return;
  }
  state.log.push(
    `Cards entering a root during a breach checked (CR ${cite}); cards that entered the root since the previous checkpoint are not recorded.`,
  );
}

/**
 * CR 10.3.1k. A card in Archives or the heap that was converted into a
 * counter or an agenda returns to its printed characteristics. No card
 * records such a conversion, so this step restores nothing.
 */
function checkDiscardPileCards(state: GameState): void {
  state.log.push(
    `Discard pile cards checked (CR ${CR.checkpointDiscardPileCards.number}); nothing returns to its printed characteristics.`,
  );
}

/**
 * CR 10.3.1l. Counters on cards in Archives or the heap return to the bank.
 * Abilities still read those counters after the card has reached the pile,
 * so this step counts them and leaves them in place.
 */
function checkDiscardPileCounters(state: GameState): void {
  let sitting = 0;
  for (const id of [...state.corp.discard, ...state.runner.discard]) {
    const card = state.cards[id];
    if (!card) continue;
    sitting += discardPileCounters(card);
  }
  if (sitting === 0) {
    state.log.push(
      `Discard pile counters checked (CR ${CR.checkpointDiscardPileCounters.number}); no counter returns to the bank.`,
    );
    return;
  }
  state.log.push(
    `Discard pile counters checked (CR ${CR.checkpointDiscardPileCounters.number}); ${sitting} remain on discarded cards.`,
  );
}

function discardPileCounters(card: CardInstance): number {
  return (
    (card.advancementTokens ?? 0) +
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
    if (!host || !leftPlay(host.zone)) continue;
    ids.push(card.id);
  }
  return ids;
}

function leftPlay(zone: CardInstance["zone"]): boolean {
  return (
    zone === "corp:archives" ||
    zone === "runner:heap" ||
    zone === "removed-from-game"
  );
}

function trashHostedCard(state: GameState, id: string): void {
  const card = state.cards[id];
  if (!card) return;
  const host = card.hostId ? state.cards[card.hostId] : undefined;
  if (host?.hostedCardIds) {
    host.hostedCardIds = host.hostedCardIds.filter((hostedId) => hostedId !== id);
  }
  card.hostId = undefined;
  removeCardFromCurrentZone(state, id);
  if (card.side === "runner") {
    card.zone = "runner:heap";
    card.faceup = true;
    state.runner.discard.push(id);
  } else {
    card.zone = "corp:archives";
    card.faceup = false;
    state.corp.discard.push(id);
  }
  card.rezzed = false;
  state.log.push(
    `${card.title} trashed (CR ${CR.checkpointHostedOnUninstalled.number}).`,
  );
}

function hostedOnForbiddenHost(state: GameState): string[] {
  const ids: string[] = [];
  for (const card of Object.values(state.cards)) {
    if (!card.hostId) continue;
    const host = state.cards[card.hostId];
    if (host?.cannotHostCards) ids.push(card.id);
  }
  return ids;
}

function remoteCountExceedsActiveLimit(state: GameState): boolean {
  const remotes = Object.values(state.servers).filter(
    (server) => server.kind === "remote",
  ).length;
  let limit: number | undefined;
  for (const card of activeCardsInOrder(state)) {
    if (card.maxRemoteServers === undefined) continue;
    limit =
      limit === undefined
        ? card.maxRemoteServers
        : Math.min(limit, card.maxRemoteServers);
  }
  return limit !== undefined && remotes > limit;
}

function markOlderCopies(cards: CardInstance[], trashIds: Set<string>): void {
  if (cards.length < 2) return;
  for (const card of cards.slice(0, -1)) trashIds.add(card.id);
}

function isInstalled(state: GameState, card: CardInstance): boolean {
  if (state.runner.rig.includes(card.id)) return true;
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
  for (const id of state.corp.score) add(id);
  for (const id of state.runner.score) add(id);
  for (const id of state.runner.rig) add(id);
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
 * The run's initiation phase has finished and the run has continued
 * (CR 10.3.6 / 9.2.2b / 6.1.1 / 6.3). The run is still open.
 */
export function checkpointAfterInitiationPhase(state: GameState): void {
  occurCheckpoint(
    state,
    "timing",
    "Outside the initiation phase",
    [
      CR.checkpointAfterTimingStructure,
      CR.runTimingStructure,
      CR.runPhases,
      CR.initiationPhase,
    ],
    state.timingKey,
  );
}

/**
 * The run's Approach Ice phase has finished and the run has continued
 * (CR 10.3.6 / 9.2.2b / 6.1.1 / 6.4). The run is still open.
 */
export function checkpointAfterApproachIcePhase(state: GameState): void {
  occurCheckpoint(
    state,
    "timing",
    "Outside the approach ice phase",
    [
      CR.checkpointAfterTimingStructure,
      CR.runTimingStructure,
      CR.runPhases,
      CR.approachIcePhase,
    ],
    state.timingKey,
  );
}

/**
 * The run's Encounter Ice phase has finished and the run has moved on
 * (CR 10.3.6 / 9.2.2b / 6.1.1 / 6.5). The run is still open.
 * The engine completes that phase on the 11.4_3_c branch to movement
 * (CR 6.9.3c / 6.9.3e).
 */
export function checkpointAfterEncounterPhase(state: GameState): void {
  occurCheckpoint(
    state,
    "timing",
    "Outside the encounter phase",
    [
      CR.checkpointAfterTimingStructure,
      CR.runTimingStructure,
      CR.runPhases,
      CR.encounterIcePhase,
    ],
    state.timingKey,
  );
}

/**
 * The run's Movement phase has finished and the success step has begun
 * (CR 10.3.6 / 9.2.2b / 6.1.1 / 6.6). The run is still open.
 * The engine completes that phase when appendix 11.4_4_g continues to
 * 11.4_5_a (CR 6.9.4g / 6.9.4h).
 */
export function checkpointAfterMovementPhase(state: GameState): void {
  occurCheckpoint(
    state,
    "timing",
    "Outside the movement phase",
    [
      CR.checkpointAfterTimingStructure,
      CR.runTimingStructure,
      CR.runPhases,
      CR.movementPhase,
    ],
    state.timingKey,
  );
}

/**
 * The run's Success phase has finished and Run Ends has begun
 * (CR 10.3.6 / 9.2.2b / 6.1.1 / 6.7). The run is still open.
 * The engine completes that phase when the breach's last step continues
 * to appendix 11.4_6_a (CR 6.9.5c).
 */
export function checkpointAfterSuccessPhase(state: GameState): void {
  occurCheckpoint(
    state,
    "timing",
    "Outside the success phase",
    [
      CR.checkpointAfterTimingStructure,
      CR.runTimingStructure,
      CR.runPhases,
      CR.successPhase,
    ],
    state.timingKey,
  );
}

/**
 * The Corp's draw phase has finished and the action window has begun
 * (CR 10.3.6 / 9.2.2a / 5.1.2). The Corp's turn is still open.
 */
export function checkpointAfterDrawPhase(state: GameState): void {
  occurCheckpoint(
    state,
    "timing",
    "Outside the draw phase",
    [CR.checkpointAfterTimingStructure, CR.turnTimingStructure, CR.corpTurnPhases],
    state.timingKey,
  );
}

/**
 * The Runner's action phase has finished and the discard step has begun
 * (CR 10.3.6 / 9.2.2a / 5.1.3). The Runner's turn is still open.
 */
export function checkpointAfterRunnerActionPhase(state: GameState): void {
  occurCheckpoint(
    state,
    "timing",
    "Outside the Runner's action phase",
    [CR.checkpointAfterTimingStructure, CR.turnTimingStructure, CR.runnerTurnPhases],
    state.timingKey,
  );
}

/**
 * The Corp's action phase has finished and the discard step has begun
 * (CR 10.3.6 / 9.2.2a / 5.1.2). The Corp's turn is still open.
 */
export function checkpointAfterActionPhase(state: GameState): void {
  occurCheckpoint(
    state,
    "timing",
    "Outside the action phase",
    [CR.checkpointAfterTimingStructure, CR.turnTimingStructure, CR.corpTurnPhases],
    state.timingKey,
  );
}

/**
 * The Runner's discard phase has finished (CR 10.3.6 / 9.2.2a / 5.1.3 / 5.5).
 * That same step completes the Runner's turn (CR 5.7.2e). The checkpoint is
 * on the Corp's turn, before the checkpoint outside the Runner's turn.
 */
export function checkpointAfterRunnerDiscardPhase(state: GameState): void {
  occurCheckpoint(
    state,
    "timing",
    "Outside the Runner's discard phase",
    [
      CR.checkpointAfterTimingStructure,
      CR.turnTimingStructure,
      CR.runnerTurnPhases,
      CR.discardPhase,
    ],
    state.timing.structure,
  );
}

/**
 * The Runner's last step has finished and the Corp's turn has begun (CR 10.3.6 / 9.2.2a).
 * Call this only once that turn is over and the timing structure is the Corp's turn.
 */
export function checkpointAfterRunnerTurn(state: GameState): void {
  occurCheckpoint(
    state,
    "timing",
    "Outside the Runner's turn",
    [CR.checkpointAfterTimingStructure, CR.turnTimingStructure],
    state.timing.structure,
  );
}

/**
 * The Corp's discard phase has finished (CR 10.3.6 / 9.2.2a / 5.1.2 / 5.5).
 * That same step completes the Corp's turn (CR 5.6.3e). The checkpoint is
 * on the Runner's turn, before the checkpoint outside the Corp's turn.
 */
export function checkpointAfterCorpDiscardPhase(state: GameState): void {
  occurCheckpoint(
    state,
    "timing",
    "Outside the discard phase",
    [
      CR.checkpointAfterTimingStructure,
      CR.turnTimingStructure,
      CR.corpTurnPhases,
      CR.discardPhase,
    ],
    state.timing.structure,
  );
}

/**
 * The Corp's last step has finished and the Runner's turn has begun (CR 10.3.6 / 9.2.2a).
 * Call this only once that turn is over and the timing structure is the Runner's turn.
 */
export function checkpointAfterCorpTurn(state: GameState): void {
  occurCheckpoint(
    state,
    "timing",
    "Outside the Corp's turn",
    [CR.checkpointAfterTimingStructure, CR.turnTimingStructure],
    state.timing.structure,
  );
}

/**
 * The access's last step has finished and the breach has resumed (CR 10.3.6 / 9.2.2d).
 * Call this only once that access is over and the timing structure is the breach again.
 */
export function checkpointAfterAccess(state: GameState): void {
  occurCheckpoint(
    state,
    "timing",
    "Outside the access",
    [CR.checkpointAfterTimingStructure, CR.accessTimingStructure],
    state.timing.structure,
  );
}

/**
 * The breach's last step has finished and the run has resumed (CR 10.3.6 / 9.2.2c).
 * Call this only once the breach is over and the timing structure is the run again.
 */
export function checkpointAfterBreach(state: GameState): void {
  occurCheckpoint(
    state,
    "timing",
    "Outside the breach",
    [CR.checkpointAfterTimingStructure, CR.breachTimingStructure],
    state.timing.structure,
  );
}

/**
 * The Run Ends phase has finished (CR 10.3.6 / 9.2.2b / 6.1.1 / 6.8).
 * That same step completes the run (CR 6.9.6d). The checkpoint is on the
 * turn the run returned to, before the checkpoint outside the run.
 */
export function checkpointAfterRunEndsPhase(state: GameState): void {
  occurCheckpoint(
    state,
    "timing",
    "Outside the Run Ends phase",
    [
      CR.checkpointAfterTimingStructure,
      CR.runTimingStructure,
      CR.runPhases,
      CR.runEndsPhase,
    ],
    state.timing.structure,
  );
}

/**
 * The run's last step has finished and the turn has resumed (CR 10.3.6 / 9.2.2b).
 * Call this only once the run is over and the timing structure is no longer the run.
 */
export function checkpointAfterRun(state: GameState): void {
  occurCheckpoint(
    state,
    "timing",
    "Outside the run",
    [CR.checkpointAfterTimingStructure, CR.runTimingStructure],
    state.timing.structure,
  );
}

/**
 * A finished timing-structure step is one instruction (CR 9.11.2).
 * The checkpoint occurs immediately, before the next instruction is imminent (CR 10.3.5).
 */
export function checkpointAfterInstruction(state: GameState, openedBy: string): void {
  occurCheckpoint(
    state,
    "instruction",
    "Instruction finished",
    [CR.checkpointAfterInstruction, CR.timingStepIsInstruction],
    openedBy,
  );
}

/** Pay a cost, then run the checkpoint that must follow it (CR 1.16.3 / 10.3.4 / 9.11.1a). */
export function withCostCheckpoint(
  state: GameState,
  openedBy: string,
  pay: () => void,
): void {
  pay();
  state.log.push(`Cost paid (${openedBy}) (CR ${CR.costCheckpoint.number}).`);
  occurCheckpoint(
    state,
    "cost",
    "Cost checkpoint",
    [CR.costCheckpoint, CR.costAfterPay, CR.costPaidCheckpoint],
    openedBy,
  );
}

/** @deprecated Prefer legality/priority.ts — kept for export stability. */
export { closePriorityWindow } from "./priority.js";

export function addRestriction(
  state: GameState,
  forbid: ForbiddenAction,
  cite: RuleCite,
  source: string,
): void {
  state.restrictions.push({ forbid, cite, source });
  state.log.push(
    `Cannot ${forbid} (CR ${cite.number} / ${CR.cannotPrecedence.number}) from ${source}`,
  );
}

export function clearRestrictionsFrom(state: GameState, source: string): void {
  state.restrictions = state.restrictions.filter((r) => r.source !== source);
}

export function findRestriction(
  state: GameState,
  forbid: ForbiddenAction,
): Restriction | undefined {
  return state.restrictions.find((r) => r.forbid === forbid);
}

export function isForbidden(
  state: GameState,
  forbid: ForbiddenAction,
): Restriction | undefined {
  if (forbid === "jack_out" && state.run?.cannotJackOut) {
    return (
      findRestriction(state, "jack_out") ?? {
        forbid: "jack_out",
        cite: CR.cannotPrecedence,
        source: "run.cannotJackOut",
      }
    );
  }
  return findRestriction(state, forbid);
}
