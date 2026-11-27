/** Checkpoint marks for conditional abilities on card hooks: draw, swap install, phase and turn begin or end, access, encounter, rez, and stored or inline conditionals (CR 10.3.1a); called by markConditionalAbilities in checkpoints.ts. */
import type { GameState } from "../state/types/game.js";
import type { ServerId } from "../state/types/servers.js";
import type {
  PendingAbilityPayload,
  StoredConditionalEffectKey,
} from "../state/types/pendingAbilities.js";
import type { CheckpointDiff } from "../state/triggers/checkpointSnapshot.js";
import {
  evaluateTriggerPredicate,
  PREDICATE_ENTERED_DRAW_SET_ASIDE,
  PREDICATE_ENTERED_REMOTE_INSTALL,
  PREDICATE_CORP_TURN_END,
  PREDICATE_INLINE_CONDITIONAL,
  PREDICATE_STORED_CONDITIONAL_NOTE,
  PREDICATE_ICE_REZ_ABILITY,
  PREDICATE_BEFORE_FIRST_TURN,
  PREDICATE_OUTSIDE_POOL_SPEND,
  PREDICATE_ENCOUNTER_ABILITY,
  PREDICATE_CORP_ACTION_PHASE_END,
  PREDICATE_RUNNER_ACTION_PHASE_END,
  PREDICATE_ACCESS_ABILITY,
  PREDICATE_UNSUCCESSFUL_RUN_SERVER,
  PREDICATE_SCORE_TURN_END,
  PREDICATE_RUNNER_TURN_END,
  PREDICATE_CORP_TURN_BEGIN,
  PREDICATE_RUNNER_TURN_BEGIN,
} from "../state/triggers/triggerPredicates.js";
import { createPendingAbilityInstance } from "../state/triggers/pendingAbilities.js";
import { ramanRaiCanOfferSwap } from "../effects/swap/swapKinds.js";
import { CR } from "../timing/labels.js";
import { abilitiesSuppressed } from "../state/continuous/abilities.js";

/**
 * On-draw conditionals meet while cards are still set aside (CR 8.4.5a) via
 * the entered_draw_set_aside predicate. Mark one pending instance per
 * matching drawn card (CR 9.6.2 / 9.6.4).
 */
export function markDrawConditionals(
  state: GameState,
  diff: CheckpointDiff,
): void {
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
          if (!asset?.rezzed || !asset.onDrawAgendaMayRevealAndInstall)
            continue;
          // One instance per drawn agenda, resolved like any other in the
          // reaction window, so a choice pauses it and the rest resume after
          // (CR 9.6.4b, 9.2.8a, 9.2.8d).
          createPendingAbilityInstance(state, {
            abilityKey: "political-dealings:may-install-drawn-agenda",
            sourceId,
            controller: "corp",
            mandatory: false,
            payload: {
              kind: "inline_conditional",
              effect: {
                op: "do",
                action: { kind: "may_install_drawn_agenda", cardId },
              },
            },
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
          const drawnTitle = state.cards[cardId]?.title ?? "ice";
          createPendingAbilityInstance(state, {
            abilityKey: "jinja-city-grid:may-install-drawn-ice",
            sourceId,
            controller: "corp",
            mandatory: false,
            payload: {
              kind: "inline_conditional",
              effect: {
                op: "choose",
                chooser: "corp",
                options: [
                  {
                    id: "accept",
                    label: `Reveal and install ${drawnTitle} protecting ${serverId} (−${discount}¢)`,
                    effect: {
                      op: "do",
                      action: {
                        kind: "install_jinja_drawn_ice",
                        cardId,
                        serverId: serverId as ServerId,
                        discount,
                      },
                    },
                  },
                  {
                    id: "decline",
                    label: "Decline",
                    effect: {
                      op: "do",
                      action: { kind: "gain_credits", side: "corp", amount: 0 },
                    },
                  },
                ],
              },
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
export function markSwapInstallFromZoneDiff(
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

/** onCorpTurnEnd (phase 3). */
export function markCorpTurnEnd(state: GameState, diff: CheckpointDiff): void {
  const match = evaluateTriggerPredicate(state, diff, PREDICATE_CORP_TURN_END);
  if (match.kind !== "corp_turn_end" || match.cardIds.length === 0) {
    state.turn.corpTurnEndPendingIds = [];
    return;
  }
  const cardIds = match.cardIds;
  state.turn.corpTurnEndPendingIds = [];
  for (const cardId of cardIds) {
    if (abilitiesSuppressed(state, cardId)) continue;
    const card = state.cards[cardId];
    if (!card?.onCorpTurnEnd) continue;
    createPendingAbilityInstance(state, {
      abilityKey: "on-corp-turn-end",
      sourceId: card.id,
      controller: "corp",
      mandatory: true,
      payload: {
        kind: "stored_conditional",
        effectKey: "onCorpTurnEnd",
      } satisfies PendingAbilityPayload,
    });
    state.log.push(`${card.title} becomes pending — Corp turn end.`);
  }
}

/** Synthesized inline Effect conditionals (phase 3). */
export function markInlineConditional(
  state: GameState,
  diff: CheckpointDiff,
): void {
  const match = evaluateTriggerPredicate(
    state,
    diff,
    PREDICATE_INLINE_CONDITIONAL,
  );
  if (match.kind !== "inline_conditional" || match.marks.length === 0) {
    state.turn.inlineConditionalPending = [];
    return;
  }
  const marks = match.marks;
  state.turn.inlineConditionalPending = [];
  for (const m of marks) {
    const card = state.cards[m.cardId];
    if (!card) continue;
    // Delayed abilities that outlive the source skip the active-source gate
    // (CR 9.6.13c). Other inlines still require an unblanked source.
    if (!m.independentOfSource && abilitiesSuppressed(state, m.cardId)) {
      continue;
    }
    createPendingAbilityInstance(state, {
      abilityKey: m.abilityKey,
      sourceId: card.id,
      controller: m.controller,
      mandatory: m.mandatory,
      independentOfSource: m.independentOfSource,
      payload: {
        kind: "inline_conditional",
        effect: m.effect,
      } satisfies PendingAbilityPayload,
    });
    state.log.push(m.logLine);
  }
}

/** Off-graph stored Effect-key conditionals (phase 3). */
export function markStoredConditionalNote(
  state: GameState,
  diff: CheckpointDiff,
): void {
  const match = evaluateTriggerPredicate(
    state,
    diff,
    PREDICATE_STORED_CONDITIONAL_NOTE,
  );
  if (match.kind !== "stored_conditional_note" || match.marks.length === 0) {
    state.turn.storedConditionalPending = [];
    return;
  }
  const marks = match.marks;
  state.turn.storedConditionalPending = [];
  for (const m of marks) {
    const card = state.cards[m.cardId];
    if (!card) continue;
    // Trash / delayed abilities that outlive the source skip the active-source
    // and blanking gates here (CR 9.6.13c); blanking still checked at resolve.
    if (!m.independentOfSource && abilitiesSuppressed(state, m.cardId)) {
      continue;
    }
    createPendingAbilityInstance(state, {
      abilityKey: m.abilityKey,
      sourceId: card.id,
      controller: m.controller,
      mandatory: m.mandatory,
      independentOfSource: m.independentOfSource,
      payload: {
        kind: "stored_conditional",
        effectKey: m.effectKey as StoredConditionalEffectKey,
      } satisfies PendingAbilityPayload,
    });
    state.log.push(m.logLine);
  }
}

/** Host / any-ice / protecting-server rez conditionals (phase 3). */
export function markIceRezAbility(
  state: GameState,
  diff: CheckpointDiff,
): void {
  const match = evaluateTriggerPredicate(
    state,
    diff,
    PREDICATE_ICE_REZ_ABILITY,
  );
  if (match.kind !== "ice_rez_ability" || match.marks.length === 0) {
    state.turn.iceRezAbilityPending = [];
    return;
  }
  const marks = match.marks;
  state.turn.iceRezAbilityPending = [];
  for (const m of marks) {
    if (abilitiesSuppressed(state, m.cardId)) continue;
    const card = state.cards[m.cardId];
    if (!card) continue;
    createPendingAbilityInstance(state, {
      abilityKey: m.abilityKey,
      sourceId: card.id,
      controller: m.controller,
      mandatory: m.mandatory,
      payload: {
        kind: "stored_conditional",
        effectKey: m.effectKey as StoredConditionalEffectKey,
      } satisfies PendingAbilityPayload,
    });
    state.log.push(m.logLine);
  }
}

/** Corp identity before-first-turn (phase 3; CR 1.6.7a). */
export function markBeforeFirstTurn(
  state: GameState,
  diff: CheckpointDiff,
): void {
  const match = evaluateTriggerPredicate(
    state,
    diff,
    PREDICATE_BEFORE_FIRST_TURN,
  );
  if (match.kind !== "before_first_turn" || match.marks.length === 0) {
    state.turn.beforeFirstTurnPending = [];
    return;
  }
  const marks = match.marks;
  state.turn.beforeFirstTurnPending = [];
  for (const m of marks) {
    if (abilitiesSuppressed(state, m.cardId)) continue;
    const card = state.cards[m.cardId];
    if (!card) continue;
    createPendingAbilityInstance(state, {
      abilityKey: m.abilityKey,
      sourceId: card.id,
      controller: "corp",
      mandatory: true,
      payload: {
        kind: "stored_conditional",
        effectKey: m.effectKey as StoredConditionalEffectKey,
      } satisfies PendingAbilityPayload,
    });
    state.log.push(m.logLine);
  }
}

/** Outside-pool spend conditionals (phase 3). */
export function markOutsidePoolSpend(
  state: GameState,
  diff: CheckpointDiff,
): void {
  const match = evaluateTriggerPredicate(
    state,
    diff,
    PREDICATE_OUTSIDE_POOL_SPEND,
  );
  if (match.kind !== "outside_pool_spend" || match.marks.length === 0) {
    state.turn.outsidePoolSpendPending = [];
    return;
  }
  const marks = match.marks;
  state.turn.outsidePoolSpendPending = [];
  for (const m of marks) {
    if (abilitiesSuppressed(state, m.cardId)) continue;
    const card = state.cards[m.cardId];
    if (!card) continue;
    createPendingAbilityInstance(state, {
      abilityKey: m.abilityKey,
      sourceId: card.id,
      controller: "corp",
      mandatory: true,
      payload: {
        kind: "stored_conditional",
        effectKey: m.effectKey as StoredConditionalEffectKey,
      } satisfies PendingAbilityPayload,
    });
    state.log.push(m.logLine);
  }
}

/** Encounter-begin conditionals (phase 3). */
export function markEncounterAbility(
  state: GameState,
  diff: CheckpointDiff,
): void {
  const match = evaluateTriggerPredicate(
    state,
    diff,
    PREDICATE_ENCOUNTER_ABILITY,
  );
  if (match.kind !== "encounter_ability" || match.marks.length === 0) {
    state.turn.encounterAbilityPending = [];
    return;
  }
  const marks = match.marks;
  state.turn.encounterAbilityPending = [];
  for (const m of marks) {
    if (abilitiesSuppressed(state, m.cardId)) continue;
    const card = state.cards[m.cardId];
    if (!card) continue;
    createPendingAbilityInstance(state, {
      abilityKey: m.abilityKey,
      sourceId: card.id,
      controller: "runner",
      mandatory: m.mandatory,
      payload: {
        kind: "stored_conditional",
        effectKey: m.effectKey as StoredConditionalEffectKey,
      } satisfies PendingAbilityPayload,
    });
    state.log.push(m.logLine);
  }
}

/** Corp action-phase end (phase 3). */
export function markCorpActionPhaseEnd(
  state: GameState,
  diff: CheckpointDiff,
): void {
  const match = evaluateTriggerPredicate(
    state,
    diff,
    PREDICATE_CORP_ACTION_PHASE_END,
  );
  if (match.kind !== "corp_action_phase_end" || match.marks.length === 0) {
    state.turn.corpActionPhaseEndPending = [];
    return;
  }
  const marks = match.marks;
  state.turn.corpActionPhaseEndPending = [];
  for (const m of marks) {
    if (abilitiesSuppressed(state, m.cardId)) continue;
    const card = state.cards[m.cardId];
    if (!card) continue;
    createPendingAbilityInstance(state, {
      abilityKey: m.abilityKey,
      sourceId: card.id,
      controller: m.controller,
      mandatory: true,
      payload: {
        kind: "stored_conditional",
        effectKey: m.effectKey as StoredConditionalEffectKey,
      } satisfies PendingAbilityPayload,
    });
    state.log.push(m.logLine);
  }
}

/** Runner action-phase end (phase 3). */
export function markRunnerActionPhaseEnd(
  state: GameState,
  diff: CheckpointDiff,
): void {
  const match = evaluateTriggerPredicate(
    state,
    diff,
    PREDICATE_RUNNER_ACTION_PHASE_END,
  );
  if (match.kind !== "runner_action_phase_end" || match.marks.length === 0) {
    state.turn.runnerActionPhaseEndPending = [];
    return;
  }
  const marks = match.marks;
  state.turn.runnerActionPhaseEndPending = [];
  for (const m of marks) {
    if (abilitiesSuppressed(state, m.cardId)) continue;
    const card = state.cards[m.cardId];
    if (!card) continue;
    createPendingAbilityInstance(state, {
      abilityKey: m.abilityKey,
      sourceId: card.id,
      controller: m.controller,
      mandatory: true,
      payload: {
        kind: "stored_conditional",
        effectKey: m.effectKey as StoredConditionalEffectKey,
      } satisfies PendingAbilityPayload,
    });
    state.log.push(m.logLine);
  }
}

/** Access-step conditionals (phase 3). */
export function markAccessAbility(
  state: GameState,
  diff: CheckpointDiff,
): void {
  const match = evaluateTriggerPredicate(state, diff, PREDICATE_ACCESS_ABILITY);
  if (match.kind !== "access_ability" || match.marks.length === 0) {
    state.turn.accessAbilityPending = [];
    return;
  }
  const marks = match.marks;
  state.turn.accessAbilityPending = [];
  for (const m of marks) {
    if (abilitiesSuppressed(state, m.cardId)) continue;
    const card = state.cards[m.cardId];
    if (!card) continue;
    createPendingAbilityInstance(state, {
      abilityKey: m.abilityKey,
      sourceId: card.id,
      controller: m.controller,
      mandatory: m.mandatory,
      payload: {
        kind: "stored_conditional",
        effectKey: m.effectKey as StoredConditionalEffectKey,
      } satisfies PendingAbilityPayload,
    });
    state.log.push(m.logLine);
  }
}

/** onUnsuccessfulRunOnThisServer (phase 3). */
export function markUnsuccessfulRunServer(
  state: GameState,
  diff: CheckpointDiff,
): void {
  const match = evaluateTriggerPredicate(
    state,
    diff,
    PREDICATE_UNSUCCESSFUL_RUN_SERVER,
  );
  if (match.kind !== "unsuccessful_run_server" || match.cardIds.length === 0) {
    state.turn.unsuccessfulRunServerPendingIds = [];
    return;
  }
  const cardIds = match.cardIds;
  state.turn.unsuccessfulRunServerPendingIds = [];
  for (const cardId of cardIds) {
    if (abilitiesSuppressed(state, cardId)) continue;
    const card = state.cards[cardId];
    if (!card?.rezzed || !card.onUnsuccessfulRunOnThisServer) continue;
    createPendingAbilityInstance(state, {
      abilityKey: "on-unsuccessful-run-on-this-server",
      sourceId: card.id,
      controller: "corp",
      mandatory: true,
      payload: {
        kind: "stored_conditional",
        effectKey: "onUnsuccessfulRunOnThisServer",
      } satisfies PendingAbilityPayload,
    });
    state.log.push(
      `${card.title} becomes pending — unsuccessful run on this server (CR ${CR.unsuccessfulRun.number}).`,
    );
  }
}

/** onScoreTurnEnd (phase 3). */
export function markScoreTurnEnd(state: GameState, diff: CheckpointDiff): void {
  const match = evaluateTriggerPredicate(state, diff, PREDICATE_SCORE_TURN_END);
  if (match.kind !== "score_turn_end" || match.cardIds.length === 0) {
    state.turn.scoreTurnEndPendingIds = [];
    return;
  }
  const cardIds = match.cardIds;
  state.turn.scoreTurnEndPendingIds = [];
  for (const cardId of cardIds) {
    if (abilitiesSuppressed(state, cardId)) continue;
    const card = state.cards[cardId];
    if (!card?.onScoreTurnEnd) continue;
    createPendingAbilityInstance(state, {
      abilityKey: "on-score-turn-end",
      sourceId: card.id,
      controller: "corp",
      mandatory: true,
      payload: {
        kind: "stored_conditional",
        effectKey: "onScoreTurnEnd",
      } satisfies PendingAbilityPayload,
    });
    state.log.push(
      `${card.title} becomes pending — the turn it was scored ends (CR 11.2_3_d).`,
    );
  }
}

/** onRunnerTurnEnd (phase 3). */
export function markRunnerTurnEnd(
  state: GameState,
  diff: CheckpointDiff,
): void {
  const match = evaluateTriggerPredicate(
    state,
    diff,
    PREDICATE_RUNNER_TURN_END,
  );
  if (match.kind !== "runner_turn_end" || match.cardIds.length === 0) {
    state.turn.runnerTurnEndPendingIds = [];
    return;
  }
  const cardIds = match.cardIds;
  state.turn.runnerTurnEndPendingIds = [];
  for (const cardId of cardIds) {
    if (abilitiesSuppressed(state, cardId)) continue;
    const card = state.cards[cardId];
    if (!card?.onRunnerTurnEnd) continue;
    createPendingAbilityInstance(state, {
      abilityKey: "on-runner-turn-end",
      sourceId: card.id,
      controller: "runner",
      mandatory: true,
      payload: {
        kind: "stored_conditional",
        effectKey: "onRunnerTurnEnd",
      } satisfies PendingAbilityPayload,
    });
    state.log.push(`${card.title} becomes pending — Runner turn end.`);
  }
}

/** Corp turn-begin family (phase 3). */
export function markCorpTurnBegin(
  state: GameState,
  diff: CheckpointDiff,
): void {
  const match = evaluateTriggerPredicate(
    state,
    diff,
    PREDICATE_CORP_TURN_BEGIN,
  );
  if (match.kind !== "corp_turn_begin" || match.marks.length === 0) {
    state.turn.corpTurnBeginPending = [];
    return;
  }
  const marks = match.marks;
  state.turn.corpTurnBeginPending = [];
  for (const m of marks) {
    if (abilitiesSuppressed(state, m.cardId)) continue;
    const card = state.cards[m.cardId];
    if (!card) continue;
    createPendingAbilityInstance(state, {
      abilityKey: m.abilityKey,
      sourceId: card.id,
      controller: m.controller,
      mandatory: true,
      payload: {
        kind: "stored_conditional",
        effectKey: m.effectKey as StoredConditionalEffectKey,
      } satisfies PendingAbilityPayload,
    });
    state.log.push(m.logLine);
  }
}

/** Runner turn-begin family (phase 3). */
export function markRunnerTurnBegin(
  state: GameState,
  diff: CheckpointDiff,
): void {
  const match = evaluateTriggerPredicate(
    state,
    diff,
    PREDICATE_RUNNER_TURN_BEGIN,
  );
  if (match.kind !== "runner_turn_begin" || match.marks.length === 0) {
    state.turn.runnerTurnBeginPending = [];
    return;
  }
  const marks = match.marks;
  state.turn.runnerTurnBeginPending = [];
  for (const m of marks) {
    if (abilitiesSuppressed(state, m.cardId)) continue;
    const card = state.cards[m.cardId];
    if (!card) continue;
    createPendingAbilityInstance(state, {
      abilityKey: m.abilityKey,
      sourceId: card.id,
      controller: m.controller,
      mandatory: true,
      payload: {
        kind: "stored_conditional",
        effectKey: m.effectKey as StoredConditionalEffectKey,
      } satisfies PendingAbilityPayload,
    });
    state.log.push(m.logLine);
  }
}
