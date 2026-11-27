import type {
  CheckpointFrame,
  CheckpointKind,
} from "../state/types/checkpoints.js";
import type {
  ForbiddenAction,
  Restriction,
  RuleCite,
} from "../state/types/restrictions.js";
import type { GameState } from "../state/types/game.js";
import { CR } from "../timing/labels.js";
import { abilitiesSuppressed } from "../state/continuous/abilities.js";
import {
  commitCheckpointSnapshot,
  diffAgainstPreviousCheckpoint,
  type CheckpointDiff,
} from "../state/triggers/checkpointSnapshot.js";
import {
  evaluateTriggerPredicate,
  PREDICATE_EXPOSED_SINCE_PREVIOUS,
} from "../state/triggers/triggerPredicates.js";
import {
  cancelPendingIfSourceInactive,
  completePendingAbility,
  createPendingAbilityInstance,
  markPendingAbilityResolving,
  openReactionWindow,
  closeReactionWindow,
  pendingAbilitiesWithStatus,
  pruneSettledPendingAbilities,
} from "../state/triggers/pendingAbilities.js";
import { resolvePendingInWindowOrder } from "../state/triggers/storedTriggers.js";
import { markStaticHostTrashConditions } from "../effects/hostingAndTrash/corpTrash.js";
import { nextId } from "../state/ids.js";
import { offerRamanRaiSwapWhileSetAside } from "../effects/swap/swapKinds.js";
import {
  removeExpiredDurationAbilities,
  checkAgendaPointWin,
  checkUniqueness,
  checkCardRestrictions,
  checkHostedOnAgenda,
  checkHostedOnUninstalled,
  checkRemoteServers,
  checkVacantPositions,
  checkCardsEnteringRootDuringBreach,
  checkDiscardPileCards,
  checkDiscardPileCounters,
  noteRootEntriesFromZoneDiff,
  applyRestrictionPlan,
  offerRootEntry,
} from "./checkpointRules.js";
import {
  markDrawConditionals,
  markSwapInstallFromZoneDiff,
  markUnsuccessfulRunServer,
  markAccessAbility,
  markCorpActionPhaseEnd,
  markRunnerActionPhaseEnd,
  markEncounterAbility,
  markOutsidePoolSpend,
  markBeforeFirstTurn,
  markIceRezAbility,
  markInlineConditional,
  markStoredConditionalNote,
  markCorpTurnEnd,
  markScoreTurnEnd,
  markRunnerTurnEnd,
  markCorpTurnBegin,
  markRunnerTurnBegin,
} from "./checkpointHookMarks.js";
import {
  markBuiltToLastFromCheckpointDiff,
  markHadNoTagsFromCheckpointDiff,
  markFirstRemoteInstallNormal,
  markSeidrFirstClickDuringRun,
  markFirstBadPublicityTake,
  markEachCorpBadPublicityTake,
  markFirstEventTrashed,
  markMirrormorphThirdDistinct,
  markFirstCorpCardInstall,
  markFirstCorpRootInstall,
  markFirstAgendaScoredOrStolen,
  markFirstRunnerStoleOrTrashed,
  markFirstCorpCardTrash,
  markFirstProgramOrHardwareTrash,
  markFirstAccessTrash,
  markFirstTrashMatchingRunnerIdFaction,
  markCorpFlippedFirstOperationPlay,
  markFirstGripOrStackTrashBatch,
  markFirstInstalledTrash,
  markFirstTagThisTurn,
  markFirstRevealThisTurn,
  markFirstCreditPoolEmpty,
  markValRunnerTriggers,
  markFirstHardwareInstall,
  markFirstProgramInstall,
  markFirstVirusInstall,
  markValSuccessfulRunTriggers,
  markFirstRunBegin,
  markFirstRdRunBegin,
  markFirstArchivesRunBegin,
  markDaredevilFirstRun,
  markSisyphusFirstPass,
  markFirstUnsuccessfulRun,
} from "./checkpointFirstEachTurnMarks.js";
import {
  markFirstSuccessfulMarkRun,
  markFirstSuccessfulHqRun,
  markFirstSuccessfulHqOrRdRun,
  markFirstSuccessfulCentralRun,
  markFirstEncounterEachRun,
  markFirstPassIce,
  markPassUnrezzedIce,
  markPassRezzedIce,
  markIceOnPass,
  markPassHost,
  markPassRezzedIceProtectingServer,
  markEncounterEnd,
  markEncounterEndRezzedThisTurn,
  markEncounterEndNotFullyBroken,
  markEncounterEndPrintedSubroutineBroken,
  markHostEncounter,
  markEncounterRezzedAfterApproach,
  markApproachServer,
  markPassAllIceProtectingServer,
  markBypass,
  markApproachIce,
  markFirstSuccessfulRdRunEnd,
  markSuccessfulRunOnRd,
  markSuccessfulRunEndOnce,
  markSuccessfulRunEnd,
  markOtherServerSuccess,
  markSuccessfulRun,
  markSuccessfulRunServer,
  markRunBegin,
} from "./checkpointRunMarks.js";

export function pushCheckpoint(
  state: GameState,
  kind: CheckpointKind,
  label: string,
  cites: RuleCite[],
  openedBy: string,
): CheckpointFrame {
  const frame: CheckpointFrame = {
    id: nextId(state, "cp"),
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

export function popCheckpoint(
  state: GameState,
  expectedId?: string,
): CheckpointFrame | null {
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
 * CR 10.3.2 opens a reaction window when conditional abilities were marked
 * pending; otherwise the reaction window stays closed.
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
  // Baseline for the *next* checkpoint's "had" comparison (CR 9.6.6a).
  commitCheckpointSnapshot(state, frame.id);
  removeExpiredDurationAbilities(state);
  checkAgendaPointWin(state);
  checkUniqueness(state);
  if (checkCardRestrictions(state)) {
    state.turn.pausedCheckpointId = frame.id;
    return;
  }
  finishCheckpointAfterRestrictions(state, frame.id);
}

/** CR 10.3.1f through CR 10.3.1l, then the frame closes. */
function finishCheckpointAfterRestrictions(
  state: GameState,
  frameId: string,
): void {
  checkHostedOnAgenda(state);
  checkHostedOnUninstalled(state);
  checkRemoteServers(state);
  checkVacantPositions(state);
  checkCardsEnteringRootDuringBreach(state);
  checkDiscardPileCards(state);
  checkDiscardPileCounters(state);
  const closed = popCheckpoint(state, frameId);
  closeCheckpointReactionWindow(state, closed?.kind);
  // A card this checkpoint trashed has a "when trashed" ability. It is
  // marked pending by the next checkpoint (CR 10.3.1a), which is run now
  // so the ability does not wait for some later event.
  if (state.turn.checkpointTrashNoted) {
    state.turn.checkpointTrashNoted = undefined;
    if (
      !state.done &&
      !state.pendingChoice &&
      !state.trace &&
      !state.psi &&
      ((state.turn.storedConditionalPending ?? []).length > 0 ||
        (state.turn.inlineConditionalPending ?? []).length > 0)
    ) {
      occurCheckpoint(
        state,
        closed?.kind ?? "instruction",
        "After a checkpoint trashed a card",
        [CR.checkpointConditionalAbilities],
        "checkpoint",
      );
    }
  }
}

/**
 * Exposes since the previous checkpoint become one Blackguard instance each
 * (CR 9.6.4b) via the exposed_since_previous predicate. An open expose-up-to
 * instruction defers the checkpoint until that instruction finishes.
 */
function settleBlackguardExposes(state: GameState, diff: CheckpointDiff): void {
  if (state.turn.deferBlackguardCheckpoint) return;
  const match = evaluateTriggerPredicate(
    state,
    diff,
    PREDICATE_EXPOSED_SINCE_PREVIOUS,
  );
  if (match.kind !== "exposed_since_previous" || match.cardIds.length === 0) {
    return;
  }
  const exposed = match.cardIds;
  const guardId = state.runner.installed.find(
    (id) =>
      state.cards[id]?.blackguardForceRezOnExpose &&
      !abilitiesSuppressed(state, id),
  );
  if (!guardId) return;
  const title = state.cards[guardId]?.title ?? "Blackguard";
  for (const targetId of exposed) {
    createPendingAbilityInstance(state, {
      abilityKey: "blackguard:force-rez-on-expose",
      sourceId: guardId,
      controller: "runner",
      mandatory: true,
      payload: { kind: "blackguard_force_rez", targetId },
    });
  }
  state.log.push(
    `${title} — ${exposed.length} instances become pending (CR ${CR.conditionMetMultipleTimes.number}).`,
  );
}

function resolveBlackguardPendingInstance(
  state: GameState,
  targetId: string,
  title: string,
): void {
  const card = state.cards[targetId];
  if (!card || card.rezzed) {
    state.log.push(`${title} — ${card?.title ?? targetId} is already rezzed.`);
    return;
  }
  const cost = card.rezCost ?? card.installCost ?? 0;
  if (cost < 0 || state.corp.credits < cost) {
    state.log.push(`${title} — Corp cannot rez ${card.title} (need ${cost}¢).`);
    return;
  }
  state.corp.credits -= cost;
  card.rezzed = true;
  card.faceup = true;
  state.log.push(
    `${title} — Corp must rez ${card.title} for ${cost}¢ (CR ${CR.conditionMetMultipleTimes.number}).`,
  );
}

/**
 * CR 10.3.1a. Each active conditional looks at changes since the previous
 * checkpoint (CR 9.6.6). Blackguard, swap-install (CR 8.8.4b), on-draw
 * set-aside (CR 8.4.5a), Built to Last / Sebastião "had" (CR 9.6.6a),
 * breached-root entries (CR 10.3.1j), Seidr first-click-during-run,
 * first/each bad-publicity take, first-event-trashed, and MirrorMorph
 * third-distinct are marked here. Only instances created here count as
 * newly marked for the CR 10.3.2 reaction window.
 */
function markConditionalAbilities(state: GameState): void {
  const before = new Set(
    pendingAbilitiesWithStatus(state, "pending").map((p) => p.id),
  );
  const diff = diffAgainstPreviousCheckpoint(state);
  settleBlackguardExposes(state, diff);
  markDrawConditionals(state, diff);
  noteRootEntriesFromZoneDiff(state, diff);
  markBuiltToLastFromCheckpointDiff(state, diff);
  markHadNoTagsFromCheckpointDiff(state, diff);
  markSwapInstallFromZoneDiff(state, diff);
  markFirstRemoteInstallNormal(state, diff);
  markSeidrFirstClickDuringRun(state, diff);
  markFirstBadPublicityTake(state, diff);
  markEachCorpBadPublicityTake(state, diff);
  markFirstEventTrashed(state, diff);
  markMirrormorphThirdDistinct(state, diff);
  markFirstCorpCardInstall(state, diff);
  markFirstCorpRootInstall(state, diff);
  markFirstAgendaScoredOrStolen(state, diff);
  markFirstRunnerStoleOrTrashed(state, diff);
  markFirstCorpCardTrash(state, diff);
  markFirstProgramOrHardwareTrash(state, diff);
  markFirstAccessTrash(state, diff);
  markFirstTrashMatchingRunnerIdFaction(state, diff);
  markCorpFlippedFirstOperationPlay(state, diff);
  markFirstGripOrStackTrashBatch(state, diff);
  markFirstInstalledTrash(state, diff);
  markFirstTagThisTurn(state, diff);
  markFirstRevealThisTurn(state, diff);
  markFirstCreditPoolEmpty(state, diff);
  markValRunnerTriggers(state, diff, "damage");
  markValRunnerTriggers(state, diff, "install");
  markValRunnerTriggers(state, diff, "click_loss");
  markValRunnerTriggers(state, diff, "basic_click_draw");
  markFirstHardwareInstall(state, diff);
  markFirstProgramInstall(state, diff);
  markFirstVirusInstall(state, diff);
  markValSuccessfulRunTriggers(state, diff);
  markFirstSuccessfulMarkRun(state, diff);
  markFirstSuccessfulHqRun(state, diff);
  markFirstSuccessfulHqOrRdRun(state, diff);
  markFirstSuccessfulCentralRun(state, diff);
  markFirstRunBegin(state, diff);
  markFirstRdRunBegin(state, diff);
  markFirstArchivesRunBegin(state, diff);
  markDaredevilFirstRun(state, diff);
  markFirstEncounterEachRun(state, diff);
  markFirstPassIce(state, diff);
  markSisyphusFirstPass(state, diff);
  markPassUnrezzedIce(state, diff);
  markPassRezzedIce(state, diff);
  markIceOnPass(state, diff);
  markPassHost(state, diff);
  markPassRezzedIceProtectingServer(state, diff);
  markEncounterEnd(state, diff);
  markEncounterEndRezzedThisTurn(state, diff);
  markEncounterEndNotFullyBroken(state, diff);
  markEncounterEndPrintedSubroutineBroken(state, diff);
  markHostEncounter(state, diff);
  markEncounterRezzedAfterApproach(state, diff);
  markApproachServer(state, diff);
  markPassAllIceProtectingServer(state, diff);
  markBypass(state, diff);
  markApproachIce(state, diff);
  markFirstSuccessfulRdRunEnd(state, diff);
  markSuccessfulRunOnRd(state, diff);
  markSuccessfulRunEndOnce(state, diff);
  markSuccessfulRunEnd(state, diff);
  markOtherServerSuccess(state, diff);
  markSuccessfulRun(state, diff);
  markSuccessfulRunServer(state, diff);
  markUnsuccessfulRunServer(state, diff);
  markAccessAbility(state, diff);
  markCorpActionPhaseEnd(state, diff);
  markRunnerActionPhaseEnd(state, diff);
  markEncounterAbility(state, diff);
  markOutsidePoolSpend(state, diff);
  markBeforeFirstTurn(state, diff);
  markIceRezAbility(state, diff);
  markInlineConditional(state, diff);
  markStoredConditionalNote(state, diff);
  markRunBegin(state, diff);
  markCorpTurnEnd(state, diff);
  markScoreTurnEnd(state, diff);
  markRunnerTurnEnd(state, diff);
  markCorpTurnBegin(state, diff);
  markRunnerTurnBegin(state, diff);
  markFirstUnsuccessfulRun(state, diff);
  markStaticHostTrashConditions(state);
  const newlyMarked = pendingAbilitiesWithStatus(state, "pending")
    .filter((p) => !before.has(p.id))
    .map((p) => p.id);
  state.turn.checkpointNewlyMarkedPendingIds =
    newlyMarked.length > 0 ? newlyMarked : undefined;
  if (newlyMarked.length === 0) {
    state.log.push(
      `Conditional abilities checked (CR ${CR.checkpointConditionalAbilities.number}); none marked pending.`,
    );
  } else {
    state.log.push(
      `Conditional abilities checked (CR ${CR.checkpointConditionalAbilities.number}); ${newlyMarked.length} marked pending (CR ${CR.pendingInstances.number}).`,
    );
  }
}

/**
 * CR 10.3.2. A reaction window opens after the checkpoint when conditional
 * abilities were marked pending at that checkpoint. Resolves that fixed set
 * (CR 9.2.8a), then closes. Leftover pending from earlier windows stay on
 * the bag until their own window (e.g. Amaze at run.ends).
 */
function closeCheckpointReactionWindow(
  state: GameState,
  checkpointKind?: CheckpointKind,
): void {
  // Blanked / left-play sources lose pending before the window opens (CR 9.6.10).
  cancelPendingIfSourceInactive(state);
  const newlyMarkedIds = state.turn.checkpointNewlyMarkedPendingIds ?? [];
  state.turn.checkpointNewlyMarkedPendingIds = undefined;
  const pending = newlyMarkedIds
    .map((id) => state.pendingAbilities.find((p) => p.id === id))
    .filter(
      (p): p is NonNullable<typeof p> => Boolean(p) && p!.status === "pending",
    );
  if (pending.length === 0) {
    state.log.push(
      `Reaction window checked (CR ${CR.checkpointReaction.number}); none marked pending, so it stays closed.`,
    );
    return;
  }

  const notes: string[] = [];
  const swapPending = pending.find(
    (p) => p.payload?.kind === "swap_install_trigger",
  );
  if (swapPending) {
    const title =
      state.cards[swapPending.sourceId]?.title ??
      state.cards[state.corp.identityId]?.title ??
      "A conditional ability";
    notes.push(`${title} is pending`);
  }
  const blackguardCount = pending.filter(
    (p) => p.payload?.kind === "blackguard_force_rez",
  ).length;
  if (blackguardCount > 0) {
    notes.push(`Blackguard has ${blackguardCount} instances pending`);
  }
  state.log.push(
    notes.length > 0
      ? `Reaction window (CR ${CR.checkpointReaction.number}); ${notes.join("; ")}.`
      : `Reaction window (CR ${CR.checkpointReaction.number}).`,
  );

  const frame = openReactionWindow(
    state,
    pending.map((p) => p.id),
    state.previousCheckpointSnapshot?.checkpointId ?? null,
  );

  const guardId = state.runner.installed.find(
    (id) => state.cards[id]?.blackguardForceRezOnExpose,
  );
  const title = guardId
    ? (state.cards[guardId]?.title ?? "Blackguard")
    : "Blackguard";

  // Card-effect conditionals in this window resolve in player order
  // (CR 9.2.8b / 9.2.8d). Play abilities marked at 8.6.7e wait for 8.6.7f.
  const orderedIds = pending
    .filter(
      (p) =>
        (p.payload?.kind === "inline_conditional" ||
          p.payload?.kind === "stored_conditional") &&
        !(checkpointKind === "play" && p.abilityKey === "on-play"),
    )
    .map((p) => p.id);

  for (const inst of pending) {
    // swap_install_trigger stays pending for eval.ts to consume after the
    // checkpoint returns (CR 8.8.4b).
    if (inst.payload?.kind === "swap_install_trigger") {
      continue;
    }
    // Amaze across a Doppelgänger follow-up run resolves at run.ends
    // (CR 9.12.5d), not in an intervening priority-window reaction.
    if (inst.payload?.kind === "amaze_give_tags") {
      continue;
    }
    // Effect-bearing conditionals marked at 10.3.1a (Built to Last, etc.).
    // Play abilities mark at 8.6.7e but resolve at 8.6.7f after this window.
    if (
      checkpointKind === "play" &&
      inst.payload?.kind === "stored_conditional" &&
      inst.abilityKey === "on-play"
    ) {
      continue;
    }
    if (
      inst.payload?.kind === "inline_conditional" ||
      inst.payload?.kind === "stored_conditional"
    ) {
      // An earlier pass may already have resolved this one out of mark order.
      if (inst.status !== "pending") continue;
      if (resolvePendingInWindowOrder(state, orderedIds)) {
        break;
      }
      continue;
    }
    if (inst.payload?.kind === "may_raman_swap") {
      if (state.pendingChoice) {
        completePendingAbility(state, inst.id, "cancelled");
        continue;
      }
      markPendingAbilityResolving(state, inst.id);
      offerRamanRaiSwapWhileSetAside(state, inst.payload.cardIds);
      completePendingAbility(state, inst.id, "done");
      continue;
    }
    markPendingAbilityResolving(state, inst.id);
    if (inst.payload?.kind === "blackguard_force_rez") {
      resolveBlackguardPendingInstance(state, inst.payload.targetId, title);
    }
    if (inst.payload?.kind === "reveal_drawn_card") {
      const drawn = state.cards[inst.payload.cardId];
      const source = state.cards[inst.sourceId];
      state.log.push(
        `${source?.title ?? "Find the Truth"} — reveal drawn card: ${drawn?.title ?? inst.payload.cardId}.`,
      );
    }
    if (inst.payload?.kind === "trash_random_from_grip") {
      // Search path resolves these mid-instruction; leave a safe no-op here.
    }
    completePendingAbility(state, inst.id, "done");
  }

  closeReactionWindow(state, frame.id);
  pruneSettledPendingAbilities(state);
}

/** The chosen set is trashed, then the checkpoint continues at CR 10.3.1f. */
export function resolveRestrictionChoice(
  state: GameState,
  optionId: string,
): void {
  const body = optionId.slice("restrict:".length);
  const bar = body.indexOf("|");
  const mem = bar === -1 ? body : body.slice(0, bar);
  const keepPart = bar === -1 ? "*" : body.slice(bar + 1);
  applyRestrictionPlan(state, {
    programs: mem ? mem.split(",") : [],
    keep: keepPart === "*" ? null : keepPart ? keepPart.split(",") : [],
  });
  const frameId = state.turn.pausedCheckpointId;
  state.turn.pausedCheckpointId = undefined;
  if (frameId) finishCheckpointAfterRestrictions(state, frameId);
}

export function declareRootEntry(
  state: GameState,
  decision: "yes" | "no",
  cardId: string,
): void {
  const run = state.run;
  const cite = CR.checkpointCardEnteringRoot.number;
  if (decision === "yes" && run && !run.accessCandidates.includes(cardId)) {
    run.accessCandidates.push(cardId);
    state.log.push(
      `The Runner adds the card that entered the root as a candidate for access (CR ${cite}).`,
    );
  } else {
    state.log.push(
      `The Runner does not add the card that entered the root as a candidate for access (CR ${cite}).`,
    );
  }
  const rest = run?.pendingRootEntryIds ?? [];
  if (run) run.pendingRootEntryIds = undefined;
  if (rest.length > 0) offerRootEntry(state, rest);
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
    [
      CR.checkpointAfterTimingStructure,
      CR.turnTimingStructure,
      CR.corpTurnPhases,
    ],
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
    [
      CR.checkpointAfterTimingStructure,
      CR.turnTimingStructure,
      CR.runnerTurnPhases,
    ],
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
    [
      CR.checkpointAfterTimingStructure,
      CR.turnTimingStructure,
      CR.corpTurnPhases,
    ],
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
export function checkpointAfterInstruction(
  state: GameState,
  openedBy: string,
): void {
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

function findRestriction(
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
