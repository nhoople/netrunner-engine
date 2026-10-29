/**
 * Run-timing conditionals (encounter / pass / approach / successful-run
 * first-*) marked onto the pending bag (CR 9.6.2).
 */
import { abilitiesSuppressed } from "./abilities.js";
import type { GameState, StoredConditionalEffectKey } from "./types.js";
import {
  fireCardConditional,
  fireStoredConditionals,
  type StoredConditionalMark,
} from "./storedTriggers.js";

function mark(
  state: GameState,
  sourceId: string,
  effectKey: StoredConditionalEffectKey,
  abilityKey: string,
  logSuffix: string,
  controller: "corp" | "runner" = "runner",
): StoredConditionalMark | null {
  const card = state.cards[sourceId];
  if (!card) return null;
  return {
    abilityKey,
    sourceId,
    controller,
    mandatory: true,
    effectKey,
    logLine: `${card.title} becomes pending — ${logSuffix}.`,
  };
}

/** Knowledge Seeker / bypass encounter-end. */
export function fireOnEncounterEndIfRezzed(
  state: GameState,
  iceId: string,
): boolean {
  const ice = state.cards[iceId];
  if (!ice?.onEncounterEnd || !ice.rezzed) return false;
  return fireCardConditional(
    state,
    iceId,
    "onEncounterEnd",
    "on-encounter-end",
    `${ice.title} becomes pending — encounter ends.`,
    "corp",
  );
}

export function fireOnEncounterEndIfRezzedThisTurn(
  state: GameState,
  iceId: string,
): boolean {
  const ice = state.cards[iceId];
  if (!ice?.onEncounterEndIfRezzedThisTurn) return false;
  return fireCardConditional(
    state,
    iceId,
    "onEncounterEndIfRezzedThisTurn",
    "on-encounter-end-if-rezzed-this-turn",
    `${ice.title} becomes pending — encounter ends (rezzed this turn).`,
    "corp",
  );
}

export function fireOnEncounterEndIfNotFullyBroken(
  state: GameState,
  iceId: string,
): boolean {
  const ice = state.cards[iceId];
  if (!ice?.onEncounterEndIfNotFullyBroken) return false;
  return fireCardConditional(
    state,
    iceId,
    "onEncounterEndIfNotFullyBroken",
    "on-encounter-end-if-not-fully-broken",
    `${ice.title} becomes pending — encounter ends without full break.`,
    "corp",
  );
}

export function fireOnEncounterEndIfPrintedSubroutineBroken(
  state: GameState,
  iceId: string,
): boolean {
  const ice = state.cards[iceId];
  if (!ice?.onEncounterEndIfPrintedSubroutineBroken) return false;
  return fireCardConditional(
    state,
    iceId,
    "onEncounterEndIfPrintedSubroutineBroken",
    "on-encounter-end-if-printed-subroutine-broken",
    `${ice.title} becomes pending — printed subroutine broken this encounter.`,
    "corp",
  );
}

export function fireOnEncounterRezzedAfterApproach(state: GameState): boolean {
  const id = state.runner.identityId;
  const card = state.cards[id];
  if (!card?.onEncounterRezzedAfterApproach) return false;
  return fireCardConditional(
    state,
    id,
    "onEncounterRezzedAfterApproach",
    "on-encounter-rezzed-after-approach",
    `${card.title} becomes pending — encounter ice rezzed after approach.`,
  );
}

/** Baklan-class: first actual encounter each run. */
export function fireOnFirstEncounterEachRun(state: GameState): boolean {
  const items: StoredConditionalMark[] = [];
  for (const rid of state.runner.installed) {
    if (abilitiesSuppressed(state, rid)) continue;
    const card = state.cards[rid];
    if (!card?.onFirstEncounterEachRun) continue;
    const m = mark(
      state,
      rid,
      "onFirstEncounterEachRun",
      "on-first-encounter-each-run",
      "first encounter this run",
    );
    if (m) items.push(m);
  }
  return fireStoredConditionals(state, items);
}

/** Chisel / Eavesdrop: hosted onHostEncounter. */
export function fireOnHostEncounter(
  state: GameState,
  iceId: string,
): boolean {
  const ice = state.cards[iceId];
  if (!ice) return false;
  const hosteds = [
    ...state.runner.installed.filter((tid) => state.cards[tid]?.hostId === iceId),
    ...(ice.hostedCardIds ?? []),
  ];
  const items: StoredConditionalMark[] = [];
  const seen = new Set<string>();
  for (const tid of hosteds) {
    if (seen.has(tid)) continue;
    seen.add(tid);
    if (abilitiesSuppressed(state, tid)) continue;
    const hosted = state.cards[tid];
    if (!hosted?.onHostEncounter || hosted.hostId !== iceId) continue;
    const m = mark(
      state,
      tid,
      "onHostEncounter",
      "on-host-encounter",
      "host ice encountered",
    );
    if (m) items.push(m);
  }
  return fireStoredConditionals(state, items);
}

export function fireOnFirstPassIceEachTurn(state: GameState): boolean {
  const khan = state.cards[state.runner.identityId];
  if (!khan?.onFirstPassIceEachTurn) return false;
  return fireCardConditional(
    state,
    khan.id,
    "onFirstPassIceEachTurn",
    "on-first-pass-ice-each-turn",
    `${khan.title} becomes pending — first ice passed this turn.`,
  );
}

export function fireOnPassUnrezzedIce(state: GameState): boolean {
  const items: StoredConditionalMark[] = [];
  for (const rid of [...state.runner.installed]) {
    // CR 9.12.1d — blanked sources do not mark (fire path also suppresses).
    if (abilitiesSuppressed(state, rid)) continue;
    const card = state.cards[rid];
    if (!card?.onPassUnrezzedIce) continue;
    const m = mark(
      state,
      rid,
      "onPassUnrezzedIce",
      "on-pass-unrezzed-ice",
      "unrezzed ice passed",
    );
    if (m) items.push(m);
  }
  return fireStoredConditionals(state, items);
}

export function fireOnPassRezzedIce(state: GameState): boolean {
  const items: StoredConditionalMark[] = [];
  for (const rid of [...state.runner.installed]) {
    if (abilitiesSuppressed(state, rid)) continue;
    const card = state.cards[rid];
    if (!card?.onPassRezzedIce) continue;
    const m = mark(
      state,
      rid,
      "onPassRezzedIce",
      "on-pass-rezzed-ice",
      "rezzed ice passed",
    );
    if (m) items.push(m);
  }
  return fireStoredConditionals(state, items);
}

export function fireOnFirstPassRezzedCodeGateOrSentryThisTurn(
  state: GameState,
  scoredId: string,
): boolean {
  const scored = state.cards[scoredId];
  if (!scored?.onFirstPassRezzedCodeGateOrSentryThisTurn) return false;
  return fireCardConditional(
    state,
    scoredId,
    "onFirstPassRezzedCodeGateOrSentryThisTurn",
    "on-first-pass-rezzed-code-gate-or-sentry-this-turn",
    `${scored.title} becomes pending — first pass of rezzed code gate or sentry this turn.`,
    "corp",
  );
}

export function fireOnPassRezzedIceProtectingThisServer(
  state: GameState,
  serverId: string,
): boolean {
  const server = state.servers[serverId as keyof typeof state.servers];
  const items: StoredConditionalMark[] = [];
  for (const upId of server?.root ?? []) {
    // CR 9.12.1d — blanked upgrades do not mark (fire path also suppresses).
    if (abilitiesSuppressed(state, upId)) continue;
    const up = state.cards[upId];
    if (!up?.rezzed || !up.onPassRezzedIceProtectingThisServer) continue;
    const m = mark(
      state,
      upId,
      "onPassRezzedIceProtectingThisServer",
      "on-pass-rezzed-ice-protecting-this-server",
      "rezzed ice protecting this server passed",
      "corp",
    );
    if (m) items.push(m);
  }
  return fireStoredConditionals(state, items);
}

export function fireOnPassAllIceProtectingServer(
  state: GameState,
  serverId: string,
): boolean {
  const server = state.servers[serverId as keyof typeof state.servers];
  const items: StoredConditionalMark[] = [];
  for (const id of server?.root ?? []) {
    if (abilitiesSuppressed(state, id)) continue;
    const card = state.cards[id];
    if (!card?.rezzed || !card.onPassAllIceProtectingServer) continue;
    const m = mark(
      state,
      id,
      "onPassAllIceProtectingServer",
      "on-pass-all-ice-protecting-server",
      "all ice protecting this server passed",
      "corp",
    );
    if (m) items.push(m);
  }
  return fireStoredConditionals(state, items);
}

/** Nanisivik-class: one rezzed root onApproachServer (caller applies once-per limits). */
export function fireOnApproachServer(
  state: GameState,
  cardId: string,
): boolean {
  const card = state.cards[cardId];
  if (!card?.onApproachServer) return false;
  return fireCardConditional(
    state,
    cardId,
    "onApproachServer",
    "on-approach-server",
    `${card.title} becomes pending — server approached.`,
    "corp",
  );
}

function fireRunnerAndIdentity(
  state: GameState,
  effectKey: StoredConditionalEffectKey,
  abilityKey: string,
  logSuffix: string,
): boolean {
  const items: StoredConditionalMark[] = [];
  for (const id of [...state.runner.installed, state.runner.identityId]) {
    if (abilitiesSuppressed(state, id)) continue;
    const m = mark(state, id, effectKey, abilityKey, logSuffix);
    if (m) items.push(m);
  }
  return fireStoredConditionals(state, items);
}

export function fireOnFirstSuccessfulMarkRunThisTurn(state: GameState): boolean {
  return fireRunnerAndIdentity(
    state,
    "onFirstSuccessfulMarkRunThisTurn",
    "on-first-successful-mark-run-this-turn",
    "first successful run on the mark this turn",
  );
}

export function fireOnFirstSuccessfulHqRunThisTurn(state: GameState): boolean {
  return fireRunnerAndIdentity(
    state,
    "onFirstSuccessfulHqRunThisTurn",
    "on-first-successful-hq-run-this-turn",
    "first successful HQ run this turn",
  );
}

export function fireOnFirstSuccessfulHqOrRdRunThisTurn(
  state: GameState,
): boolean {
  return fireRunnerAndIdentity(
    state,
    "onFirstSuccessfulHqOrRdRunThisTurn",
    "on-first-successful-hq-or-rd-run-this-turn",
    "first successful HQ or R&D run this turn",
  );
}

export function fireOnFirstSuccessfulCentralRunThisTurn(
  state: GameState,
): boolean {
  return fireRunnerAndIdentity(
    state,
    "onFirstSuccessfulCentralRunThisTurn",
    "on-first-successful-central-run-this-turn",
    "first successful central run this turn",
  );
}

export function fireOnFirstUnsuccessfulRunThisTurn(state: GameState): boolean {
  return fireRunnerAndIdentity(
    state,
    "onFirstUnsuccessfulRunThisTurn",
    "on-first-unsuccessful-run-this-turn",
    "first unsuccessful run this turn",
  );
}

export function fireOnFirstSuccessfulRunOnRdEndsThisTurn(
  state: GameState,
): boolean {
  const items: StoredConditionalMark[] = [];
  for (const rid of state.runner.installed) {
    const card = state.cards[rid];
    if (!card?.onFirstSuccessfulRunOnRdEndsThisTurn) continue;
    const m = mark(
      state,
      rid,
      "onFirstSuccessfulRunOnRdEndsThisTurn",
      "on-first-successful-run-on-rd-ends-this-turn",
      "first successful R&D run ends this turn",
    );
    if (m) items.push(m);
  }
  return fireStoredConditionals(state, items);
}

/**
 * First/second successful run this turn (Pravdivost / genetics). Caller
 * supplies which source ids may fire given the current count threshold.
 */
export function fireOnFirstSuccessfulRunThisTurn(
  state: GameState,
  sourceIds: string[],
): boolean {
  const items: StoredConditionalMark[] = [];
  for (const id of sourceIds) {
    if (abilitiesSuppressed(state, id)) continue;
    const card = state.cards[id];
    if (!card?.onFirstSuccessfulRunThisTurn) continue;
    const m = mark(
      state,
      id,
      "onFirstSuccessfulRunThisTurn",
      "on-first-successful-run-this-turn",
      "first successful run this turn",
      card.side === "corp" ? "corp" : "runner",
    );
    if (m) items.push(m);
  }
  return fireStoredConditionals(state, items);
}
