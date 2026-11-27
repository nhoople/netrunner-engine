/**
 * Run-timing conditionals (encounter / pass / approach / successful-run
 * first-*) marked onto the pending bag (CR 9.6.2).
 */
import { abilitiesSuppressed } from "../continuous/abilities.js";
import type { GameState } from "../types/game.js";
import type { StoredConditionalEffectKey } from "../types/pendingAbilities.js";
import {
  effectFromKey,
  type StoredConditionalMark,
} from "../triggers/storedTriggers.js";
import { noteStoredConditionals } from "../triggers/storedConditionalHooks.js";
import { checkpointAfterInstruction } from "../../legality/checkpoints.js";

function noteAndCheckpointStored(
  state: GameState,
  items: StoredConditionalMark[],
  openedBy: string,
): boolean {
  noteStoredConditionals(state, items);
  if ((state.turn.storedConditionalPending ?? []).length === 0) return false;
  checkpointAfterInstruction(state, openedBy);
  return Boolean(
    state.pendingChoice ||
    state.pendingTags ||
    state.pendingDamage ||
    state.psi ||
    state.trace ||
    state.done,
  );
}

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
  // Only a card that has this ability can meet its condition (CR 9.6.2).
  if (!effectFromKey(card, effectKey)) return null;
  return {
    abilityKey,
    sourceId,
    controller,
    mandatory: true,
    effectKey,
    logLine: `${card.title} becomes pending — ${logSuffix}.`,
  };
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
  return noteAndCheckpointStored(state, items, "runTiming.stored");
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
  return noteAndCheckpointStored(state, items, "runTiming.stored");
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
  return noteAndCheckpointStored(state, items, "runTiming.stored");
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
  return noteAndCheckpointStored(state, items, "runTiming.stored");
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
  return noteAndCheckpointStored(state, items, "runTiming.stored");
}

export function fireOnFirstSuccessfulHqRunThisTurn(state: GameState): boolean {
  return fireRunnerAndIdentity(
    state,
    "onFirstSuccessfulHqRunThisTurn",
    "on-first-successful-hq-run-this-turn",
    "first successful HQ run this turn",
  );
}
