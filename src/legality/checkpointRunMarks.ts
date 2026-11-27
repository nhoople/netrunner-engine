/** Checkpoint marks for run conditional abilities: run begin, approach, encounter, pass, bypass, success and run end (CR 10.3.1a); called by markConditionalAbilities in checkpoints.ts. */
import type { GameState } from "../state/types/game.js";
import type {
  StoredConditionalEffectKey,
  PendingAbilityPayload,
} from "../state/types/pendingAbilities.js";
import type { CheckpointDiff } from "../state/triggers/checkpointSnapshot.js";
import {
  PREDICATE_FIRST_SUCCESSFUL_HQ_RUN,
  PREDICATE_FIRST_SUCCESSFUL_HQ_OR_RD_RUN,
  PREDICATE_FIRST_SUCCESSFUL_CENTRAL_RUN,
  PREDICATE_FIRST_SUCCESSFUL_MARK_RUN,
  evaluateTriggerPredicate,
  PREDICATE_FIRST_ENCOUNTER_EACH_RUN,
  PREDICATE_FIRST_PASS_ICE,
  PREDICATE_PASS_UNREZZED_ICE,
  PREDICATE_PASS_REZZED_ICE,
  PREDICATE_ICE_ON_PASS,
  PREDICATE_PASS_HOST,
  PREDICATE_PASS_REZZED_ICE_PROTECTING_SERVER,
  PREDICATE_ENCOUNTER_END,
  PREDICATE_ENCOUNTER_END_REZZED_THIS_TURN,
  PREDICATE_ENCOUNTER_END_NOT_FULLY_BROKEN,
  PREDICATE_ENCOUNTER_END_PRINTED_SUBROUTINE_BROKEN,
  PREDICATE_HOST_ENCOUNTER,
  PREDICATE_ENCOUNTER_REZZED_AFTER_APPROACH,
  PREDICATE_APPROACH_SERVER,
  PREDICATE_PASS_ALL_ICE_PROTECTING_SERVER,
  PREDICATE_BYPASS,
  PREDICATE_APPROACH_ICE,
  PREDICATE_FIRST_SUCCESSFUL_RD_RUN_END,
  PREDICATE_SUCCESSFUL_RUN_ON_RD,
  PREDICATE_SUCCESSFUL_RUN_END_ONCE,
  PREDICATE_SUCCESSFUL_RUN_END,
  PREDICATE_OTHER_SERVER_SUCCESS,
  PREDICATE_SUCCESSFUL_RUN,
  PREDICATE_RUN_BEGIN,
  PREDICATE_SUCCESSFUL_RUN_SERVER,
} from "../state/triggers/triggerPredicates.js";
import { firstSuccessfulRunSourceIds } from "../state/run/firstSuccessfulRunHooks.js";
import { createPendingAbilityInstance } from "../state/triggers/pendingAbilities.js";
import { firstEncounterEachRunSourceIds } from "../state/run/firstEncounterPassHooks.js";
import { abilitiesSuppressed } from "../state/continuous/abilities.js";

function markFirstSuccessfulRunFamily(
  state: GameState,
  diff: CheckpointDiff,
  args: {
    predicate:
      | typeof PREDICATE_FIRST_SUCCESSFUL_HQ_RUN
      | typeof PREDICATE_FIRST_SUCCESSFUL_HQ_OR_RD_RUN
      | typeof PREDICATE_FIRST_SUCCESSFUL_CENTRAL_RUN
      | typeof PREDICATE_FIRST_SUCCESSFUL_MARK_RUN;
    metPendingKey:
      | "firstSuccessfulHqRunMetPending"
      | "firstSuccessfulHqOrRdRunMetPending"
      | "firstSuccessfulCentralRunMetPending"
      | "firstSuccessfulMarkRunMetPending";
    effectKey: StoredConditionalEffectKey;
    abilityKey: string;
    logSuffix: string;
  },
): void {
  const match = evaluateTriggerPredicate(state, diff, args.predicate);
  if (
    match.kind !== args.predicate.kind ||
    !("matched" in match) ||
    !match.matched
  ) {
    state.turn[args.metPendingKey] = false;
    return;
  }
  state.turn[args.metPendingKey] = false;
  for (const id of firstSuccessfulRunSourceIds(state, args.effectKey)) {
    const card = state.cards[id];
    if (!card) continue;
    createPendingAbilityInstance(state, {
      abilityKey: args.abilityKey,
      sourceId: card.id,
      controller: "runner",
      mandatory: true,
      payload: {
        kind: "stored_conditional",
        effectKey: args.effectKey,
      } satisfies PendingAbilityPayload,
    });
    state.log.push(`${card.title} becomes pending — ${args.logSuffix}.`);
  }
}

/** PAN-Weave: first successful HQ run this turn (phase 3). */
export function markFirstSuccessfulHqRun(
  state: GameState,
  diff: CheckpointDiff,
): void {
  markFirstSuccessfulRunFamily(state, diff, {
    predicate: PREDICATE_FIRST_SUCCESSFUL_HQ_RUN,
    metPendingKey: "firstSuccessfulHqRunMetPending",
    effectKey: "onFirstSuccessfulHqRunThisTurn",
    abilityKey: "on-first-successful-hq-run-this-turn",
    logSuffix: "first successful HQ run this turn",
  });
}

/** RNG Key: first successful HQ or R&D run this turn (phase 3). */
export function markFirstSuccessfulHqOrRdRun(
  state: GameState,
  diff: CheckpointDiff,
): void {
  markFirstSuccessfulRunFamily(state, diff, {
    predicate: PREDICATE_FIRST_SUCCESSFUL_HQ_OR_RD_RUN,
    metPendingKey: "firstSuccessfulHqOrRdRunMetPending",
    effectKey: "onFirstSuccessfulHqOrRdRunThisTurn",
    abilityKey: "on-first-successful-hq-or-rd-run-this-turn",
    logSuffix: "first successful HQ or R&D run this turn",
  });
}

/** Zenit: first successful central run this turn (phase 3). */
export function markFirstSuccessfulCentralRun(
  state: GameState,
  diff: CheckpointDiff,
): void {
  markFirstSuccessfulRunFamily(state, diff, {
    predicate: PREDICATE_FIRST_SUCCESSFUL_CENTRAL_RUN,
    metPendingKey: "firstSuccessfulCentralRunMetPending",
    effectKey: "onFirstSuccessfulCentralRunThisTurn",
    abilityKey: "on-first-successful-central-run-this-turn",
    logSuffix: "first successful central run this turn",
  });
}

/** Virtuoso: first successful mark run this turn (phase 3). */
export function markFirstSuccessfulMarkRun(
  state: GameState,
  diff: CheckpointDiff,
): void {
  markFirstSuccessfulRunFamily(state, diff, {
    predicate: PREDICATE_FIRST_SUCCESSFUL_MARK_RUN,
    metPendingKey: "firstSuccessfulMarkRunMetPending",
    effectKey: "onFirstSuccessfulMarkRunThisTurn",
    abilityKey: "on-first-successful-mark-run-this-turn",
    logSuffix: "first successful run on the mark this turn",
  });
}

/** Baklan: first actual encounter this run (phase 3). */
export function markFirstEncounterEachRun(
  state: GameState,
  diff: CheckpointDiff,
): void {
  const match = evaluateTriggerPredicate(
    state,
    diff,
    PREDICATE_FIRST_ENCOUNTER_EACH_RUN,
  );
  if (match.kind !== "first_encounter_each_run" || !match.matched) {
    if (state.run) state.run.firstEncounterEachRunMetPending = false;
    return;
  }
  if (state.run) state.run.firstEncounterEachRunMetPending = false;
  for (const id of firstEncounterEachRunSourceIds(state)) {
    const card = state.cards[id];
    if (!card?.onFirstEncounterEachRun) continue;
    createPendingAbilityInstance(state, {
      abilityKey: "on-first-encounter-each-run",
      sourceId: card.id,
      controller: "runner",
      mandatory: true,
      payload: {
        kind: "stored_conditional",
        effectKey: "onFirstEncounterEachRun",
      } satisfies PendingAbilityPayload,
    });
    state.log.push(`${card.title} becomes pending — first encounter this run.`);
  }
}

/** Khan: first ice passed this turn (phase 3). */
export function markFirstPassIce(state: GameState, diff: CheckpointDiff): void {
  const match = evaluateTriggerPredicate(state, diff, PREDICATE_FIRST_PASS_ICE);
  if (match.kind !== "first_pass_ice" || !match.matched) {
    state.turn.firstPassIceMetPending = false;
    return;
  }
  state.turn.firstPassIceMetPending = false;
  const khan = state.cards[state.runner.identityId];
  if (!khan?.onFirstPassIceEachTurn || abilitiesSuppressed(state, khan.id)) {
    return;
  }
  state.turn.bmFirstPassIceUsedThisTurn = true;
  createPendingAbilityInstance(state, {
    abilityKey: "on-first-pass-ice-each-turn",
    sourceId: khan.id,
    controller: "runner",
    mandatory: true,
    payload: {
      kind: "stored_conditional",
      effectKey: "onFirstPassIceEachTurn",
    } satisfies PendingAbilityPayload,
  });
  state.log.push(`${khan.title} becomes pending — first ice passed this turn.`);
}

/** Runner onPassUnrezzedIce (phase 3). */
export function markPassUnrezzedIce(
  state: GameState,
  diff: CheckpointDiff,
): void {
  const match = evaluateTriggerPredicate(
    state,
    diff,
    PREDICATE_PASS_UNREZZED_ICE,
  );
  if (match.kind !== "pass_unrezzed_ice" || !match.matched) {
    state.turn.passUnrezzedIceMetPending = false;
    return;
  }
  state.turn.passUnrezzedIceMetPending = false;
  for (const id of state.runner.installed) {
    if (abilitiesSuppressed(state, id)) continue;
    const card = state.cards[id];
    if (!card?.onPassUnrezzedIce) continue;
    createPendingAbilityInstance(state, {
      abilityKey: "on-pass-unrezzed-ice",
      sourceId: card.id,
      controller: "runner",
      mandatory: true,
      payload: {
        kind: "stored_conditional",
        effectKey: "onPassUnrezzedIce",
      } satisfies PendingAbilityPayload,
    });
    state.log.push(`${card.title} becomes pending — unrezzed ice passed.`);
  }
}

/** Runner onPassRezzedIce (phase 3). */
export function markPassRezzedIce(
  state: GameState,
  diff: CheckpointDiff,
): void {
  const match = evaluateTriggerPredicate(
    state,
    diff,
    PREDICATE_PASS_REZZED_ICE,
  );
  if (match.kind !== "pass_rezzed_ice" || !match.matched) {
    state.turn.passRezzedIceMetPending = false;
    return;
  }
  state.turn.passRezzedIceMetPending = false;
  for (const id of state.runner.installed) {
    if (abilitiesSuppressed(state, id)) continue;
    const card = state.cards[id];
    if (!card?.onPassRezzedIce) continue;
    createPendingAbilityInstance(state, {
      abilityKey: "on-pass-rezzed-ice",
      sourceId: card.id,
      controller: "runner",
      mandatory: true,
      payload: {
        kind: "stored_conditional",
        effectKey: "onPassRezzedIce",
      } satisfies PendingAbilityPayload,
    });
    state.log.push(`${card.title} becomes pending — rezzed ice passed.`);
  }
}

/** Ice onPass (phase 3). */
export function markIceOnPass(state: GameState, diff: CheckpointDiff): void {
  const match = evaluateTriggerPredicate(state, diff, PREDICATE_ICE_ON_PASS);
  if (match.kind !== "ice_on_pass" || match.iceIds.length === 0) {
    state.turn.passIceOnPassPendingIds = [];
    return;
  }
  const iceIds = match.iceIds;
  state.turn.passIceOnPassPendingIds = [];
  for (const iceId of iceIds) {
    if (abilitiesSuppressed(state, iceId)) continue;
    const ice = state.cards[iceId];
    if (!ice?.onPass || !ice.rezzed) continue;
    createPendingAbilityInstance(state, {
      abilityKey: "on-pass",
      sourceId: ice.id,
      controller: "corp",
      mandatory: true,
      payload: {
        kind: "stored_conditional",
        effectKey: "onPass",
      } satisfies PendingAbilityPayload,
    });
    state.log.push(`${ice.title} becomes pending — passed.`);
  }
}

/** Hosted onPassHost (phase 3). */
export function markPassHost(state: GameState, diff: CheckpointDiff): void {
  const match = evaluateTriggerPredicate(state, diff, PREDICATE_PASS_HOST);
  if (match.kind !== "pass_host" || match.iceIds.length === 0) {
    state.turn.passHostPendingIceIds = [];
    return;
  }
  const iceIds = match.iceIds;
  state.turn.passHostPendingIceIds = [];
  for (const iceId of iceIds) {
    for (const hid of state.runner.installed) {
      if (abilitiesSuppressed(state, hid)) continue;
      const hostee = state.cards[hid];
      if (!hostee?.onPassHost || hostee.hostId !== iceId) continue;
      createPendingAbilityInstance(state, {
        abilityKey: "on-pass-host",
        sourceId: hostee.id,
        controller: "runner",
        mandatory: true,
        payload: {
          kind: "stored_conditional",
          effectKey: "onPassHost",
        } satisfies PendingAbilityPayload,
      });
      state.log.push(`${hostee.title} becomes pending — host ice passed.`);
    }
  }
}

/** Upgrade onPassRezzedIceProtectingThisServer (phase 3). */
export function markPassRezzedIceProtectingServer(
  state: GameState,
  diff: CheckpointDiff,
): void {
  const match = evaluateTriggerPredicate(
    state,
    diff,
    PREDICATE_PASS_REZZED_ICE_PROTECTING_SERVER,
  );
  if (
    match.kind !== "pass_rezzed_ice_protecting_server" ||
    match.serverIds.length === 0
  ) {
    state.turn.passProtectingServerPendingIds = [];
    return;
  }
  const serverIds = match.serverIds;
  state.turn.passProtectingServerPendingIds = [];
  for (const serverId of serverIds) {
    const server = state.servers[serverId as keyof typeof state.servers];
    for (const upId of server?.root ?? []) {
      if (abilitiesSuppressed(state, upId)) continue;
      const up = state.cards[upId];
      if (!up?.rezzed || !up.onPassRezzedIceProtectingThisServer) continue;
      createPendingAbilityInstance(state, {
        abilityKey: "on-pass-rezzed-ice-protecting-this-server",
        sourceId: up.id,
        controller: "corp",
        mandatory: true,
        payload: {
          kind: "stored_conditional",
          effectKey: "onPassRezzedIceProtectingThisServer",
        } satisfies PendingAbilityPayload,
      });
      state.log.push(
        `${up.title} becomes pending — rezzed ice protecting this server passed.`,
      );
    }
  }
}

/** Ice onEncounterEnd (phase 3). */
export function markEncounterEnd(state: GameState, diff: CheckpointDiff): void {
  const match = evaluateTriggerPredicate(state, diff, PREDICATE_ENCOUNTER_END);
  if (match.kind !== "encounter_end" || match.iceIds.length === 0) {
    state.turn.encounterEndPendingIds = [];
    return;
  }
  const iceIds = match.iceIds;
  state.turn.encounterEndPendingIds = [];
  for (const iceId of iceIds) {
    if (abilitiesSuppressed(state, iceId)) continue;
    const ice = state.cards[iceId];
    if (!ice?.onEncounterEnd || !ice.rezzed) continue;
    createPendingAbilityInstance(state, {
      abilityKey: "on-encounter-end",
      sourceId: ice.id,
      controller: "corp",
      mandatory: true,
      payload: {
        kind: "stored_conditional",
        effectKey: "onEncounterEnd",
      } satisfies PendingAbilityPayload,
    });
    state.log.push(`${ice.title} becomes pending — encounter ends.`);
  }
}

/** Ice onEncounterEndIfRezzedThisTurn (phase 3). */
export function markEncounterEndRezzedThisTurn(
  state: GameState,
  diff: CheckpointDiff,
): void {
  const match = evaluateTriggerPredicate(
    state,
    diff,
    PREDICATE_ENCOUNTER_END_REZZED_THIS_TURN,
  );
  if (
    match.kind !== "encounter_end_rezzed_this_turn" ||
    match.iceIds.length === 0
  ) {
    state.turn.encounterEndRezzedThisTurnPendingIds = [];
    return;
  }
  const iceIds = match.iceIds;
  state.turn.encounterEndRezzedThisTurnPendingIds = [];
  for (const iceId of iceIds) {
    if (abilitiesSuppressed(state, iceId)) continue;
    const ice = state.cards[iceId];
    if (!ice?.onEncounterEndIfRezzedThisTurn) continue;
    createPendingAbilityInstance(state, {
      abilityKey: "on-encounter-end-if-rezzed-this-turn",
      sourceId: ice.id,
      controller: "corp",
      mandatory: true,
      payload: {
        kind: "stored_conditional",
        effectKey: "onEncounterEndIfRezzedThisTurn",
      } satisfies PendingAbilityPayload,
    });
    state.log.push(
      `${ice.title} becomes pending — encounter ends (rezzed this turn).`,
    );
  }
}

/** Ice onEncounterEndIfNotFullyBroken (phase 3). */
export function markEncounterEndNotFullyBroken(
  state: GameState,
  diff: CheckpointDiff,
): void {
  const match = evaluateTriggerPredicate(
    state,
    diff,
    PREDICATE_ENCOUNTER_END_NOT_FULLY_BROKEN,
  );
  if (
    match.kind !== "encounter_end_not_fully_broken" ||
    match.iceIds.length === 0
  ) {
    state.turn.encounterEndNotFullyBrokenPendingIds = [];
    return;
  }
  const iceIds = match.iceIds;
  state.turn.encounterEndNotFullyBrokenPendingIds = [];
  for (const iceId of iceIds) {
    if (abilitiesSuppressed(state, iceId)) continue;
    const ice = state.cards[iceId];
    if (!ice?.onEncounterEndIfNotFullyBroken) continue;
    createPendingAbilityInstance(state, {
      abilityKey: "on-encounter-end-if-not-fully-broken",
      sourceId: ice.id,
      controller: "corp",
      mandatory: true,
      payload: {
        kind: "stored_conditional",
        effectKey: "onEncounterEndIfNotFullyBroken",
      } satisfies PendingAbilityPayload,
    });
    state.log.push(
      `${ice.title} becomes pending — encounter ends without full break.`,
    );
  }
}

/** Ice onEncounterEndIfPrintedSubroutineBroken (phase 3). */
export function markEncounterEndPrintedSubroutineBroken(
  state: GameState,
  diff: CheckpointDiff,
): void {
  const match = evaluateTriggerPredicate(
    state,
    diff,
    PREDICATE_ENCOUNTER_END_PRINTED_SUBROUTINE_BROKEN,
  );
  if (
    match.kind !== "encounter_end_printed_subroutine_broken" ||
    match.iceIds.length === 0
  ) {
    state.turn.encounterEndPrintedSubBrokenPendingIds = [];
    return;
  }
  const iceIds = match.iceIds;
  state.turn.encounterEndPrintedSubBrokenPendingIds = [];
  for (const iceId of iceIds) {
    if (abilitiesSuppressed(state, iceId)) continue;
    const ice = state.cards[iceId];
    if (!ice?.onEncounterEndIfPrintedSubroutineBroken) continue;
    createPendingAbilityInstance(state, {
      abilityKey: "on-encounter-end-if-printed-subroutine-broken",
      sourceId: ice.id,
      controller: "corp",
      mandatory: true,
      payload: {
        kind: "stored_conditional",
        effectKey: "onEncounterEndIfPrintedSubroutineBroken",
      } satisfies PendingAbilityPayload,
    });
    state.log.push(
      `${ice.title} becomes pending — printed subroutine broken this encounter.`,
    );
  }
}

/** Hosted onHostEncounter (phase 3). */
export function markHostEncounter(
  state: GameState,
  diff: CheckpointDiff,
): void {
  const match = evaluateTriggerPredicate(state, diff, PREDICATE_HOST_ENCOUNTER);
  if (match.kind !== "host_encounter" || match.iceIds.length === 0) {
    state.turn.hostEncounterPendingIceIds = [];
    return;
  }
  const iceIds = match.iceIds;
  state.turn.hostEncounterPendingIceIds = [];
  for (const iceId of iceIds) {
    const ice = state.cards[iceId];
    if (!ice) continue;
    const hosteds = [
      ...state.runner.installed.filter(
        (tid) => state.cards[tid]?.hostId === iceId,
      ),
      ...(ice.hostedCardIds ?? []),
    ];
    const seen = new Set<string>();
    for (const tid of hosteds) {
      if (seen.has(tid)) continue;
      seen.add(tid);
      if (abilitiesSuppressed(state, tid)) continue;
      const hosted = state.cards[tid];
      if (!hosted?.onHostEncounter || hosted.hostId !== iceId) continue;
      createPendingAbilityInstance(state, {
        abilityKey: "on-host-encounter",
        sourceId: hosted.id,
        controller: "runner",
        mandatory: true,
        payload: {
          kind: "stored_conditional",
          effectKey: "onHostEncounter",
        } satisfies PendingAbilityPayload,
      });
      state.log.push(`${hosted.title} becomes pending — host ice encountered.`);
    }
  }
}

/** Runner identity onEncounterRezzedAfterApproach (phase 3). */
export function markEncounterRezzedAfterApproach(
  state: GameState,
  diff: CheckpointDiff,
): void {
  const match = evaluateTriggerPredicate(
    state,
    diff,
    PREDICATE_ENCOUNTER_REZZED_AFTER_APPROACH,
  );
  if (match.kind !== "encounter_rezzed_after_approach" || !match.matched) {
    state.turn.encounterRezzedAfterApproachMetPending = false;
    return;
  }
  state.turn.encounterRezzedAfterApproachMetPending = false;
  const id = state.runner.identityId;
  if (abilitiesSuppressed(state, id)) return;
  const card = state.cards[id];
  if (!card?.onEncounterRezzedAfterApproach) return;
  createPendingAbilityInstance(state, {
    abilityKey: "on-encounter-rezzed-after-approach",
    sourceId: card.id,
    controller: "runner",
    mandatory: true,
    payload: {
      kind: "stored_conditional",
      effectKey: "onEncounterRezzedAfterApproach",
    } satisfies PendingAbilityPayload,
  });
  state.log.push(
    `${card.title} becomes pending — encounter ice rezzed after approach.`,
  );
}

/** Root onApproachServer (phase 3). */
export function markApproachServer(
  state: GameState,
  diff: CheckpointDiff,
): void {
  const match = evaluateTriggerPredicate(
    state,
    diff,
    PREDICATE_APPROACH_SERVER,
  );
  if (match.kind !== "approach_server" || match.cardIds.length === 0) {
    state.turn.approachServerPendingIds = [];
    return;
  }
  const cardIds = match.cardIds;
  state.turn.approachServerPendingIds = [];
  for (const cardId of cardIds) {
    if (abilitiesSuppressed(state, cardId)) continue;
    const card = state.cards[cardId];
    if (!card?.rezzed || !card.onApproachServer) continue;
    createPendingAbilityInstance(state, {
      abilityKey: "on-approach-server",
      sourceId: card.id,
      controller: "corp",
      mandatory: true,
      payload: {
        kind: "stored_conditional",
        effectKey: "onApproachServer",
      } satisfies PendingAbilityPayload,
    });
    state.log.push(`${card.title} becomes pending — server approached.`);
  }
}

/** Root onPassAllIceProtectingServer (phase 3). */
export function markPassAllIceProtectingServer(
  state: GameState,
  diff: CheckpointDiff,
): void {
  const match = evaluateTriggerPredicate(
    state,
    diff,
    PREDICATE_PASS_ALL_ICE_PROTECTING_SERVER,
  );
  if (
    match.kind !== "pass_all_ice_protecting_server" ||
    match.serverIds.length === 0
  ) {
    state.turn.passAllIceProtectingServerPendingIds = [];
    return;
  }
  const serverIds = match.serverIds;
  state.turn.passAllIceProtectingServerPendingIds = [];
  for (const serverId of serverIds) {
    const server = state.servers[serverId as keyof typeof state.servers];
    for (const id of server?.root ?? []) {
      if (abilitiesSuppressed(state, id)) continue;
      const card = state.cards[id];
      if (!card?.rezzed || !card.onPassAllIceProtectingServer) continue;
      createPendingAbilityInstance(state, {
        abilityKey: "on-pass-all-ice-protecting-server",
        sourceId: card.id,
        controller: "corp",
        mandatory: true,
        payload: {
          kind: "stored_conditional",
          effectKey: "onPassAllIceProtectingServer",
        } satisfies PendingAbilityPayload,
      });
      state.log.push(
        `${card.title} becomes pending — all ice protecting this server passed.`,
      );
    }
  }
}

/** Ice / Runner onBypass (phase 3). */
export function markBypass(state: GameState, diff: CheckpointDiff): void {
  const match = evaluateTriggerPredicate(state, diff, PREDICATE_BYPASS);
  if (match.kind !== "bypass" || match.sourceIds.length === 0) {
    state.turn.bypassPendingSourceIds = [];
    return;
  }
  const sourceIds = match.sourceIds;
  state.turn.bypassPendingSourceIds = [];
  for (const id of sourceIds) {
    if (abilitiesSuppressed(state, id)) continue;
    const card = state.cards[id];
    if (!card?.onBypass) continue;
    const isCorpIce =
      card.side === "corp" ||
      (card.type === "ice" && !state.runner.installed.includes(id));
    createPendingAbilityInstance(state, {
      abilityKey: "on-bypass",
      sourceId: card.id,
      controller: isCorpIce ? "corp" : "runner",
      mandatory: true,
      payload: {
        kind: "stored_conditional",
        effectKey: "onBypass",
      } satisfies PendingAbilityPayload,
    });
    state.log.push(
      isCorpIce
        ? `${card.title} becomes pending — bypassed.`
        : `${card.title} becomes pending — ice bypassed.`,
    );
  }
}

/** Root onApproachIce (phase 3). */
export function markApproachIce(state: GameState, diff: CheckpointDiff): void {
  const match = evaluateTriggerPredicate(state, diff, PREDICATE_APPROACH_ICE);
  if (match.kind !== "approach_ice" || match.cardIds.length === 0) {
    state.turn.approachIcePendingIds = [];
    return;
  }
  const cardIds = match.cardIds;
  state.turn.approachIcePendingIds = [];
  for (const cardId of cardIds) {
    if (abilitiesSuppressed(state, cardId)) continue;
    const card = state.cards[cardId];
    if (!card?.rezzed || !card.onApproachIce) continue;
    createPendingAbilityInstance(state, {
      abilityKey: "on-approach-ice",
      sourceId: card.id,
      controller: "corp",
      mandatory: true,
      payload: {
        kind: "stored_conditional",
        effectKey: "onApproachIce",
      } satisfies PendingAbilityPayload,
    });
    state.log.push(`${card.title} becomes pending — ice approached.`);
  }
}

/** First successful R&D run end this turn (phase 3). */
export function markFirstSuccessfulRdRunEnd(
  state: GameState,
  diff: CheckpointDiff,
): void {
  const match = evaluateTriggerPredicate(
    state,
    diff,
    PREDICATE_FIRST_SUCCESSFUL_RD_RUN_END,
  );
  if (match.kind !== "first_successful_rd_run_end" || !match.matched) {
    state.turn.firstSuccessfulRdRunEndMetPending = false;
    return;
  }
  state.turn.firstSuccessfulRdRunEndMetPending = false;
  state.turn.firstSuccessfulRdRunEndUsedThisTurn = true;
  for (const rid of state.runner.installed) {
    if (abilitiesSuppressed(state, rid)) continue;
    const card = state.cards[rid];
    if (!card?.onFirstSuccessfulRunOnRdEndsThisTurn) continue;
    createPendingAbilityInstance(state, {
      abilityKey: "on-first-successful-run-on-rd-ends-this-turn",
      sourceId: card.id,
      controller: "runner",
      mandatory: true,
      payload: {
        kind: "stored_conditional",
        effectKey: "onFirstSuccessfulRunOnRdEndsThisTurn",
      } satisfies PendingAbilityPayload,
    });
    state.log.push(
      `${card.title} becomes pending — first successful R&D run ends this turn.`,
    );
  }
}

/** Runner onSuccessfulRunOnRd (phase 3). */
export function markSuccessfulRunOnRd(
  state: GameState,
  diff: CheckpointDiff,
): void {
  const match = evaluateTriggerPredicate(
    state,
    diff,
    PREDICATE_SUCCESSFUL_RUN_ON_RD,
  );
  if (match.kind !== "successful_run_on_rd" || match.cardIds.length === 0) {
    state.turn.successfulRunOnRdPendingIds = [];
    return;
  }
  const cardIds = match.cardIds;
  state.turn.successfulRunOnRdPendingIds = [];
  for (const cardId of cardIds) {
    if (abilitiesSuppressed(state, cardId)) continue;
    const card = state.cards[cardId];
    if (!card?.onSuccessfulRunOnRd) continue;
    createPendingAbilityInstance(state, {
      abilityKey: "on-successful-run-on-rd",
      sourceId: card.id,
      controller: "runner",
      mandatory: true,
      payload: {
        kind: "stored_conditional",
        effectKey: "onSuccessfulRunOnRd",
      } satisfies PendingAbilityPayload,
    });
    state.log.push(`${card.title} becomes pending — successful run on R&D.`);
  }
}

/** Runner onSuccessfulRunEndOncePerTurn (phase 3). */
export function markSuccessfulRunEndOnce(
  state: GameState,
  diff: CheckpointDiff,
): void {
  const match = evaluateTriggerPredicate(
    state,
    diff,
    PREDICATE_SUCCESSFUL_RUN_END_ONCE,
  );
  if (match.kind !== "successful_run_end_once" || match.cardIds.length === 0) {
    state.turn.successfulRunEndOncePendingIds = [];
    return;
  }
  const cardIds = match.cardIds;
  state.turn.successfulRunEndOncePendingIds = [];
  for (const cardId of cardIds) {
    if (abilitiesSuppressed(state, cardId)) continue;
    const card = state.cards[cardId];
    if (!card?.onSuccessfulRunEndOncePerTurn) continue;
    createPendingAbilityInstance(state, {
      abilityKey: "on-successful-run-end-once",
      sourceId: card.id,
      controller: "runner",
      mandatory: true,
      payload: {
        kind: "stored_conditional",
        effectKey: "onSuccessfulRunEndOncePerTurn",
      } satisfies PendingAbilityPayload,
    });
    state.log.push(`${card.title} becomes pending — successful run ends.`);
  }
}

/** Corp onSuccessfulRunEnd (phase 3). */
export function markSuccessfulRunEnd(
  state: GameState,
  diff: CheckpointDiff,
): void {
  const match = evaluateTriggerPredicate(
    state,
    diff,
    PREDICATE_SUCCESSFUL_RUN_END,
  );
  if (match.kind !== "successful_run_end" || match.cardIds.length === 0) {
    state.turn.successfulRunEndPendingIds = [];
    return;
  }
  const cardIds = match.cardIds;
  state.turn.successfulRunEndPendingIds = [];
  for (const cardId of cardIds) {
    if (abilitiesSuppressed(state, cardId)) continue;
    const card = state.cards[cardId];
    if (!card?.rezzed || !card.onSuccessfulRunEnd) continue;
    createPendingAbilityInstance(state, {
      abilityKey: "on-successful-run-end",
      sourceId: card.id,
      controller: "corp",
      mandatory: true,
      payload: {
        kind: "stored_conditional",
        effectKey: "onSuccessfulRunEnd",
      } satisfies PendingAbilityPayload,
    });
    state.log.push(`${card.title} becomes pending — successful run ends.`);
  }
}

/** Root onSuccessfulRunOtherServerOncePerTurn (phase 3). */
export function markOtherServerSuccess(
  state: GameState,
  diff: CheckpointDiff,
): void {
  const match = evaluateTriggerPredicate(
    state,
    diff,
    PREDICATE_OTHER_SERVER_SUCCESS,
  );
  if (match.kind !== "other_server_success" || match.cardIds.length === 0) {
    state.turn.otherServerSuccessPendingIds = [];
    return;
  }
  const cardIds = match.cardIds;
  state.turn.otherServerSuccessPendingIds = [];
  for (const cardId of cardIds) {
    if (abilitiesSuppressed(state, cardId)) continue;
    const card = state.cards[cardId];
    if (!card?.onSuccessfulRunOtherServerOncePerTurn) continue;
    if (!card.faceup && !card.rezzed) continue;
    createPendingAbilityInstance(state, {
      abilityKey: "on-successful-run-other-server",
      sourceId: card.id,
      controller: "corp",
      mandatory: true,
      payload: {
        kind: "stored_conditional",
        effectKey: "onSuccessfulRunOtherServerOncePerTurn",
      } satisfies PendingAbilityPayload,
    });
    state.log.push(
      `${card.title} becomes pending — successful run on another server.`,
    );
  }
}

/** onSuccessfulRun (phase 3). */
export function markSuccessfulRun(
  state: GameState,
  diff: CheckpointDiff,
): void {
  const match = evaluateTriggerPredicate(state, diff, PREDICATE_SUCCESSFUL_RUN);
  if (match.kind !== "successful_run" || match.cardIds.length === 0) {
    state.turn.successfulRunPendingIds = [];
    return;
  }
  const cardIds = match.cardIds;
  state.turn.successfulRunPendingIds = [];
  for (const cardId of cardIds) {
    if (abilitiesSuppressed(state, cardId)) continue;
    const card = state.cards[cardId];
    if (!card?.onSuccessfulRun) continue;
    createPendingAbilityInstance(state, {
      abilityKey: "on-successful-run",
      sourceId: card.id,
      controller: card.side === "corp" ? "corp" : "runner",
      mandatory: true,
      payload: {
        kind: "stored_conditional",
        effectKey: "onSuccessfulRun",
      } satisfies PendingAbilityPayload,
    });
    state.log.push(`${card.title} becomes pending — successful run.`);
  }
}

/** onRunBegin (phase 3). */
export function markRunBegin(state: GameState, diff: CheckpointDiff): void {
  const match = evaluateTriggerPredicate(state, diff, PREDICATE_RUN_BEGIN);
  if (match.kind !== "run_begin" || match.cardIds.length === 0) {
    state.turn.runBeginPendingIds = [];
    return;
  }
  const cardIds = match.cardIds;
  state.turn.runBeginPendingIds = [];
  for (const cardId of cardIds) {
    if (abilitiesSuppressed(state, cardId)) continue;
    const card = state.cards[cardId];
    if (!card?.onRunBegin) continue;
    createPendingAbilityInstance(state, {
      abilityKey: "on-run-begin",
      sourceId: card.id,
      controller: card.side === "corp" ? "corp" : "runner",
      mandatory: true,
      payload: {
        kind: "stored_conditional",
        effectKey: "onRunBegin",
      } satisfies PendingAbilityPayload,
    });
    state.log.push(`${card.title} becomes pending — run begins.`);
  }
}

/** Corp root successful-run server abilities (phase 3). */
export function markSuccessfulRunServer(
  state: GameState,
  diff: CheckpointDiff,
): void {
  const match = evaluateTriggerPredicate(
    state,
    diff,
    PREDICATE_SUCCESSFUL_RUN_SERVER,
  );
  if (match.kind !== "successful_run_server" || match.marks.length === 0) {
    state.turn.successfulRunServerPending = [];
    return;
  }
  const marks = match.marks;
  state.turn.successfulRunServerPending = [];
  for (const m of marks) {
    if (abilitiesSuppressed(state, m.cardId)) continue;
    const card = state.cards[m.cardId];
    if (!card) continue;
    createPendingAbilityInstance(state, {
      abilityKey: m.abilityKey,
      sourceId: card.id,
      controller: "corp",
      mandatory: m.mandatory,
      payload: {
        kind: "stored_conditional",
        effectKey: m.effectKey as StoredConditionalEffectKey,
      } satisfies PendingAbilityPayload,
    });
    state.log.push(m.logLine);
  }
}
