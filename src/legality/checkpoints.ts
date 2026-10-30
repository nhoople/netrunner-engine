import type {
  CardInstance,
  CheckpointFrame,
  CheckpointKind,
  ForbiddenAction,
  GameState,
  Restriction,
  RuleCite,
  ServerId,
  Side,
} from "../state/types.js";
import { memoryLimit, programMemoryCosts, usedMemory } from "../state/turn.js";
import { CR } from "../timing/labels.js";
import { abilitiesSuppressed } from "../state/abilities.js";
import {
  agendaPointsFor,
  checkWinConditions,
  removeCardFromCurrentZone,
} from "../state/scoring.js";
import { trashDurationPassedCurrents } from "../state/currents.js";
import { removeRevertedHostDurations } from "../state/hostDuration.js";
import { getCardDef } from "../cards/load.js";
import {
  commitCheckpointSnapshot,
  diffAgainstPreviousCheckpoint,
  type CheckpointDiff,
} from "../state/checkpointSnapshot.js";
import {
  evaluateTriggerPredicate,
  PREDICATE_ADVANCEMENT_FROM_ZERO,
  PREDICATE_ENTERED_BREACHED_ROOT,
  PREDICATE_ENTERED_DRAW_SET_ASIDE,
  PREDICATE_ENTERED_REMOTE_INSTALL,
  PREDICATE_EXPOSED_SINCE_PREVIOUS,
  PREDICATE_RUNNER_TAGS_FROM_ZERO,
  PREDICATE_SEIDR_FIRST_CLICK_DURING_RUN,
  PREDICATE_FIRST_BAD_PUBLICITY_TAKE,
  PREDICATE_EACH_CORP_BAD_PUBLICITY_TAKE,
  PREDICATE_FIRST_EVENT_TRASHED,
  PREDICATE_MIRRORMORPH_THIRD_DISTINCT,
  PREDICATE_FIRST_CORP_CARD_INSTALL,
  PREDICATE_FIRST_CORP_ROOT_INSTALL,
  PREDICATE_FIRST_REMOTE_INSTALL_NORMAL,
  PREDICATE_FIRST_AGENDA_SCORED_OR_STOLEN,
  PREDICATE_FIRST_RUNNER_STOLE_OR_TRASHED,
  PREDICATE_FIRST_CORP_CARD_TRASH,
  PREDICATE_FIRST_PROGRAM_OR_HARDWARE_TRASH,
  PREDICATE_FIRST_ACCESS_TRASH,
  PREDICATE_FIRST_TRASH_MATCHING_RUNNER_ID_FACTION,
  PREDICATE_CORP_FLIPPED_FIRST_OPERATION_PLAY,
  PREDICATE_FIRST_GRIP_OR_STACK_TRASH_BATCH,
  PREDICATE_FIRST_INSTALLED_TRASH,
  PREDICATE_FIRST_TAG_THIS_TURN,
} from "../state/triggerPredicates.js";
import {
  cancelPendingIfSourceInactive,
  completePendingAbility,
  createPendingAbilityInstance,
  markPendingAbilityResolving,
  openReactionWindow,
  closeReactionWindow,
  pendingAbilitiesWithStatus,
  pruneSettledPendingAbilities,
} from "../state/pendingAbilities.js";
import { resolveStoredOrInlineConditionalInstance } from "../state/storedTriggers.js";
import {
  expireLingeringEffects,
  LINGERING_KIND_ABILITY_BLANK,
  LINGERING_KIND_BREAKER_STRENGTH,
  LINGERING_KIND_BREAKER_STRENGTH_CHECKPOINT,
  LINGERING_KIND_BREAKER_STRENGTH_ENCOUNTER,
  LINGERING_KIND_BREAKER_STRENGTH_RUN,
  LINGERING_KIND_GRANTED_SUBTYPES,
  LINGERING_KIND_ICE_STRENGTH,
  LINGERING_KIND_ICE_STRENGTH_ENCOUNTER,
  LINGERING_KIND_MARK,
  LINGERING_KIND_RUNNER_MU,
} from "../state/lingeringEffects.js";
import { applyMumbadDagPrimitive } from "../effects/mumbadDagPrimitives.js";
import {
  offerRamanRaiSwapWhileSetAside,
  ramanRaiCanOfferSwap,
} from "../effects/mumbadSiPrimitives.js";
import type { PendingAbilityPayload } from "../state/types.js";
import { runnerAbilityCarrierIds } from "../state/fenris.js";

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
function finishCheckpointAfterRestrictions(state: GameState, frameId: string): void {
  checkHostedOnAgenda(state);
  checkHostedOnUninstalled(state);
  checkRemoteServers(state);
  checkVacantPositions(state);
  checkCardsEnteringRootDuringBreach(state);
  checkDiscardPileCards(state);
  checkDiscardPileCounters(state);
  popCheckpoint(state, frameId);
  closeCheckpointReactionWindow(state);
}

/**
 * Exposes since the previous checkpoint become one Blackguard instance each
 * (CR 9.6.4b) via the exposed_since_previous predicate. An open expose-up-to
 * instruction defers the checkpoint until that instruction finishes.
 */
function settleBlackguardExposes(
  state: GameState,
  diff: CheckpointDiff,
): void {
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
    state.log.push(
      `${title} — Corp cannot rez ${card.title} (need ${cost}¢).`,
    );
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
 * On-draw conditionals meet while cards are still set aside (CR 8.4.5a) via
 * the entered_draw_set_aside predicate. Mark one pending instance per
 * matching drawn card (CR 9.6.2 / 9.6.4).
 */
function markDrawConditionals(state: GameState, diff: CheckpointDiff): void {
  const match = evaluateTriggerPredicate(
    state,
    diff,
    PREDICATE_ENTERED_DRAW_SET_ASIDE,
  );
  if (
    match.kind !== "entered_draw_set_aside" ||
    match.side === null ||
    match.cardIds.length === 0
  ) {
    return;
  }
  const { side, cardIds } = match;

  if (side === "runner") {
    for (const sourceId of state.runner.installed) {
      const source = state.cards[sourceId];
      if (!source?.revealDrawnCards) continue;
      for (const cardId of cardIds) {
        createPendingAbilityInstance(state, {
          abilityKey: "find-the-truth:reveal-drawn",
          sourceId,
          controller: "runner",
          mandatory: true,
          payload: { kind: "reveal_drawn_card", cardId },
        });
      }
    }
    return;
  }

  for (const cardId of cardIds) {
    const drawn = state.cards[cardId];
    if (!drawn) continue;
    if (drawn.type === "agenda") {
      for (const server of Object.values(state.servers)) {
        for (const sourceId of server.root) {
          const asset = state.cards[sourceId];
          if (!asset?.rezzed || !asset.onDrawAgendaMayRevealAndInstall) continue;
          createPendingAbilityInstance(state, {
            abilityKey: "political-dealings:may-install-drawn-agenda",
            sourceId,
            controller: "corp",
            mandatory: false,
            payload: { kind: "may_install_drawn_agenda", cardId },
          });
        }
      }
    }
    if (drawn.type === "ice") {
      for (const [serverId, server] of Object.entries(state.servers)) {
        for (const sourceId of server.root) {
          const up = state.cards[sourceId];
          const discount =
            up?.onDrawIceMayRevealAndInstallProtectingThisServerPayingLess;
          if (!up?.rezzed || typeof discount !== "number") continue;
          createPendingAbilityInstance(state, {
            abilityKey: "jinja-city-grid:may-install-drawn-ice",
            sourceId,
            controller: "corp",
            mandatory: false,
            payload: {
              kind: "may_install_drawn_ice",
              cardId,
              serverId: serverId as ServerId,
              discount,
            },
          });
        }
      }
    }
  }

  if (ramanRaiCanOfferSwap(state, cardIds)) {
    const raman = Object.values(state.cards).find(
      (card) =>
        card.rezzed &&
        card.onDrawMayLoseClickRevealSwapArchivesSameTypeOncePerTurn,
    );
    if (raman) {
      createPendingAbilityInstance(state, {
        abilityKey: "raman-rai:may-swap-drawn",
        sourceId: raman.id,
        controller: "corp",
        mandatory: false,
        payload: { kind: "may_raman_swap", cardIds: [...cardIds] },
      });
    }
  }
}

/**
 * CR 8.8.4b. A card that became installed on a remote via swap (zone diff)
 * meets first-remote-install at this checkpoint via entered_remote_install.
 * Normal installs set firstRemoteInstallThisTurnUsed in the install hook so
 * this path does not double-mark.
 */
function markSwapInstallFromZoneDiff(
  state: GameState,
  diff: CheckpointDiff,
): boolean {
  if (state.turn.firstRemoteInstallThisTurnUsed) return false;
  const identity = state.cards[state.corp.identityId];
  if (!identity?.onFirstRemoteInstallThisTurn) return false;
  const match = evaluateTriggerPredicate(
    state,
    diff,
    PREDICATE_ENTERED_REMOTE_INSTALL,
  );
  if (match.kind !== "entered_remote_install" || match.entries.length === 0) {
    return false;
  }
  const { serverId } = match.entries[0]!;
  state.turn.triggerRemoteInstallServerId = serverId;
  createPendingAbilityInstance(state, {
    abilityKey: "identity:first-remote-install",
    sourceId: identity.id,
    controller: "corp",
    mandatory: true,
    payload: { kind: "swap_install_trigger", serverId },
  });
  state.log.push(
    `${identity.title} becomes pending (CR ${CR.swapBecomeInstalled.number}).`,
  );
  return true;
}

/**
 * A Teia: first remote install via the normal install path (phase 3 — marked
 * at 10.3.1a from the turn flag set by noteFirstRemoteInstallThisTurn).
 */
function markFirstRemoteInstallNormal(
  state: GameState,
  diff: CheckpointDiff,
): void {
  const match = evaluateTriggerPredicate(
    state,
    diff,
    PREDICATE_FIRST_REMOTE_INSTALL_NORMAL,
  );
  if (match.kind !== "first_remote_install_normal" || !match.matched) {
    state.turn.firstRemoteInstallMetPending = false;
    return;
  }
  const idCard = state.cards[state.corp.identityId];
  if (
    !idCard?.onFirstRemoteInstallThisTurn ||
    abilitiesSuppressed(state, idCard.id)
  ) {
    state.turn.firstRemoteInstallMetPending = false;
    return;
  }
  state.turn.firstRemoteInstallMetPending = false;
  createPendingAbilityInstance(state, {
    abilityKey: "on-first-remote-install",
    sourceId: idCard.id,
    controller: "corp",
    mandatory: true,
    payload: {
      kind: "stored_conditional",
      effectKey: "onFirstRemoteInstallThisTurn",
    } satisfies PendingAbilityPayload,
  });
  state.log.push(
    `${idCard.title} becomes pending — first remote install this turn.`,
  );
}

/**
 * Phật Gioan: first agenda scored or stolen this turn (phase 3 — marked at
 * 10.3.1a from the turn flag set by agendaHooks). Marks every eligible Corp
 * source.
 */
function markFirstAgendaScoredOrStolen(
  state: GameState,
  diff: CheckpointDiff,
): void {
  const match = evaluateTriggerPredicate(
    state,
    diff,
    PREDICATE_FIRST_AGENDA_SCORED_OR_STOLEN,
  );
  if (match.kind !== "first_agenda_scored_or_stolen" || !match.matched) {
    state.turn.firstAgendaScoredOrStolenMetPending = false;
    return;
  }
  state.turn.firstAgendaScoredOrStolenMetPending = false;
  let any = false;
  for (const server of Object.values(state.servers)) {
    for (const id of [...server.root, ...server.ice]) {
      const card = state.cards[id];
      if (!card?.onFirstAgendaScoredOrStolenThisTurn) continue;
      if (!card.rezzed && !card.persistent) continue;
      if (abilitiesSuppressed(state, id)) continue;
      any = true;
      createPendingAbilityInstance(state, {
        abilityKey: "on-first-agenda-scored-or-stolen",
        sourceId: id,
        controller: "corp",
        mandatory: true,
        payload: {
          kind: "stored_conditional",
          effectKey: "onFirstAgendaScoredOrStolenThisTurn",
        } satisfies PendingAbilityPayload,
      });
      state.log.push(
        `${card.title} becomes pending — first agenda scored or stolen this turn.`,
      );
    }
  }
  if (any) state.turn.firstAgendaScoredOrStolenUsedThisTurn = true;
}

/**
 * Epiphany: first Runner steal/trash of a Corp card this turn (phase 3 —
 * marked at 10.3.1a from the turn flag set by trashHooks / scoring). Marks
 * every eligible Runner source (identity + installed).
 */
function markFirstRunnerStoleOrTrashed(
  state: GameState,
  diff: CheckpointDiff,
): void {
  const match = evaluateTriggerPredicate(
    state,
    diff,
    PREDICATE_FIRST_RUNNER_STOLE_OR_TRASHED,
  );
  if (match.kind !== "first_runner_stole_or_trashed" || !match.matched) {
    state.turn.firstRunnerStoleOrTrashedMetPending = false;
    return;
  }
  state.turn.firstRunnerStoleOrTrashedMetPending = false;
  let any = false;
  const idCard = state.cards[state.runner.identityId];
  if (idCard?.onFirstRunnerStoleOrTrashedCorpCardThisTurn) {
    any = true;
    createPendingAbilityInstance(state, {
      abilityKey: "on-first-runner-stole-or-trashed",
      sourceId: idCard.id,
      controller: "runner",
      mandatory: true,
      payload: {
        kind: "stored_conditional",
        effectKey: "onFirstRunnerStoleOrTrashedCorpCardThisTurn",
      } satisfies PendingAbilityPayload,
    });
    state.log.push(
      `${idCard.title} becomes pending — first Runner steal/trash of a Corp card this turn.`,
    );
  }
  for (const id of [...state.runner.installed]) {
    if (abilitiesSuppressed(state, id)) continue;
    const card = state.cards[id];
    if (!card?.onFirstRunnerStoleOrTrashedCorpCardThisTurn) continue;
    any = true;
    createPendingAbilityInstance(state, {
      abilityKey: "on-first-runner-stole-or-trashed",
      sourceId: id,
      controller: "runner",
      mandatory: true,
      payload: {
        kind: "stored_conditional",
        effectKey: "onFirstRunnerStoleOrTrashedCorpCardThisTurn",
      } satisfies PendingAbilityPayload,
    });
    state.log.push(
      `${card.title} becomes pending — first Runner steal/trash of a Corp card this turn.`,
    );
  }
  if (any) state.turn.firstRunnerStoleOrTrashedUsedThisTurn = true;
}

/**
 * Solidarity Badge / Controlling the Message: first Corp card trashed by the
 * Runner this turn (phase 3 — marked at 10.3.1a from the turn flag set by
 * trashHooks). Marks every eligible Runner installed, Corp score-area, and
 * Corp identity source.
 */
function markFirstCorpCardTrash(
  state: GameState,
  diff: CheckpointDiff,
): void {
  const match = evaluateTriggerPredicate(
    state,
    diff,
    PREDICATE_FIRST_CORP_CARD_TRASH,
  );
  if (match.kind !== "first_corp_card_trash" || !match.matched) {
    state.turn.firstCorpCardTrashMetPending = false;
    return;
  }
  state.turn.firstCorpCardTrashMetPending = false;
  let any = false;
  for (const id of [...state.runner.installed]) {
    if (abilitiesSuppressed(state, id)) continue;
    const card = state.cards[id];
    if (!card?.onFirstCorpCardTrashEachTurn) continue;
    any = true;
    createPendingAbilityInstance(state, {
      abilityKey: "on-first-corp-card-trash",
      sourceId: id,
      controller: "runner",
      mandatory: true,
      payload: {
        kind: "stored_conditional",
        effectKey: "onFirstCorpCardTrashEachTurn",
      } satisfies PendingAbilityPayload,
    });
    state.log.push(
      `${card.title} becomes pending — first Corp card trashed this turn.`,
    );
  }
  for (const id of [...state.corp.scoreArea]) {
    if (abilitiesSuppressed(state, id)) continue;
    const card = state.cards[id];
    if (!card?.onFirstCorpCardTrashEachTurn) continue;
    any = true;
    createPendingAbilityInstance(state, {
      abilityKey: "on-first-corp-card-trash",
      sourceId: id,
      controller: "corp",
      mandatory: true,
      payload: {
        kind: "stored_conditional",
        effectKey: "onFirstCorpCardTrashEachTurn",
      } satisfies PendingAbilityPayload,
    });
    state.log.push(
      `${card.title} becomes pending — first Corp card trashed this turn.`,
    );
  }
  const idCard = state.cards[state.corp.identityId];
  if (idCard?.onFirstCorpCardTrashEachTurn) {
    any = true;
    createPendingAbilityInstance(state, {
      abilityKey: "on-first-corp-card-trash",
      sourceId: idCard.id,
      controller: "corp",
      mandatory: true,
      payload: {
        kind: "stored_conditional",
        effectKey: "onFirstCorpCardTrashEachTurn",
      } satisfies PendingAbilityPayload,
    });
    state.log.push(
      `${idCard.title} becomes pending — first Corp card trashed this turn.`,
    );
  }
  if (any) state.turn.firstCorpCardTrashUsedThisTurn = true;
}

/**
 * District 99: first program or hardware trash this turn (phase 3 — marked at
 * 10.3.1a from the turn flag set by trashHooks). Marks every eligible Runner
 * installed source.
 */
function markFirstProgramOrHardwareTrash(
  state: GameState,
  diff: CheckpointDiff,
): void {
  const match = evaluateTriggerPredicate(
    state,
    diff,
    PREDICATE_FIRST_PROGRAM_OR_HARDWARE_TRASH,
  );
  if (match.kind !== "first_program_or_hardware_trash" || !match.matched) {
    state.turn.firstProgramOrHardwareTrashMetPending = false;
    return;
  }
  state.turn.firstProgramOrHardwareTrashMetPending = false;
  let any = false;
  for (const id of [...state.runner.installed]) {
    if (abilitiesSuppressed(state, id)) continue;
    const card = state.cards[id];
    if (!card?.onFirstProgramOrHardwareTrashEachTurn) continue;
    any = true;
    createPendingAbilityInstance(state, {
      abilityKey: "on-first-program-or-hardware-trash",
      sourceId: id,
      controller: "runner",
      mandatory: true,
      payload: {
        kind: "stored_conditional",
        effectKey: "onFirstProgramOrHardwareTrashEachTurn",
      } satisfies PendingAbilityPayload,
    });
    state.log.push(
      `${card.title} becomes pending — first program/hardware trash this turn.`,
    );
  }
  if (any) state.turn.firstProgramOrHardwareTrashUsedThisTurn = true;
}

/**
 * Mâché: first access trash this turn (phase 3 — marked at 10.3.1a from the
 * turn flag set by trashHooks). Marks every eligible Runner installed source.
 */
function markFirstAccessTrash(
  state: GameState,
  diff: CheckpointDiff,
): void {
  const match = evaluateTriggerPredicate(
    state,
    diff,
    PREDICATE_FIRST_ACCESS_TRASH,
  );
  if (match.kind !== "first_access_trash" || !match.matched) {
    state.turn.firstAccessTrashMetPending = false;
    return;
  }
  state.turn.firstAccessTrashMetPending = false;
  let any = false;
  for (const id of [...state.runner.installed]) {
    if (abilitiesSuppressed(state, id)) continue;
    const card = state.cards[id];
    if (!card?.onFirstAccessTrashEachTurn) continue;
    any = true;
    createPendingAbilityInstance(state, {
      abilityKey: "on-first-access-trash",
      sourceId: id,
      controller: "runner",
      mandatory: true,
      payload: {
        kind: "stored_conditional",
        effectKey: "onFirstAccessTrashEachTurn",
      } satisfies PendingAbilityPayload,
    });
    state.log.push(
      `${card.title} becomes pending — first access trash this turn.`,
    );
  }
  if (any) state.turn.firstAccessTrashUsedThisTurn = true;
}

/**
 * Storgotic Resonator: first trash matching Runner identity faction this turn
 * (phase 3 — marked at 10.3.1a from the turn flag set by trashHooks). Marks
 * every eligible rezzed Corp root source.
 */
function markFirstTrashMatchingRunnerIdFaction(
  state: GameState,
  diff: CheckpointDiff,
): void {
  const match = evaluateTriggerPredicate(
    state,
    diff,
    PREDICATE_FIRST_TRASH_MATCHING_RUNNER_ID_FACTION,
  );
  if (
    match.kind !== "first_trash_matching_runner_id_faction" ||
    !match.matched
  ) {
    state.turn.firstTrashMatchingRunnerIdentityFactionMetPending = false;
    return;
  }
  state.turn.firstTrashMatchingRunnerIdentityFactionMetPending = false;
  const faction = state.cards[state.runner.identityId]?.faction;
  let any = false;
  for (const server of Object.values(state.servers)) {
    for (const id of [...server.root]) {
      if (abilitiesSuppressed(state, id)) continue;
      const card = state.cards[id];
      if (
        !card?.rezzed ||
        !card.onFirstTrashMatchingRunnerIdentityFactionEachTurn
      ) {
        continue;
      }
      any = true;
      createPendingAbilityInstance(state, {
        abilityKey: "on-first-trash-matching-runner-id-faction",
        sourceId: id,
        controller: "corp",
        mandatory: true,
        payload: {
          kind: "stored_conditional",
          effectKey: "onFirstTrashMatchingRunnerIdentityFactionEachTurn",
        } satisfies PendingAbilityPayload,
      });
      state.log.push(
        `${card.title} becomes pending — first trash matching Runner identity faction (${faction}).`,
      );
    }
  }
  if (any) {
    state.turn.firstTrashMatchingRunnerIdentityFactionUsedThisTurn = true;
  }
}

/**
 * Nebula: first operation play while flipped this turn (phase 3 — marked at
 * 10.3.1a from the turn flag set by identityFlipHooks).
 */
function markCorpFlippedFirstOperationPlay(
  state: GameState,
  diff: CheckpointDiff,
): void {
  const match = evaluateTriggerPredicate(
    state,
    diff,
    PREDICATE_CORP_FLIPPED_FIRST_OPERATION_PLAY,
  );
  if (match.kind !== "corp_flipped_first_operation_play" || !match.matched) {
    state.turn.corpFlippedIdentityFirstOpMetPending = false;
    return;
  }
  state.turn.corpFlippedIdentityFirstOpMetPending = false;
  const idCard = state.cards[state.corp.identityId];
  if (
    !idCard?.identityFlipped ||
    !idCard.identityFlippedHooks?.onFirstOperationPlayThisTurn
  ) {
    return;
  }
  state.turn.corpFlippedIdentityFirstOpUsedThisTurn = true;
  createPendingAbilityInstance(state, {
    abilityKey: "identity-flipped-first-op",
    sourceId: idCard.id,
    controller: "corp",
    mandatory: true,
    payload: {
      kind: "stored_conditional",
      effectKey: "identityFlippedHooks.onFirstOperationPlayThisTurn",
    } satisfies PendingAbilityPayload,
  });
  state.log.push(
    `${idCard.title} becomes pending — first operation play while flipped.`,
  );
}

/**
 * Buffer Drive: first grip/stack trash batch this turn (phase 3 — marked at
 * 10.3.1a from the turn flag set by trashHooks). Batch ids remain on the turn
 * until `may_add_one_of_card_ids_to_stack_bottom` offers.
 */
function markFirstGripOrStackTrashBatch(
  state: GameState,
  diff: CheckpointDiff,
): void {
  const match = evaluateTriggerPredicate(
    state,
    diff,
    PREDICATE_FIRST_GRIP_OR_STACK_TRASH_BATCH,
  );
  if (match.kind !== "first_grip_or_stack_trash_batch" || !match.matched) {
    state.turn.bufferDriveGripStackTrashMetPending = false;
    return;
  }
  state.turn.bufferDriveGripStackTrashMetPending = false;
  const batchLen = state.turn.pendingGripOrStackTrashBatchIds?.length ?? 0;
  let source: { id: string; title: string } | null = null;
  for (const id of [...state.runner.installed]) {
    if (abilitiesSuppressed(state, id)) continue;
    const card = state.cards[id];
    if (!card?.onFirstGripOrStackTrashBatchEachTurn) continue;
    source = { id: card.id, title: card.title };
    break;
  }
  if (!source) {
    state.turn.pendingGripOrStackTrashBatchIds = [];
    return;
  }
  state.turn.bufferDriveGripStackTrashUsedThisTurn = true;
  createPendingAbilityInstance(state, {
    abilityKey: "on-first-grip-or-stack-trash-batch",
    sourceId: source.id,
    controller: "runner",
    mandatory: true,
    payload: {
      kind: "stored_conditional",
      effectKey: "onFirstGripOrStackTrashBatchEachTurn",
    } satisfies PendingAbilityPayload,
  });
  state.log.push(
    `${source.title} becomes pending — first grip/stack trash batch this turn (${batchLen}).`,
  );
}

/**
 * Reaver: first trash of an installed card this turn (phase 3 — marked at
 * 10.3.1a from the turn flag set by trashHooks). Draw is inline because the
 * pin declares a static field, not Effect IR.
 */
function markFirstInstalledTrash(
  state: GameState,
  diff: CheckpointDiff,
): void {
  const match = evaluateTriggerPredicate(
    state,
    diff,
    PREDICATE_FIRST_INSTALLED_TRASH,
  );
  if (match.kind !== "first_installed_trash" || !match.matched) {
    state.turn.firstInstalledTrashMetPending = false;
    return;
  }
  let source: { id: string; title: string } | null = null;
  for (const id of state.runner.installed) {
    if (abilitiesSuppressed(state, id)) continue;
    const card = state.cards[id];
    if (!card?.drawOnFirstTrashInstalledEachTurn) continue;
    source = { id: card.id, title: card.title };
    break;
  }
  state.turn.firstInstalledTrashMetPending = false;
  if (!source) return;
  state.turn.mlReaverDrawUsedThisTurn = true;
  createPendingAbilityInstance(state, {
    abilityKey: "on-first-installed-trash",
    sourceId: source.id,
    controller: "runner",
    mandatory: true,
    payload: {
      kind: "inline_conditional",
      effect: {
        op: "do",
        action: { kind: "draw", side: "runner", amount: 1 },
      },
    } satisfies PendingAbilityPayload,
  });
  state.log.push(
    `${source.title} becomes pending — first installed trash this turn.`,
  );
}

/**
 * NBN: Reality Plus — first tag(s) given this turn (phase 3 — marked at
 * 10.3.1a from the turn flag set by tag hooks).
 */
function markFirstTagThisTurn(state: GameState, diff: CheckpointDiff): void {
  const match = evaluateTriggerPredicate(
    state,
    diff,
    PREDICATE_FIRST_TAG_THIS_TURN,
  );
  if (match.kind !== "first_tag_this_turn" || !match.matched) {
    state.turn.firstTagThisTurnMetPending = false;
    return;
  }
  const idCard = state.cards[state.corp.identityId];
  if (!idCard?.onFirstTagThisTurn || abilitiesSuppressed(state, idCard.id)) {
    state.turn.firstTagThisTurnMetPending = false;
    return;
  }
  state.turn.firstTagThisTurnMetPending = false;
  state.turn.firstTagThisTurnUsedThisTurn = true;
  createPendingAbilityInstance(state, {
    abilityKey: "on-first-tag-this-turn",
    sourceId: idCard.id,
    controller: "corp",
    mandatory: true,
    payload: {
      kind: "stored_conditional",
      effectKey: "onFirstTagThisTurn",
    } satisfies PendingAbilityPayload,
  });
  state.log.push(
    `${idCard.title} becomes pending — first tag this turn.`,
  );
}

/**
 * Built to Last: advancement-from-zero predicate (CR 9.6.6a) evaluated at
 * 10.3.1a via the declarative trigger layer (fidelity phase 2).
 */
function markBuiltToLastFromCheckpointDiff(
  state: GameState,
  diff: CheckpointDiff,
): void {
  const match = evaluateTriggerPredicate(
    state,
    diff,
    PREDICATE_ADVANCEMENT_FROM_ZERO,
  );
  if (match.kind !== "advancement_increased_from_zero" || match.cardIds.length === 0) {
    return;
  }
  const idCard = state.cards[state.corp.identityId];
  if (idCard?.defId !== "weyland-consortium-built-to-last") return;
  if (abilitiesSuppressed(state, idCard.id)) return;
  for (const cardId of match.cardIds) {
    const card = state.cards[cardId];
    if (!card) continue;
    createPendingAbilityInstance(state, {
      abilityKey: "built-to-last-had-no-advancement",
      sourceId: idCard.id,
      controller: "corp",
      mandatory: true,
      payload: {
        kind: "inline_conditional",
        effect: {
          op: "do",
          action: { kind: "gain_credits", side: "corp", amount: 2 },
        },
      } satisfies PendingAbilityPayload,
    });
    state.log.push(
      `${idCard.title} becomes pending — ${card.title} had no advancement counters (CR ${CR.hadPreviousCheckpoint.number}).`,
    );
  }
}

/**
 * Sebastião (and Fenris carriers): runner-tags-from-zero predicate (CR 9.6.6a).
 * Mid-instruction untagged→tagged flicker does not meet "had no tags" when
 * the previous checkpoint had tags.
 */
function markHadNoTagsFromCheckpointDiff(
  state: GameState,
  diff: CheckpointDiff,
): void {
  const match = evaluateTriggerPredicate(
    state,
    diff,
    PREDICATE_RUNNER_TAGS_FROM_ZERO,
  );
  if (match.kind !== "runner_tags_increased_from_zero" || !match.matched) {
    return;
  }
  for (const carrierId of runnerAbilityCarrierIds(state)) {
    if (abilitiesSuppressed(state, carrierId)) continue;
    const idCard = state.cards[carrierId];
    if (!idCard?.onTakeTagsWhenUntagged) continue;
    createPendingAbilityInstance(state, {
      abilityKey: "on-take-tags-when-untagged",
      sourceId: idCard.id,
      controller: "runner",
      mandatory: true,
      payload: {
        kind: "stored_conditional",
        effectKey: "onTakeTagsWhenUntagged",
      } satisfies PendingAbilityPayload,
    });
    state.log.push(
      `${idCard.title} becomes pending — Runner had no tags (CR ${CR.hadPreviousCheckpoint.number}).`,
    );
  }
}

/**
 * CR 10.3.1j. Queue cards that entered the breached root since the previous
 * checkpoint via entered_breached_root (zone diff at 10.3.1a, before the early
 * snapshot commit). Step j reads the void after that commit.
 */
function noteRootEntriesFromZoneDiff(
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
 * Seidr: first Runner click spend/lose during a run (phase 3 — marked at
 * 10.3.1a from the turn flag set by click hooks, not mid-hook).
 */
function markSeidrFirstClickDuringRun(
  state: GameState,
  diff: CheckpointDiff,
): void {
  const match = evaluateTriggerPredicate(
    state,
    diff,
    PREDICATE_SEIDR_FIRST_CLICK_DURING_RUN,
  );
  if (match.kind !== "seidr_first_click_during_run" || !match.matched) {
    state.turn.seidrClickMetPending = false;
    return;
  }
  const idCard = state.cards[state.corp.identityId];
  if (
    !idCard?.onFirstRunnerClickSpendOrLoseDuringRun ||
    abilitiesSuppressed(state, idCard.id)
  ) {
    state.turn.seidrClickMetPending = false;
    return;
  }
  state.turn.seidrClickMetPending = false;
  state.turn.seidrClickDuringRunFiredThisTurn = true;
  createPendingAbilityInstance(state, {
    abilityKey: "seidr-first-click-during-run",
    sourceId: idCard.id,
    controller: "corp",
    mandatory: true,
    payload: {
      kind: "stored_conditional",
      effectKey: "onFirstRunnerClickSpendOrLoseDuringRun",
    } satisfies PendingAbilityPayload,
  });
  state.log.push(
    `${idCard.title} becomes pending — first Runner click spend/lose during a run.`,
  );
}

/**
 * Editorial: first Corp bad-publicity take this turn (phase 3 — marked at
 * 10.3.1a from the turn flag set by badPublicityHooks).
 */
function markFirstBadPublicityTake(
  state: GameState,
  diff: CheckpointDiff,
): void {
  const match = evaluateTriggerPredicate(
    state,
    diff,
    PREDICATE_FIRST_BAD_PUBLICITY_TAKE,
  );
  if (match.kind !== "first_bad_publicity_take" || !match.matched) {
    state.turn.firstBadPublicityMetPending = false;
    return;
  }
  const candidates = [state.corp.identityId];
  for (const server of Object.values(state.servers)) {
    for (const id of server.root) candidates.push(id);
  }
  let source: { id: string; title: string } | null = null;
  for (const id of candidates) {
    const card = state.cards[id];
    if (!card?.onFirstBadPublicityTakeEachTurn) continue;
    if (card.type !== "identity" && !card.rezzed) continue;
    if (abilitiesSuppressed(state, id)) continue;
    source = { id: card.id, title: card.title };
    break;
  }
  state.turn.firstBadPublicityMetPending = false;
  if (!source) return;
  state.turn.firstBadPublicityTakeUsedThisTurn = true;
  createPendingAbilityInstance(state, {
    abilityKey: "on-first-bad-publicity-take",
    sourceId: source.id,
    controller: "corp",
    mandatory: true,
    payload: {
      kind: "stored_conditional",
      effectKey: "onFirstBadPublicityTakeEachTurn",
    } satisfies PendingAbilityPayload,
  });
  state.log.push(
    `${source.title} becomes pending — first bad publicity take this turn.`,
  );
}

/**
 * Runner onEachCorpBadPublicityTake: one pending instance per take event
 * per eligible card (phase 3 — counted in hooks, marked at 10.3.1a).
 */
function markEachCorpBadPublicityTake(
  state: GameState,
  diff: CheckpointDiff,
): void {
  const match = evaluateTriggerPredicate(
    state,
    diff,
    PREDICATE_EACH_CORP_BAD_PUBLICITY_TAKE,
  );
  const count =
    match.kind === "each_corp_bad_publicity_take" ? match.count : 0;
  state.turn.corpBadPublicityTakeEventsPending = 0;
  if (count <= 0) return;
  for (let i = 0; i < count; i++) {
    for (const id of state.runner.installed) {
      const card = state.cards[id];
      if (!card?.onEachCorpBadPublicityTake) continue;
      if (abilitiesSuppressed(state, id)) continue;
      createPendingAbilityInstance(state, {
        abilityKey: "on-each-corp-bad-publicity-take",
        sourceId: id,
        controller: "runner",
        mandatory: true,
        payload: {
          kind: "stored_conditional",
          effectKey: "onEachCorpBadPublicityTake",
        } satisfies PendingAbilityPayload,
      });
      state.log.push(
        `${card.title} becomes pending — Corp took bad publicity.`,
      );
    }
  }
}

/**
 * Aniccam: first event trashed this turn (phase 3 — marked at 10.3.1a from
 * the turn flag set by trashHooks).
 */
function markFirstEventTrashed(state: GameState, diff: CheckpointDiff): void {
  const match = evaluateTriggerPredicate(
    state,
    diff,
    PREDICATE_FIRST_EVENT_TRASHED,
  );
  if (match.kind !== "first_event_trashed" || !match.matched) {
    state.turn.firstEventTrashedMetPending = false;
    return;
  }
  let source: { id: string; title: string } | null = null;
  for (const id of state.runner.installed) {
    if (abilitiesSuppressed(state, id)) continue;
    const card = state.cards[id];
    if (!card?.onFirstEventTrashedThisTurn) continue;
    source = { id: card.id, title: card.title };
    break;
  }
  state.turn.firstEventTrashedMetPending = false;
  if (!source) return;
  state.turn.firstEventTrashedUsedThisTurn = true;
  createPendingAbilityInstance(state, {
    abilityKey: "on-first-event-trashed",
    sourceId: source.id,
    controller: "runner",
    mandatory: true,
    payload: {
      kind: "stored_conditional",
      effectKey: "onFirstEventTrashedThisTurn",
    } satisfies PendingAbilityPayload,
  });
  state.log.push(
    `${source.title} becomes pending — first event trashed this turn.`,
  );
}

/**
 * MirrorMorph: third distinct Corp action this turn (phase 3 — marked at
 * 10.3.1a from the turn flag set by corpActionHooks).
 */
function markMirrormorphThirdDistinct(
  state: GameState,
  diff: CheckpointDiff,
): void {
  const match = evaluateTriggerPredicate(
    state,
    diff,
    PREDICATE_MIRRORMORPH_THIRD_DISTINCT,
  );
  if (match.kind !== "mirrormorph_third_distinct" || !match.matched) {
    state.turn.mirrormorphThirdDistinctMetPending = false;
    return;
  }
  const idCard = state.cards[state.corp.identityId];
  if (
    !idCard?.mirrormorphOnThirdDistinctAction ||
    abilitiesSuppressed(state, idCard.id)
  ) {
    state.turn.mirrormorphThirdDistinctMetPending = false;
    return;
  }
  state.turn.mirrormorphThirdDistinctMetPending = false;
  state.turn.mirrormorphThirdDistinctFiredThisTurn = true;
  createPendingAbilityInstance(state, {
    abilityKey: "mirrormorph-third-distinct",
    sourceId: idCard.id,
    controller: "corp",
    mandatory: true,
    payload: {
      kind: "stored_conditional",
      effectKey: "mirrormorphOnThirdDistinctAction",
    } satisfies PendingAbilityPayload,
  });
  state.log.push(
    `${idCard.title} becomes pending — third distinct Corp action this turn.`,
  );
}

/**
 * Asa / HB ETF: first Corp card install this turn (phase 3 — marked at
 * 10.3.1a from the turn flag set by install hooks).
 */
function markFirstCorpCardInstall(
  state: GameState,
  diff: CheckpointDiff,
): void {
  const match = evaluateTriggerPredicate(
    state,
    diff,
    PREDICATE_FIRST_CORP_CARD_INSTALL,
  );
  if (match.kind !== "first_corp_card_install" || !match.matched) {
    state.turn.firstCorpCardInstallMetPending = false;
    return;
  }
  const idCard = state.cards[state.corp.identityId];
  if (
    !idCard?.onFirstCorpCardInstallEachTurn ||
    abilitiesSuppressed(state, idCard.id)
  ) {
    state.turn.firstCorpCardInstallMetPending = false;
    return;
  }
  state.turn.firstCorpCardInstallMetPending = false;
  state.turn.firstCorpCardInstallUsedThisTurn = true;
  createPendingAbilityInstance(state, {
    abilityKey: "on-first-corp-card-install",
    sourceId: idCard.id,
    controller: "corp",
    mandatory: true,
    payload: {
      kind: "stored_conditional",
      effectKey: "onFirstCorpCardInstallEachTurn",
    } satisfies PendingAbilityPayload,
  });
  state.log.push(
    `${idCard.title} becomes pending — first Corp card install this turn.`,
  );
}

/**
 * Lago: first Corp root install this turn (phase 3 — marked at 10.3.1a from
 * the turn flag set by install hooks). Marks every eligible Runner source.
 */
function markFirstCorpRootInstall(
  state: GameState,
  diff: CheckpointDiff,
): void {
  const match = evaluateTriggerPredicate(
    state,
    diff,
    PREDICATE_FIRST_CORP_ROOT_INSTALL,
  );
  if (match.kind !== "first_corp_root_install" || !match.matched) {
    state.turn.firstCorpRootInstallMetPending = false;
    return;
  }
  state.turn.firstCorpRootInstallMetPending = false;
  let any = false;
  for (const id of state.runner.installed) {
    if (abilitiesSuppressed(state, id)) continue;
    const card = state.cards[id];
    if (!card?.onFirstCorpRootInstallEachTurn) continue;
    any = true;
    createPendingAbilityInstance(state, {
      abilityKey: "on-first-corp-root-install",
      sourceId: id,
      controller: "runner",
      mandatory: true,
      payload: {
        kind: "stored_conditional",
        effectKey: "onFirstCorpRootInstallEachTurn",
      } satisfies PendingAbilityPayload,
    });
    state.log.push(
      `${card.title} becomes pending — first Corp root install this turn.`,
    );
  }
  if (any) state.turn.firstCorpRootInstallUsedThisTurn = true;
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
function closeCheckpointReactionWindow(state: GameState): void {
  // Blanked / left-play sources lose pending before the window opens (CR 9.6.10).
  cancelPendingIfSourceInactive(state);
  const newlyMarkedIds = state.turn.checkpointNewlyMarkedPendingIds ?? [];
  state.turn.checkpointNewlyMarkedPendingIds = undefined;
  const pending = newlyMarkedIds
    .map((id) => state.pendingAbilities.find((p) => p.id === id))
    .filter(
      (p): p is NonNullable<typeof p> =>
        Boolean(p) && p!.status === "pending",
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
    if (
      inst.payload?.kind === "inline_conditional" ||
      inst.payload?.kind === "stored_conditional"
    ) {
      if (resolveStoredOrInlineConditionalInstance(state, inst.id)) {
        break;
      }
      continue;
    }
    // Optional draw installs open a choice; leave the instance pending until
    // that choice resolves (and stop offering further draw options).
    if (
      inst.payload?.kind === "may_install_drawn_agenda" ||
      inst.payload?.kind === "may_install_drawn_ice"
    ) {
      if (state.pendingChoice) {
        completePendingAbility(state, inst.id, "cancelled");
        continue;
      }
      markPendingAbilityResolving(state, inst.id);
      if (inst.payload.kind === "may_install_drawn_agenda") {
        const r = applyMumbadDagPrimitive(
          { state, sourceId: inst.sourceId },
          {
            kind: "may_install_drawn_agenda",
            cardId: inst.payload.cardId,
          },
        );
        if (r && !r.ok) {
          state.log.push(
            `Political Dealings failed: ${r.error}`,
          );
          completePendingAbility(state, inst.id, "done");
          continue;
        }
      } else {
        const drawn = state.cards[inst.payload.cardId];
        const up = state.cards[inst.sourceId];
        state.pendingChoice = {
          sourceId: inst.sourceId,
          chooser: "corp",
          options: [
            {
              id: "accept",
              label: `Reveal and install ${drawn?.title ?? "ice"} protecting ${inst.payload.serverId} (−${inst.payload.discount}¢)`,
              effect: {
                op: "do" as const,
                action: {
                  kind: "install_jinja_drawn_ice" as const,
                  cardId: inst.payload.cardId,
                  serverId: inst.payload.serverId,
                  discount: inst.payload.discount,
                },
              },
            },
            {
              id: "decline",
              label: "Decline",
              effect: {
                op: "do" as const,
                action: {
                  kind: "gain_credits" as const,
                  side: "corp" as const,
                  amount: 0,
                },
              },
            },
          ],
        };
        state.log.push(
          `${up?.title ?? "Jinja City Grid"} — may reveal/install drawn ice ${drawn?.title ?? inst.payload.cardId}.`,
        );
      }
      // Choice is the ability's instruction continuation; the pending
      // instance has been triggered (CR 9.6.12) and is done for the bag.
      completePendingAbility(state, inst.id, "done");
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

/**
 * CR 10.3.1b / 9.10.1. A lingering effect whose duration has passed is
 * removed here. Encounter-duration strength ends after the encounter
 * (CR 10.3.1b.ex1 / 3.9.5b). A current such as Targeted Marketing is
 * trashed after an agenda is stolen (CR 10.3.1b.ex2). Run-duration and
 * turn-duration effects wait for the next checkpoint after that run or
 * turn ends.
 */
function removeExpiredDurationAbilities(state: GameState): void {
  let removed = removeRevertedHostDurations(state);
  const checkpointBoosts = state.turn.checkpointBreakerBoosts;
  if (checkpointBoosts && Object.keys(checkpointBoosts).length > 0) {
    const cpViaRegistry = state.lingeringEffects.some(
      (e) =>
        !e.expired && e.kind === LINGERING_KIND_BREAKER_STRENGTH_CHECKPOINT,
    );
    // Registry-backed checkpoint boosts are counted when expireLingeringEffects
    // removes them; keep the turn map in sync for dual-write consumers.
    if (!cpViaRegistry) removed += Object.keys(checkpointBoosts).length;
    state.turn.checkpointBreakerBoosts = undefined;
  }
  removed += trashDurationPassedCurrents(state);
  const afterEncounter = currentCheckpoint(state)?.cites.some(
    (cite) => cite.number === CR.encounterIcePhase.number,
  );
  if (afterEncounter && state.run) {
    const encKeys = Object.keys(state.run.encounterStrengthBoosts).length;
    const iceKeys = Object.keys(state.run.iceStrengthBoosts).length;
    // Registry-backed encounter boosts are counted when expireLingeringEffects
    // removes them; keep the run maps in sync for dual-write consumers.
    const encViaRegistry = state.lingeringEffects.some(
      (e) =>
        !e.expired && e.kind === LINGERING_KIND_BREAKER_STRENGTH_ENCOUNTER,
    );
    const iceViaRegistry = state.lingeringEffects.some(
      (e) => !e.expired && e.kind === LINGERING_KIND_ICE_STRENGTH_ENCOUNTER,
    );
    state.run.encounterStrengthBoosts = {};
    state.run.iceStrengthBoosts = {};
    if (!encViaRegistry) removed += encKeys;
    if (!iceViaRegistry) removed += iceKeys;
  }
  const passedRun = state.turn.passedRunDurationCount ?? 0;
  if (passedRun > 0) {
    const runViaRegistry = state.lingeringEffects.some(
      (e) => !e.expired && e.kind === LINGERING_KIND_BREAKER_STRENGTH_RUN,
    );
    // When run-duration boosts were dual-written, expireLingeringEffects
    // counts them; otherwise preserve the ad-hoc key count from graph.ts.
    if (!runViaRegistry) removed += passedRun;
    state.turn.passedRunDurationCount = undefined;
  }
  const endedTurn = state.turn.turnDurationsPassed;
  if (endedTurn) {
    state.turn.turnDurationsPassed = undefined;
    removed += removeTurnDurations(state, endedTurn);
  }
  // Registry lingerings (CR 9.10.1) expire alongside ad-hoc duration fields.
  removed += expireLingeringEffects(state, {
    turn: endedTurn,
    run: passedRun > 0,
    encounter: Boolean(afterEncounter && state.run),
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

/** Lingering effects that lasted for the remainder of the ended turn. */
function removeTurnDurations(state: GameState, side: "corp" | "runner"): number {
  let removed = 0;
  {
    const breakerKeys = Object.keys(
      state.turn.breakerStrengthBoostsThisTurn,
    ).length;
    const iceKeys = Object.keys(state.turn.iceStrengthBoostsThisTurn).length;
    // Registry-backed boosts are counted when expireLingeringEffects removes
    // them; keep the turn maps in sync for dual-write consumers.
    const breakerViaRegistry = state.lingeringEffects.some(
      (e) => !e.expired && e.kind === LINGERING_KIND_BREAKER_STRENGTH,
    );
    const iceViaRegistry = state.lingeringEffects.some(
      (e) => !e.expired && e.kind === LINGERING_KIND_ICE_STRENGTH,
    );
    state.turn.breakerStrengthBoostsThisTurn = {};
    state.turn.iceStrengthBoostsThisTurn = {};
    if (!breakerViaRegistry) removed += breakerKeys;
    if (!iceViaRegistry) removed += iceKeys;
  }
  if (side === "runner" && (state.turn.runnerMuModifierUntilTurnEnd ?? 0) !== 0) {
    // Registry-backed MU modifiers are counted when expireLingeringEffects
    // removes them; keep the turn field in sync for dual-write consumers.
    const viaRegistry = state.lingeringEffects.some(
      (e) => !e.expired && e.kind === LINGERING_KIND_RUNNER_MU,
    );
    state.turn.runnerMuModifierUntilTurnEnd = undefined;
    if (!viaRegistry) removed += 1;
  }
  if (state.markServerId !== null) {
    // Registry-backed marks (CR 10.11.4) are counted when expireLingeringEffects
    // removes them; keep `markServerId` in sync here for dual-write consumers.
    const viaRegistry = state.lingeringEffects.some(
      (e) => !e.expired && e.kind === LINGERING_KIND_MARK,
    );
    state.markServerId = null;
    if (!viaRegistry) removed += 1;
  }
  for (const card of Object.values(state.cards)) {
    if (!card.grantedSubtypesUntilEndOfTurn?.length) continue;
    // Registry-backed grants are counted when expireLingeringEffects removes
    // them; keep the card field in sync here for dual-write consumers.
    const viaRegistry = state.lingeringEffects.some(
      (e) =>
        !e.expired &&
        e.kind === LINGERING_KIND_GRANTED_SUBTYPES &&
        (e.payload as { cardId?: string } | undefined)?.cardId === card.id,
    );
    delete card.grantedSubtypesUntilEndOfTurn;
    if (!viaRegistry) removed += 1;
  }
  if (side === "corp") {
    for (const card of Object.values(state.cards)) {
      const rem = card.abilitiesBlankedCorpTurnsRemaining;
      if (rem === undefined || rem === null) continue;
      if (rem <= 1) {
        // Registry-backed blanks are counted when expireLingeringEffects
        // removes them; keep the card flags in sync for dual-write consumers.
        const viaRegistry = state.lingeringEffects.some(
          (e) =>
            !e.expired &&
            e.kind === LINGERING_KIND_ABILITY_BLANK &&
            (e.payload as { cardId?: string } | undefined)?.cardId === card.id,
        );
        card.abilitiesBlanked = false;
        delete card.abilitiesBlankedCorpTurnsRemaining;
        if (!viaRegistry) removed += 1;
      } else {
        card.abilitiesBlankedCorpTurnsRemaining = rem - 1;
      }
    }
  }
  return removed;
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
    const card = state.cards[id];
    if (!card) continue;
    removeCardFromCurrentZone(state, id);
    if (card.side === "runner") {
      card.zone = "runner:heap";
      card.faceup = true;
      state.runner.discardPile.push(id);
    } else {
      card.zone = "corp:archives";
      card.faceup = false;
      state.corp.discardPile.push(id);
    }
    card.rezzed = false;
    state.log.push(
      `${card.title} trashed for uniqueness (CR ${CR.checkpointUniqueness.number}).`,
    );
  }
}

/**
 * CR 10.3.1e. A forbidden host has one appropriate card, so it is trashed.
 * Memory (CR 10.3.1e.ex2) and an active remote-server limit (CR 4.6.8f)
 * list every other minimal set. One set is trashed here. Several sets
 * pause the checkpoint until the player who chooses has picked one.
 * Returns true when the checkpoint is waiting on that choice.
 */
function checkCardRestrictions(state: GameState): boolean {
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
  state.pendingChoice = {
    sourceId: plans[0]?.programs[0] ?? state.corp.identityId,
    chooser,
    options: plans.map((plan) => ({
      id: restrictionOptionId(plan),
      label: restrictionPlanLabel(state, plan),
      effect: { op: "do", action: { kind: "gain_credits", side: chooser, amount: 0 } },
    })),
  };
  const who = both
    ? "active player"
    : chooser === "runner"
      ? "Runner"
      : "Corp";
  state.log.push(
    `Card restrictions checked (CR ${cite}); the ${who} chooses which set to trash.`,
  );
  return true;
}

/** The chosen set is trashed, then the checkpoint continues at CR 10.3.1f. */
export function resolveRestrictionChoice(state: GameState, optionId: string): void {
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

/**
 * CR 10.3.1f. Objects hosted on an agenda that moved from a score area to
 * any zone other than a score area are trashed.
 */
function checkHostedOnAgenda(state: GameState): void {
  const departed = state.turn.agendasLeftScoreArea ?? [];
  state.turn.agendasLeftScoreArea = undefined;
  let trashed = 0;
  for (const { agendaId, hostedIds } of departed) {
    const agenda = state.cards[agendaId];
    if (!agenda) continue;
    if (agenda.zone === "corp:score" || agenda.zone === "runner:score") continue;
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
 * CR 10.3.1h. A remote with no cards protecting it, in its root, or in the
 * process of being installed into it ceases to exist. A run against that
 * server ends once any open paid ability window closes (CR 4.6.8e).
 */
function checkRemoteServers(state: GameState): void {
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
    if (state.run?.attackedServerId === server.id) noteAttackedServerCeased(state);
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
 * CR 10.3.1j. Record that a card entered the breached root since the previous
 * checkpoint. Filled from the zone diff at 10.3.1a; also used to re-queue when
 * the declaration waits on an open choice.
 */
export function noteCardEnteredRootDuringBreach(
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

function offerRootEntry(state: GameState, ids: string[]): void {
  const [cardId, ...rest] = ids;
  if (!cardId || !state.run) return;
  state.run.pendingRootEntryIds = rest;
  const cite = CR.checkpointCardEnteringRoot.number;
  state.pendingChoice = {
    sourceId: cardId,
    chooser: "runner",
    options: [
      {
        id: `root-access:yes:${cardId}`,
        label: "The card that entered the root becomes a candidate for access",
        effect: { op: "do", action: { kind: "gain_credits", side: "runner", amount: 0 } },
      },
      {
        id: `root-access:no:${cardId}`,
        label: "The card that entered the root does not become a candidate",
        effect: { op: "do", action: { kind: "gain_credits", side: "runner", amount: 0 } },
      },
    ],
  };
  state.log.push(
    `The Runner declares whether the card that entered the root becomes a candidate (CR ${cite}).`,
  );
}

function checkCardsEnteringRootDuringBreach(state: GameState): void {
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
function checkDiscardPileCards(state: GameState): void {
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
function checkDiscardPileCounters(state: GameState): void {
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
    if (!host || !leftPlay(host.zone)) continue;
    ids.push(card.id);
  }
  return ids;
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
    state.runner.discardPile.push(id);
  } else {
    card.zone = "corp:archives";
    card.faceup = false;
    state.corp.discardPile.push(id);
  }
  card.rezzed = false;
  state.log.push(`${card.title} trashed (CR ${cite.number}).`);
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
      plan.programs
        .map((id) => state.cards[id]?.title ?? id)
        .join(" and "),
    );
  }
  if (plan.keep !== null) {
    const dropped = Object.values(state.servers)
      .filter((server) => server.kind === "remote" && !plan.keep?.includes(server.id))
      .map((server) => server.id);
    parts.push(
      dropped.length > 0
        ? `trash cards in ${dropped.join(" and ")}`
        : "keep the remote servers",
    );
  }
  return `Trash ${parts.join("; ")}`;
}

function restrictionSetsMixSides(state: GameState, plans: RestrictionPlan[]): boolean {
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

function cardsInRestrictionPlans(state: GameState, plans: RestrictionPlan[]): string[] {
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

function applyRestrictionPlan(state: GameState, plan: RestrictionPlan): void {
  for (const id of plan.programs) {
    trashRestrictionCard(state, id);
  }
  if (plan.keep === null) return;
  const keep = new Set(plan.keep);
  for (const server of Object.values(state.servers)) {
    if (server.kind !== "remote" || keep.has(server.id)) continue;
    for (const id of [...server.ice, ...server.root]) trashRestrictionCard(state, id);
    delete state.servers[server.id];
  }
}

function trashRestrictionCard(state: GameState, id: string): void {
  const card = state.cards[id];
  if (!card) return;
  if (card.hostId) {
    const host = state.cards[card.hostId];
    if (host?.hostedCardIds) {
      host.hostedCardIds = host.hostedCardIds.filter((hostedId) => hostedId !== id);
    }
    card.hostId = undefined;
  }
  removeCardFromCurrentZone(state, id);
  if (card.side === "runner") {
    card.zone = "runner:heap";
    card.faceup = true;
    state.runner.discardPile.push(id);
  } else {
    card.zone = "corp:archives";
    card.faceup = false;
    state.corp.discardPile.push(id);
  }
  card.rezzed = false;
  state.log.push(`${card.title} trashed (CR ${CR.checkpointCardRestrictions.number}).`);
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
  for (const id of state.runner.installed) add(id);
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
