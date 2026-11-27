/** Checkpoint marks for "the first time each turn" conditional abilities (CR 10.3.1a), read from the turn's tallies; called by markConditionalAbilities in checkpoints.ts. */
import type { GameState } from "../state/types/game.js";
import type { PendingAbilityPayload } from "../state/types/pendingAbilities.js";
import type { CheckpointDiff } from "../state/triggers/checkpointSnapshot.js";
import {
  evaluateTriggerPredicate,
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
  PREDICATE_FIRST_REVEAL_THIS_TURN,
  PREDICATE_FIRST_CREDIT_POOL_EMPTY,
  PREDICATE_VAL_DAMAGE_TRIGGERS,
  PREDICATE_VAL_INSTALL_TRIGGERS,
  PREDICATE_VAL_CLICK_LOSS_TRIGGERS,
  PREDICATE_VAL_BASIC_CLICK_DRAW_TRIGGERS,
  PREDICATE_FIRST_HARDWARE_INSTALL,
  PREDICATE_FIRST_PROGRAM_INSTALL,
  PREDICATE_FIRST_VIRUS_INSTALL,
  PREDICATE_FIRST_RUN_BEGIN,
  PREDICATE_FIRST_RD_RUN_BEGIN,
  PREDICATE_FIRST_ARCHIVES_RUN_BEGIN,
  PREDICATE_FIRST_UNSUCCESSFUL_RUN,
  PREDICATE_SISYPHUS_FIRST_PASS_REZZED_CG_OR_SENTRY,
  PREDICATE_DAREDEVIL_FIRST_RUN_ICE_GTE,
  PREDICATE_VAL_SUCCESSFUL_RUN_TRIGGERS,
  PREDICATE_ADVANCEMENT_FROM_ZERO,
  PREDICATE_RUNNER_TAGS_FROM_ZERO,
  PREDICATE_SEIDR_FIRST_CLICK_DURING_RUN,
  PREDICATE_FIRST_BAD_PUBLICITY_TAKE,
  PREDICATE_EACH_CORP_BAD_PUBLICITY_TAKE,
  PREDICATE_FIRST_EVENT_TRASHED,
  PREDICATE_MIRRORMORPH_THIRD_DISTINCT,
  PREDICATE_FIRST_CORP_CARD_INSTALL,
  PREDICATE_FIRST_CORP_ROOT_INSTALL,
} from "../state/triggers/triggerPredicates.js";
import { abilitiesSuppressed } from "../state/continuous/abilities.js";
import { createPendingAbilityInstance } from "../state/triggers/pendingAbilities.js";
import {
  FIRST_CORP_CARD_TRASH_ANY,
  FIRST_CORP_CARD_TRASH_INSTALLED,
  type FirstCorpCardTrashRecord,
  firstCorpCardTrashSources,
} from "../state/hostingAndTrash/trashHooks.js";
import {
  type ValRunnerTriggerFamily,
  VAL_RUNNER_TRIGGER_CONFIG,
  geneticsTriggerThreshold,
  valSuccessfulRunSourceIds,
} from "../effects/triggers/firstTimeEachTurnTriggers.js";
import { firstUnsuccessfulRunSourceIds } from "../state/run/unsuccessfulRunHooks.js";
import { CR } from "../timing/labels.js";
import { runnerAbilityCarrierIds } from "../state/setupAndEnd/additionalIdentities.js";

/**
 * A Teia: first remote install via the normal install path (phase 3 — marked
 * at 10.3.1a from the turn flag set by noteFirstRemoteInstallThisTurn).
 */
export function markFirstRemoteInstallNormal(
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
export function markFirstAgendaScoredOrStolen(
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
export function markFirstRunnerStoleOrTrashed(
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
 * Solidarity Badge / Aggressive Trendsetting: first Corp card (and first
 * installed Corp card) trashed by the
 * Runner this turn (phase 3 — marked at 10.3.1a from the turn flag set by
 * trashHooks). Marks every eligible Runner installed, Corp score-area, and
 * Corp identity source.
 */
export function markFirstCorpCardTrash(
  state: GameState,
  diff: CheckpointDiff,
): void {
  const match = evaluateTriggerPredicate(
    state,
    diff,
    PREDICATE_FIRST_CORP_CARD_TRASH,
  );
  if (match.kind === "first_corp_card_trash" && match.matched) {
    markFirstCorpCardTrashRecord(state, FIRST_CORP_CARD_TRASH_ANY);
  }
  state.turn.firstCorpCardTrashMetPending = false;
  if (
    state.turn.firstInstalledCorpCardTrashMetPending &&
    !state.turn.firstInstalledCorpCardTrashUsedThisTurn
  ) {
    markFirstCorpCardTrashRecord(state, FIRST_CORP_CARD_TRASH_INSTALLED);
  }
  state.turn.firstInstalledCorpCardTrashMetPending = false;
}

/**
 * Mark every active source of one first-Corp-card-trash record pending
 * (CR 9.6.5a): Runner installed cards, Corp score area, Corp identity.
 */
function markFirstCorpCardTrashRecord(
  state: GameState,
  record: FirstCorpCardTrashRecord,
): void {
  let any = false;
  for (const id of firstCorpCardTrashSources(state)) {
    if (abilitiesSuppressed(state, id)) continue;
    const card = state.cards[id];
    if (!card?.[record.hook]) continue;
    any = true;
    createPendingAbilityInstance(state, {
      abilityKey:
        record.hook === "onFirstCorpCardTrashEachTurn"
          ? "on-first-corp-card-trash"
          : "on-first-installed-corp-card-trash",
      sourceId: id,
      controller: card.side,
      mandatory: true,
      payload: {
        kind: "stored_conditional",
        effectKey: record.hook,
      } satisfies PendingAbilityPayload,
    });
    state.log.push(
      record.hook === "onFirstCorpCardTrashEachTurn"
        ? `${card.title} becomes pending — first Corp card trashed this turn.`
        : `${card.title} becomes pending — first installed Corp card trashed this turn.`,
    );
  }
  if (any) state.turn[record.used] = true;
}

/**
 * District 99: first program or hardware trash this turn (phase 3 — marked at
 * 10.3.1a from the turn flag set by trashHooks). Marks every eligible Runner
 * installed source.
 */
export function markFirstProgramOrHardwareTrash(
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
export function markFirstAccessTrash(
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
export function markFirstTrashMatchingRunnerIdFaction(
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
export function markCorpFlippedFirstOperationPlay(
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
export function markFirstGripOrStackTrashBatch(
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
export function markFirstInstalledTrash(
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
export function markFirstTagThisTurn(
  state: GameState,
  diff: CheckpointDiff,
): void {
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
  state.log.push(`${idCard.title} becomes pending — first tag this turn.`);
}

/**
 * Hyoubu Institute: first reveal this turn (phase 3 — marked at 10.3.1a from
 * the turn flag set by reveal hooks).
 */
export function markFirstRevealThisTurn(
  state: GameState,
  diff: CheckpointDiff,
): void {
  const match = evaluateTriggerPredicate(
    state,
    diff,
    PREDICATE_FIRST_REVEAL_THIS_TURN,
  );
  if (match.kind !== "first_reveal_this_turn" || !match.matched) {
    state.turn.firstRevealMetPending = false;
    return;
  }
  const idCard = state.cards[state.corp.identityId];
  if (!idCard?.onFirstRevealEachTurn || abilitiesSuppressed(state, idCard.id)) {
    state.turn.firstRevealMetPending = false;
    return;
  }
  state.turn.firstRevealMetPending = false;
  state.turn.firstRevealCreditUsedThisTurn = true;
  createPendingAbilityInstance(state, {
    abilityKey: "on-first-reveal-each-turn",
    sourceId: idCard.id,
    controller: "corp",
    mandatory: true,
    payload: {
      kind: "stored_conditional",
      effectKey: "onFirstRevealEachTurn",
    } satisfies PendingAbilityPayload,
  });
  state.log.push(`${idCard.title} becomes pending — first reveal this turn.`);
}

/**
 * Order of Sol: first empty Runner credit pool this turn (phase 3 — marked at
 * 10.3.1a from the turn flag set by credit hooks; CR 1.10).
 */
export function markFirstCreditPoolEmpty(
  state: GameState,
  diff: CheckpointDiff,
): void {
  const match = evaluateTriggerPredicate(
    state,
    diff,
    PREDICATE_FIRST_CREDIT_POOL_EMPTY,
  );
  if (match.kind !== "first_credit_pool_empty" || !match.matched) {
    state.turn.firstCreditPoolEmptyMetPending = false;
    return;
  }
  const sources: Array<{ id: string; title: string }> = [];
  const ids = [state.runner.identityId, ...state.runner.installed];
  for (const id of ids) {
    if (abilitiesSuppressed(state, id)) continue;
    const card = state.cards[id];
    if (!card?.onFirstRunnerCreditPoolEmptyThisTurn) continue;
    sources.push({ id: card.id, title: card.title });
  }
  state.turn.firstCreditPoolEmptyMetPending = false;
  if (sources.length === 0) return;
  state.turn.runnerCreditPoolEmptyFiredThisTurn = true;
  for (const source of sources) {
    createPendingAbilityInstance(state, {
      abilityKey: "on-first-runner-credit-pool-empty",
      sourceId: source.id,
      controller: "runner",
      mandatory: true,
      payload: {
        kind: "stored_conditional",
        effectKey: "onFirstRunnerCreditPoolEmptyThisTurn",
      } satisfies PendingAbilityPayload,
    });
    state.log.push(
      `${source.title} becomes pending — the Runner's credit pool is empty for the first time this turn (CR 1.10).`,
    );
  }
}

const VAL_RUNNER_TRIGGER_PREDICATES = {
  damage: PREDICATE_VAL_DAMAGE_TRIGGERS,
  install: PREDICATE_VAL_INSTALL_TRIGGERS,
  click_loss: PREDICATE_VAL_CLICK_LOSS_TRIGGERS,
  basic_click_draw: PREDICATE_VAL_BASIC_CLICK_DRAW_TRIGGERS,
} as const;

/**
 * Valley first(/second) each-turn Runner triggers (phase 3 — marked at 10.3.1a
 * from ordinals queued by hooks). Genetics may fire twice with Gene
 * Conditioning Shoppe.
 */
export function markValRunnerTriggers(
  state: GameState,
  diff: CheckpointDiff,
  family: ValRunnerTriggerFamily,
): void {
  const cfg = VAL_RUNNER_TRIGGER_CONFIG[family];
  const match = evaluateTriggerPredicate(
    state,
    diff,
    VAL_RUNNER_TRIGGER_PREDICATES[family],
  );
  const clearPending = (): void => {
    switch (family) {
      case "damage":
        state.turn.valDamageTriggerPendingCounts = [];
        return;
      case "install":
        state.turn.valInstallTriggerPendingCounts = [];
        return;
      case "click_loss":
        state.turn.valClickLossTriggerPendingCounts = [];
        return;
      case "basic_click_draw":
        state.turn.valBasicClickDrawTriggerPendingCounts = [];
        return;
    }
  };
  if (
    match.kind !== "val_runner_triggers" ||
    match.family !== family ||
    match.ordinals.length === 0
  ) {
    clearPending();
    return;
  }
  const threshold = geneticsTriggerThreshold(state);
  const sources = [...state.runner.installed];
  if (state.runner.identityId) sources.push(state.runner.identityId);
  const effectKey = cfg.effectKey;
  for (const ordinal of match.ordinals) {
    for (const id of sources) {
      if (abilitiesSuppressed(state, id)) continue;
      const card = state.cards[id];
      if (!card || !(card as unknown as Record<string, unknown>)[effectKey]) {
        continue;
      }
      const lim = (card.subtypes ?? []).includes("genetics") ? threshold : 1;
      if (ordinal > lim) continue;
      createPendingAbilityInstance(state, {
        abilityKey: effectKey,
        sourceId: card.id,
        controller: "runner",
        mandatory: true,
        payload: {
          kind: "stored_conditional",
          effectKey,
        } satisfies PendingAbilityPayload,
      });
      state.log.push(`${card.title} becomes pending — ${effectKey}.`);
    }
  }
  clearPending();
}

/**
 * First hardware install this turn (phase 3 — marked at 10.3.1a from MetPending).
 */
export function markFirstHardwareInstall(
  state: GameState,
  diff: CheckpointDiff,
): void {
  const match = evaluateTriggerPredicate(
    state,
    diff,
    PREDICATE_FIRST_HARDWARE_INSTALL,
  );
  if (match.kind !== "first_hardware_install" || !match.matched) {
    state.turn.firstHardwareInstallMetPending = false;
    return;
  }
  state.turn.firstHardwareInstallMetPending = false;
  state.turn.firstHardwareInstallUsedThisTurn = true;
  markRunnerStoredConditionals(
    state,
    "on-first-hardware-install",
    "onFirstHardwareInstallEachTurn",
    "first hardware install this turn",
  );
}

/**
 * LilyPAD first program install (phase 3 — marked at 10.3.1a from MetPending).
 */
export function markFirstProgramInstall(
  state: GameState,
  diff: CheckpointDiff,
): void {
  const match = evaluateTriggerPredicate(
    state,
    diff,
    PREDICATE_FIRST_PROGRAM_INSTALL,
  );
  if (match.kind !== "first_program_install" || !match.matched) {
    state.turn.firstProgramInstallMetPending = false;
    return;
  }
  state.turn.firstProgramInstallMetPending = false;
  state.turn.firstProgramInstallUsedThisTurn = true;
  markRunnerStoredConditionals(
    state,
    "on-first-program-install",
    "onFirstProgramInstallEachTurn",
    "first program install this turn",
  );
}

/**
 * Avgustina first virus install (phase 3 — marked at 10.3.1a from MetPending).
 */
export function markFirstVirusInstall(
  state: GameState,
  diff: CheckpointDiff,
): void {
  const match = evaluateTriggerPredicate(
    state,
    diff,
    PREDICATE_FIRST_VIRUS_INSTALL,
  );
  if (match.kind !== "first_virus_install" || !match.matched) {
    state.turn.firstVirusInstallMetPending = false;
    return;
  }
  state.turn.firstVirusInstallMetPending = false;
  state.turn.firstVirusInstallUsedThisTurn = true;
  markRunnerStoredConditionals(
    state,
    "on-first-virus-install",
    "onFirstVirusInstallThisTurn",
    "first virus install this turn",
  );
}

/**
 * Stegodon / Tributary / Prognostic: first run begin this turn (phase 3).
 */
export function markFirstRunBegin(
  state: GameState,
  diff: CheckpointDiff,
): void {
  const match = evaluateTriggerPredicate(
    state,
    diff,
    PREDICATE_FIRST_RUN_BEGIN,
  );
  if (match.kind !== "first_run_begin" || !match.matched) {
    state.turn.firstRunBeginMetPending = false;
    return;
  }
  state.turn.firstRunBeginMetPending = false;
  state.turn.runBeginThisTurnUsed = true;
  for (const id of state.corp.scoreArea) {
    if (abilitiesSuppressed(state, id)) continue;
    const card = state.cards[id];
    if (!card?.onFirstRunBeginThisTurn) continue;
    createPendingAbilityInstance(state, {
      abilityKey: "on-first-run-begin",
      sourceId: card.id,
      controller: "corp",
      mandatory: true,
      payload: {
        kind: "stored_conditional",
        effectKey: "onFirstRunBeginThisTurn",
      } satisfies PendingAbilityPayload,
    });
    state.log.push(
      `${card.title} becomes pending — first run begin this turn.`,
    );
  }
  for (const server of Object.values(state.servers)) {
    for (const id of [...server.ice, ...server.root]) {
      if (abilitiesSuppressed(state, id)) continue;
      const card = state.cards[id];
      if (!card?.rezzed || !card.onFirstRunBeginThisTurn) continue;
      createPendingAbilityInstance(state, {
        abilityKey: "on-first-run-begin",
        sourceId: card.id,
        controller: "corp",
        mandatory: true,
        payload: {
          kind: "stored_conditional",
          effectKey: "onFirstRunBeginThisTurn",
        } satisfies PendingAbilityPayload,
      });
      state.log.push(
        `${card.title} becomes pending — first run begin this turn.`,
      );
    }
  }
  for (const id of state.runner.installed) {
    if (abilitiesSuppressed(state, id)) continue;
    const card = state.cards[id];
    if (!card?.onFirstRunBeginThisTurn) continue;
    createPendingAbilityInstance(state, {
      abilityKey: "on-first-run-begin",
      sourceId: card.id,
      controller: "runner",
      mandatory: true,
      payload: {
        kind: "stored_conditional",
        effectKey: "onFirstRunBeginThisTurn",
      } satisfies PendingAbilityPayload,
    });
    state.log.push(
      `${card.title} becomes pending — first run begin this turn.`,
    );
  }
}

/** Padma: first R&D run begin this turn (phase 3). */
export function markFirstRdRunBegin(
  state: GameState,
  diff: CheckpointDiff,
): void {
  const match = evaluateTriggerPredicate(
    state,
    diff,
    PREDICATE_FIRST_RD_RUN_BEGIN,
  );
  if (match.kind !== "first_rd_run_begin" || !match.matched) {
    state.turn.firstRdRunBeginMetPending = false;
    return;
  }
  state.turn.firstRdRunBeginMetPending = false;
  const idCard = state.cards[state.runner.identityId];
  if (
    !idCard?.onFirstRdRunBeginThisTurn ||
    abilitiesSuppressed(state, idCard.id)
  ) {
    return;
  }
  createPendingAbilityInstance(state, {
    abilityKey: "on-first-rd-run-begin",
    sourceId: idCard.id,
    controller: "runner",
    mandatory: true,
    payload: {
      kind: "stored_conditional",
      effectKey: "onFirstRdRunBeginThisTurn",
    } satisfies PendingAbilityPayload,
  });
  state.log.push(
    `${idCard.title} becomes pending — first R&D run begin this turn.`,
  );
}

/** Front Company: first Archives run begin this turn (phase 3). */
export function markFirstArchivesRunBegin(
  state: GameState,
  diff: CheckpointDiff,
): void {
  const match = evaluateTriggerPredicate(
    state,
    diff,
    PREDICATE_FIRST_ARCHIVES_RUN_BEGIN,
  );
  if (match.kind !== "first_archives_run_begin" || !match.matched) {
    state.turn.firstArchivesRunBeginMetPending = false;
    return;
  }
  state.turn.firstArchivesRunBeginMetPending = false;
  for (const server of Object.values(state.servers)) {
    for (const id of server.root) {
      if (abilitiesSuppressed(state, id)) continue;
      const card = state.cards[id];
      if (!card?.rezzed || !card.onFirstArchivesRunBeginThisTurn) continue;
      createPendingAbilityInstance(state, {
        abilityKey: "on-first-archives-run-begin",
        sourceId: card.id,
        controller: "corp",
        mandatory: true,
        payload: {
          kind: "stored_conditional",
          effectKey: "onFirstArchivesRunBeginThisTurn",
        } satisfies PendingAbilityPayload,
      });
      state.log.push(
        `${card.title} becomes pending — first Archives run begin this turn.`,
      );
    }
  }
}

/**
 * John Masanori: first unsuccessful run this turn (phase 3 — marked at
 * 10.3.1a from MetPending).
 */
export function markFirstUnsuccessfulRun(
  state: GameState,
  diff: CheckpointDiff,
): void {
  const match = evaluateTriggerPredicate(
    state,
    diff,
    PREDICATE_FIRST_UNSUCCESSFUL_RUN,
  );
  if (match.kind !== "first_unsuccessful_run" || !match.matched) {
    state.turn.firstUnsuccessfulRunMetPending = false;
    return;
  }
  state.turn.firstUnsuccessfulRunMetPending = false;
  for (const id of firstUnsuccessfulRunSourceIds(state)) {
    const card = state.cards[id];
    if (!card?.onFirstUnsuccessfulRunThisTurn) continue;
    createPendingAbilityInstance(state, {
      abilityKey: "on-first-unsuccessful-run-this-turn",
      sourceId: card.id,
      controller: card.side === "corp" ? "corp" : "runner",
      mandatory: true,
      payload: {
        kind: "stored_conditional",
        effectKey: "onFirstUnsuccessfulRunThisTurn",
      } satisfies PendingAbilityPayload,
    });
    state.log.push(
      `${card.title} becomes pending — first unsuccessful run this turn.`,
    );
  }
}

/** Sisyphus: first pass rezzed code gate/sentry this turn (phase 3). */
export function markSisyphusFirstPass(
  state: GameState,
  diff: CheckpointDiff,
): void {
  const match = evaluateTriggerPredicate(
    state,
    diff,
    PREDICATE_SISYPHUS_FIRST_PASS_REZZED_CG_OR_SENTRY,
  );
  if (
    match.kind !== "sisyphus_first_pass_rezzed_cg_or_sentry" ||
    !match.matched
  ) {
    state.turn.sisyphusPassMetPending = false;
    return;
  }
  state.turn.sisyphusPassMetPending = false;
  for (const sid of state.corp.scoreArea) {
    if (abilitiesSuppressed(state, sid)) continue;
    const scored = state.cards[sid];
    if (!scored?.onFirstPassRezzedCodeGateOrSentryThisTurn) continue;
    state.turn.sisyphusPassUsedThisTurn = true;
    createPendingAbilityInstance(state, {
      abilityKey: "on-first-pass-rezzed-code-gate-or-sentry-this-turn",
      sourceId: scored.id,
      controller: "corp",
      mandatory: true,
      payload: {
        kind: "stored_conditional",
        effectKey: "onFirstPassRezzedCodeGateOrSentryThisTurn",
      } satisfies PendingAbilityPayload,
    });
    state.log.push(
      `${scored.title} becomes pending — first pass of rezzed code gate or sentry this turn.`,
    );
    break;
  }
}

/**
 * Daredevil: first run this turn on a server with ≥N ice (phase 3 — marked
 * at 10.3.1a from MetPending).
 */
export function markDaredevilFirstRun(
  state: GameState,
  diff: CheckpointDiff,
): void {
  const match = evaluateTriggerPredicate(
    state,
    diff,
    PREDICATE_DAREDEVIL_FIRST_RUN_ICE_GTE,
  );
  if (match.kind !== "daredevil_first_run_ice_gte" || !match.matched) {
    state.turn.daredevilDrawMetPending = false;
    return;
  }
  state.turn.daredevilDrawMetPending = false;
  if (!state.run || state.turn.daredevilDrawUsedThisTurn) return;
  const iceCount = state.servers[state.run.attackedServerId]?.ice.length ?? 0;
  for (const id of state.runner.installed) {
    if (abilitiesSuppressed(state, id)) continue;
    const card = state.cards[id];
    const spec = card?.drawOnFirstRunEachTurnIfServerIceGte;
    if (!card || !spec || iceCount < spec.ice) continue;
    state.turn.daredevilDrawUsedThisTurn = true;
    createPendingAbilityInstance(state, {
      abilityKey: "daredevil-draw-on-first-run-ice-gte",
      sourceId: card.id,
      controller: "runner",
      mandatory: true,
      payload: {
        kind: "inline_conditional",
        effect: {
          op: "do",
          action: { kind: "draw", side: "runner", amount: spec.draw },
        },
      } satisfies PendingAbilityPayload,
    });
    state.log.push(
      `${card.title} becomes pending — first run on server with ${iceCount} ice (draw ${spec.draw}).`,
    );
    break;
  }
}

/**
 * Pravdivost / DreamNet / Enhanced Vision: Valley successful-run ordinals
 * (phase 3 — marked at 10.3.1a). Sources include Corp identity and rezzed
 * root/ice as well as the Runner rig.
 */
export function markValSuccessfulRunTriggers(
  state: GameState,
  diff: CheckpointDiff,
): void {
  const match = evaluateTriggerPredicate(
    state,
    diff,
    PREDICATE_VAL_SUCCESSFUL_RUN_TRIGGERS,
  );
  if (
    match.kind !== "val_successful_run_triggers" ||
    match.ordinals.length === 0
  ) {
    state.turn.valSuccessfulRunTriggerPendingCounts = [];
    return;
  }
  for (const ordinal of match.ordinals) {
    for (const id of valSuccessfulRunSourceIds(state, ordinal)) {
      const card = state.cards[id];
      if (!card?.onFirstSuccessfulRunThisTurn) continue;
      createPendingAbilityInstance(state, {
        abilityKey: "on-first-successful-run-this-turn",
        sourceId: card.id,
        controller: card.side === "corp" ? "corp" : "runner",
        mandatory: true,
        payload: {
          kind: "stored_conditional",
          effectKey: "onFirstSuccessfulRunThisTurn",
        } satisfies PendingAbilityPayload,
      });
      state.log.push(
        `${card.title} becomes pending — first successful run this turn.`,
      );
    }
  }
  state.turn.valSuccessfulRunTriggerPendingCounts = [];
}

function markRunnerStoredConditionals(
  state: GameState,
  abilityKey: string,
  effectKey:
    | "onFirstHardwareInstallEachTurn"
    | "onFirstProgramInstallEachTurn"
    | "onFirstVirusInstallThisTurn",
  logSuffix: string,
): void {
  const sources = [...state.runner.installed];
  if (state.runner.identityId) sources.push(state.runner.identityId);
  for (const id of sources) {
    if (abilitiesSuppressed(state, id)) continue;
    const card = state.cards[id];
    if (!card?.[effectKey]) continue;
    createPendingAbilityInstance(state, {
      abilityKey,
      sourceId: card.id,
      controller: "runner",
      mandatory: true,
      payload: {
        kind: "stored_conditional",
        effectKey,
      } satisfies PendingAbilityPayload,
    });
    state.log.push(`${card.title} becomes pending — ${logSuffix}.`);
  }
}

/**
 * Built to Last: "Whenever you advance a card, gain 2 if it had no
 * advancement counters". The advancement-from-zero predicate (CR 9.6.6a) is
 * evaluated at 10.3.1a, limited to cards the Corp advanced since the
 * previous checkpoint: placing or moving counters is not advancing
 * (CR 1.18.1, 1.18.2).
 */
export function markBuiltToLastFromCheckpointDiff(
  state: GameState,
  diff: CheckpointDiff,
): void {
  const advanced = state.turn.advancedSincePreviousCheckpoint ?? [];
  state.turn.advancedSincePreviousCheckpoint = [];
  const match = evaluateTriggerPredicate(
    state,
    diff,
    PREDICATE_ADVANCEMENT_FROM_ZERO,
  );
  if (
    match.kind !== "advancement_increased_from_zero" ||
    match.cardIds.length === 0
  ) {
    return;
  }
  const idCard = state.cards[state.corp.identityId];
  if (idCard?.defId !== "weyland-consortium-built-to-last") return;
  if (abilitiesSuppressed(state, idCard.id)) return;
  for (const cardId of match.cardIds) {
    const card = state.cards[cardId];
    if (!card || !advanced.includes(cardId)) continue;
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
export function markHadNoTagsFromCheckpointDiff(
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
 * Seidr: first Runner click spend/lose during a run (phase 3 — marked at
 * 10.3.1a from the turn flag set by click hooks, not mid-hook).
 */
export function markSeidrFirstClickDuringRun(
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
export function markFirstBadPublicityTake(
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
export function markEachCorpBadPublicityTake(
  state: GameState,
  diff: CheckpointDiff,
): void {
  const match = evaluateTriggerPredicate(
    state,
    diff,
    PREDICATE_EACH_CORP_BAD_PUBLICITY_TAKE,
  );
  const count = match.kind === "each_corp_bad_publicity_take" ? match.count : 0;
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
export function markFirstEventTrashed(
  state: GameState,
  diff: CheckpointDiff,
): void {
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
export function markMirrormorphThirdDistinct(
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
export function markFirstCorpCardInstall(
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
export function markFirstCorpRootInstall(
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
