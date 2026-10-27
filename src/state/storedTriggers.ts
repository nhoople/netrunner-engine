/**
 * Conditional abilities whose card data is loaded and whose moment is a
 * shared procedure: the ability becomes pending when that moment happens.
 */
import { evalEffect } from "../effects/eval.js";
import type { Effect } from "../effects/ir.js";
import { abilitiesSuppressed } from "./abilities.js";
import { log } from "./createGame.js";
import type {
  CardInstance,
  GameState,
  PendingAbilityPayload,
  ServerId,
  Side,
  StoredConditionalEffectKey,
} from "./types.js";
import { CR } from "../timing/labels.js";
import {
  closeReactionWindow,
  completePendingAbility,
  createPendingAbilityInstance,
  findPendingAbility,
  markPendingAbilityResolving,
  openReactionWindow,
  pendingAbilitiesWithStatus,
  pruneSettledPendingAbilities,
} from "./pendingAbilities.js";

export type StoredEffectKey = StoredConditionalEffectKey;

function effectFromKey(
  card: CardInstance,
  key: StoredConditionalEffectKey,
): Effect | undefined {
  if (key === "runEvent.onFirstEncounterThisRun") {
    return card.runEvent?.onFirstEncounterThisRun;
  }
  if (key === "identityFlippedHooks.onFirstOperationPlayThisTurn") {
    return card.identityFlippedHooks?.onFirstOperationPlayThisTurn;
  }
  if (key === "identityFlippedHooks.onSuccessfulHqOrRdRun") {
    return card.identityFlippedHooks?.onSuccessfulHqOrRdRun;
  }
  if (key === "identityFlippedHooks.onSuccessfulHqRun") {
    return card.identityFlippedHooks?.onSuccessfulHqRun;
  }
  return card[key as keyof CardInstance] as Effect | undefined;
}

function interruptOpen(state: GameState): boolean {
  return Boolean(
    state.pendingChoice ||
      state.pendingTags ||
      state.pendingDamage ||
      state.psi ||
      state.trace ||
      state.done,
  );
}

export type StoredConditionalMark = {
  abilityKey: string;
  sourceId: string;
  controller: Side;
  mandatory: boolean;
  effectKey: StoredConditionalEffectKey;
  logLine: string;
};

/**
 * Mark each item pending, open one reaction window, resolve in order
 * (CR 9.6.2 / 9.2.8a). Returns true if an interrupt opened mid-resolve.
 */
export function fireStoredConditionals(
  state: GameState,
  items: StoredConditionalMark[],
): boolean {
  if (items.length === 0) return false;
  const createdIds: string[] = [];
  for (const item of items) {
    if (abilitiesSuppressed(state, item.sourceId)) continue;
    const card = state.cards[item.sourceId];
    const effect = card ? effectFromKey(card, item.effectKey) : undefined;
    if (!card || !effect) continue;
    const inst = createPendingAbilityInstance(state, {
      abilityKey: item.abilityKey,
      sourceId: item.sourceId,
      controller: item.controller,
      mandatory: item.mandatory,
      payload: {
        kind: "stored_conditional",
        effectKey: item.effectKey,
      } satisfies PendingAbilityPayload,
    });
    createdIds.push(inst.id);
    log(state, item.logLine);
  }
  if (createdIds.length === 0) return false;
  return resolveStoredConditionalPendings(state, createdIds);
}

function resolveStoredConditionalPendings(
  state: GameState,
  pendingIds: string[],
): boolean {
  const frame = openReactionWindow(state, pendingIds, null);
  for (const pendingId of pendingIds) {
    const inst = findPendingAbility(state, pendingId);
    if (!inst || inst.status !== "pending") continue;
    if (inst.payload?.kind !== "stored_conditional") {
      completePendingAbility(state, pendingId, "cancelled");
      continue;
    }
    markPendingAbilityResolving(state, pendingId);
    const card = state.cards[inst.sourceId];
    const effect = card
      ? effectFromKey(card, inst.payload.effectKey)
      : undefined;
    if (effect && !abilitiesSuppressed(state, inst.sourceId)) {
      const resolved = evalEffect({ state, sourceId: inst.sourceId }, effect);
      if (!resolved.ok) {
        log(
          state,
          `${card?.title ?? inst.sourceId} failed: ${resolved.error}`,
        );
      }
    }
    completePendingAbility(state, pendingId, "done");
    if (interruptOpen(state)) {
      closeReactionWindow(state, frame.id);
      pruneSettledPendingAbilities(state);
      return true;
    }
  }
  closeReactionWindow(state, frame.id);
  pruneSettledPendingAbilities(state);
  return false;
}

/** Resume stored_conditional instances left pending after a nested interrupt. */
export function resumePendingStoredConditionals(state: GameState): void {
  if (interruptOpen(state)) return;
  const bag = pendingAbilitiesWithStatus(state, "pending").filter(
    (p) => p.payload?.kind === "stored_conditional",
  );
  if (bag.length === 0) return;
  resolveStoredConditionalPendings(
    state,
    bag.map((p) => p.id),
  );
}

export function fireScoreTurnEnd(state: GameState): void {
  const items: StoredConditionalMark[] = [];
  for (const id of [...state.corp.scoreArea]) {
    const card = state.cards[id];
    if (!card?.scoredThisTurn || !card.onScoreTurnEnd) continue;
    card.scoredThisTurn = false;
    items.push({
      abilityKey: "on-score-turn-end",
      sourceId: id,
      controller: "corp",
      mandatory: true,
      effectKey: "onScoreTurnEnd",
      logLine: `${card.title} becomes pending — the turn it was scored ends (CR 11.2_3_d).`,
    });
  }
  fireStoredConditionals(state, items);
}

/** True when a replacement for taking bad publicity is now pending. */
export function fireWouldTakeBadPublicity(state: GameState): boolean {
  const items: StoredConditionalMark[] = [];
  for (const server of Object.values(state.servers)) {
    for (const id of [...server.root]) {
      const card = state.cards[id];
      if (!card?.rezzed || !card.onWouldTakeBadPublicity) continue;
      items.push({
        abilityKey: "on-would-take-bad-publicity",
        sourceId: id,
        controller: "corp",
        mandatory: true,
        effectKey: "onWouldTakeBadPublicity",
        logLine: `${card.title} becomes pending — the Corp would take bad publicity (CR 10.6).`,
      });
    }
  }
  return fireStoredConditionals(state, items);
}

export function fireRunnerCreditPoolEmpty(
  state: GameState,
  creditsBefore: number,
): void {
  if (creditsBefore <= 0 || state.runner.credits > 0) return;
  if (state.turn.runnerCreditPoolEmptyFiredThisTurn) return;
  state.turn.runnerCreditPoolEmptyFiredThisTurn = true;
  const items: StoredConditionalMark[] = [];
  const ids = [state.runner.identityId, ...state.runner.installed];
  for (const id of ids) {
    const card = state.cards[id];
    if (!card?.onFirstRunnerCreditPoolEmptyThisTurn) continue;
    items.push({
      abilityKey: "on-first-runner-credit-pool-empty",
      sourceId: id,
      controller: "runner",
      mandatory: true,
      effectKey: "onFirstRunnerCreditPoolEmptyThisTurn",
      logLine: `${card.title} becomes pending — the Runner's credit pool is empty for the first time this turn (CR 1.10).`,
    });
  }
  fireStoredConditionals(state, items);
}

export function fireSuccessfulRunServerAbilities(state: GameState): void {
  const run = state.run;
  if (!run || run.successful !== true) return;
  const server = state.servers[run.attackedServerId];
  if (!server) return;
  const items: StoredConditionalMark[] = [];
  for (const id of [...server.root]) {
    const card = state.cards[id];
    if (!card?.rezzed) continue;
    if (card.onSuccessfulRun) {
      items.push({
        abilityKey: "on-successful-run",
        sourceId: id,
        controller: "corp",
        mandatory: false,
        effectKey: "onSuccessfulRun",
        logLine: `${card.title} becomes pending — successful run on this server (CR ${CR.ifSuccessfulAbilityOptional.number}).`,
      });
    }
    if (card.onSuccessfulRunOnThisServer) {
      items.push({
        abilityKey: "on-successful-run-on-this-server",
        sourceId: id,
        controller: "corp",
        mandatory: true,
        effectKey: "onSuccessfulRunOnThisServer",
        logLine: `${card.title} becomes pending — successful run on this server (CR ${CR.successfulRun.number}).`,
      });
    }
    if (card.onSuccessfulRunThisServer) {
      items.push({
        abilityKey: "on-successful-run-this-server",
        sourceId: id,
        controller: "corp",
        mandatory: true,
        effectKey: "onSuccessfulRunThisServer",
        logLine: `${card.title} becomes pending — successful run on this server (CR ${CR.successfulRun.number}).`,
      });
    }
  }
  fireStoredConditionals(state, items);
}

export function fireUnsuccessfulRunServerAbilities(state: GameState): void {
  const run = state.run;
  if (!run) return;
  const server = state.servers[run.attackedServerId];
  if (!server) return;
  const items: StoredConditionalMark[] = [];
  for (const id of [...server.root]) {
    const card = state.cards[id];
    if (!card?.rezzed || !card.onUnsuccessfulRunOnThisServer) continue;
    items.push({
      abilityKey: "on-unsuccessful-run-on-this-server",
      sourceId: id,
      controller: "corp",
      mandatory: true,
      effectKey: "onUnsuccessfulRunOnThisServer",
      logLine: `${card.title} becomes pending — unsuccessful run on this server (CR ${CR.unsuccessfulRun.number}).`,
    });
  }
  fireStoredConditionals(state, items);
}

export function fireAccessedCardAbilities(state: GameState): void {
  const cardId = state.run?.accessingCardId;
  const card = cardId ? state.cards[cardId] : undefined;
  if (!cardId || !card) return;
  const installed =
    card.zone.includes(":root") ||
    card.zone.includes(":ice") ||
    card.zone.startsWith("hosted:");
  const items: StoredConditionalMark[] = [];
  if (installed && card.onAccessWhileInstalled) {
    items.push({
      abilityKey: "on-access-while-installed",
      sourceId: cardId,
      controller: "corp",
      mandatory: true,
      effectKey: "onAccessWhileInstalled",
      logLine: `${card.title} becomes pending — accessed while installed (CR 7.1).`,
    });
  }
  if (!installed && card.onAccessWhileUninstalled) {
    items.push({
      abilityKey: "on-access-while-uninstalled",
      sourceId: cardId,
      controller: "corp",
      mandatory: true,
      effectKey: "onAccessWhileUninstalled",
      logLine: `${card.title} becomes pending — accessed while not installed (CR 7.1).`,
    });
  }
  const fromRd = card.zone === "corp:rd" || state.corp.deck.includes(cardId);
  if (!fromRd && card.onAccessNotFromRd) {
    items.push({
      abilityKey: "on-access-not-from-rd",
      sourceId: cardId,
      controller: "corp",
      mandatory: true,
      effectKey: "onAccessNotFromRd",
      logLine: `${card.title} becomes pending — accessed from somewhere other than R&D (CR 7.1).`,
    });
  }
  fireStoredConditionals(state, items);
}

/**
 * Runner onCorpDrawCard conditionals (Bug): one pending instance per drawn
 * card × source (CR 9.6.2 / 8.4.1). Resolve in a nested reaction window;
 * if a choice opens, remaining instances stay pending for resume.
 */
export function fireCorpDrewCards(state: GameState, drawnCardIds: string[]): void {
  if (drawnCardIds.length === 0) return;
  const ids = [state.runner.identityId, ...state.runner.installed];
  const createdIds: string[] = [];
  for (const drawnId of drawnCardIds) {
    for (const id of ids) {
      const card = state.cards[id];
      if (!card?.onCorpDrawCard || abilitiesSuppressed(state, id)) continue;
      const inst = createPendingAbilityInstance(state, {
        abilityKey: "on-corp-draw-card",
        sourceId: id,
        controller: "runner",
        mandatory: false,
        payload: { kind: "on_corp_draw_card", drawnCardId: drawnId },
      });
      createdIds.push(inst.id);
      log(
        state,
        `${card.title} becomes pending — the Corp draws a card (CR ${CR.drawing.number}).`,
      );
    }
  }
  if (createdIds.length === 0) return;
  resolveOnCorpDrawCardPendings(state, createdIds);
}

/** Resume onCorpDrawCard instances left pending after a nested choice. */
export function resumePendingOnCorpDrawCard(state: GameState): void {
  if (interruptOpen(state)) return;
  const bag = pendingAbilitiesWithStatus(state, "pending").filter(
    (p) => p.payload?.kind === "on_corp_draw_card",
  );
  if (bag.length === 0) return;
  resolveOnCorpDrawCardPendings(
    state,
    bag.map((p) => p.id),
  );
}

function resolveOnCorpDrawCardPendings(
  state: GameState,
  pendingIds: string[],
): void {
  const frame = openReactionWindow(state, pendingIds, null);
  for (const pendingId of pendingIds) {
    const inst = findPendingAbility(state, pendingId);
    if (!inst || inst.status !== "pending") continue;
    if (inst.payload?.kind !== "on_corp_draw_card") {
      completePendingAbility(state, pendingId, "cancelled");
      continue;
    }
    markPendingAbilityResolving(state, pendingId);
    state.turn.pendingCorpDrawnCardId = inst.payload.drawnCardId;
    const card = state.cards[inst.sourceId];
    const effect = card?.onCorpDrawCard;
    if (effect && !abilitiesSuppressed(state, inst.sourceId)) {
      const resolved = evalEffect({ state, sourceId: inst.sourceId }, effect);
      if (!resolved.ok) {
        log(state, `${card?.title ?? inst.sourceId} failed: ${resolved.error}`);
      }
    }
    completePendingAbility(state, pendingId, "done");
    if (interruptOpen(state)) {
      closeReactionWindow(state, frame.id);
      pruneSettledPendingAbilities(state);
      return;
    }
  }
  state.turn.pendingCorpDrawnCardId = undefined;
  closeReactionWindow(state, frame.id);
  pruneSettledPendingAbilities(state);
}

export function fireExposeWhileInstalled(state: GameState, cardId: string): void {
  const card = state.cards[cardId];
  if (!card?.onExposeWhileInstalled) return;
  const installed =
    card.zone.includes(":root") || card.zone.includes(":ice");
  if (!installed) return;
  fireStoredConditionals(state, [
    {
      abilityKey: "on-expose-while-installed",
      sourceId: cardId,
      controller: "corp",
      mandatory: true,
      effectKey: "onExposeWhileInstalled",
      logLine: `${card.title} becomes pending — exposed while installed (CR ${CR.expose.number}).`,
    },
  ]);
}

export function fireFirstAdvancementOnServer(
  state: GameState,
  serverId: ServerId,
): void {
  const server = state.servers[serverId];
  if (!server) return;
  const items: StoredConditionalMark[] = [];
  for (const id of [...server.root]) {
    const card = state.cards[id];
    if (!card?.rezzed || !card.onFirstAdvancementOnServerThisTurn) continue;
    items.push({
      abilityKey: "on-first-advancement-on-server",
      sourceId: id,
      controller: "corp",
      mandatory: true,
      effectKey: "onFirstAdvancementOnServerThisTurn",
      logLine: `${card.title} becomes pending — first advancement on this server this turn (CR ${CR.advancing.number}).`,
    });
  }
  fireStoredConditionals(state, items);
}

export function fireEncounterAnyIceOncePerTurn(state: GameState): void {
  const encountered = state.run?.encounter?.iceId;
  if (state.run && encountered && !state.run.firstEncounteredIceId) {
    state.run.firstEncounteredIceId = encountered;
  }
  if (state.turn.encounterAnyIceHookFiredThisTurn) return;
  const items: StoredConditionalMark[] = [];
  const ids = [state.runner.identityId, ...state.runner.installed];
  for (const id of ids) {
    const card = state.cards[id];
    if (!card?.onEncounterAnyIceOncePerTurn) continue;
    items.push({
      abilityKey: "on-encounter-any-ice-once",
      sourceId: id,
      controller: "runner",
      mandatory: false,
      effectKey: "onEncounterAnyIceOncePerTurn",
      logLine: `${card.title} becomes pending — encounter ice, once this turn (CR 6.5).`,
    });
  }
  if (items.length === 0) return;
  state.turn.encounterAnyIceHookFiredThisTurn = true;
  fireStoredConditionals(state, items);
}

export function fireCompileFirstEncounter(state: GameState): void {
  const run = state.run;
  const eventId = state.playedRunEventId;
  if (!run || !eventId || run.compileFirstEncounterFired) return;
  const event = state.cards[eventId];
  const effect = event?.runEvent?.onFirstEncounterThisRun;
  if (!effect || !event) return;
  run.compileFirstEncounterFired = true;
  fireStoredConditionals(state, [
    {
      abilityKey: "run-event-first-encounter",
      sourceId: eventId,
      controller: "runner",
      mandatory: false,
      effectKey: "runEvent.onFirstEncounterThisRun",
      logLine: `${event.title} becomes pending — first encounter this run (CR 6.5).`,
    },
  ]);
}

export function fireFinishAccessRdOncePerTurn(state: GameState): void {
  if (state.run?.attackedServerId !== "rd") return;
  if (state.turn.finishAccessRdHookFiredThisTurn) return;
  const items: StoredConditionalMark[] = [];
  for (const id of [...state.runner.installed]) {
    const card = state.cards[id];
    if (!card?.onFinishAccessRdOncePerTurn) continue;
    items.push({
      abilityKey: "on-finish-access-rd-once",
      sourceId: id,
      controller: "runner",
      mandatory: false,
      effectKey: "onFinishAccessRdOncePerTurn",
      logLine: `${card.title} becomes pending — an R&D access finishes, once this turn (CR 7.5).`,
    });
  }
  if (items.length === 0) return;
  state.turn.finishAccessRdHookFiredThisTurn = true;
  fireStoredConditionals(state, items);
}

export function fireTenninTurnBegin(state: GameState): void {
  if (state.turn.successfulRunLastTurn) return;
  const identity = state.cards[state.corp.identityId];
  if (!identity?.onTurnBeginIfNoRunnerSuccessfulRunLastTurn) return;
  fireStoredConditionals(state, [
    {
      abilityKey: "on-turn-begin-no-successful-run",
      sourceId: identity.id,
      controller: "corp",
      mandatory: true,
      effectKey: "onTurnBeginIfNoRunnerSuccessfulRunLastTurn",
      logLine: `${identity.title} becomes pending — the Runner made no successful run last turn (CR 5.1.2).`,
    },
  ]);
}

export function firePsiCreditsRevealed(state: GameState): void {
  const identity = state.cards[state.corp.identityId];
  if (!identity?.onPsiCreditsRevealed) return;
  fireStoredConditionals(state, [
    {
      abilityKey: "on-psi-credits-revealed",
      sourceId: identity.id,
      controller: "corp",
      mandatory: true,
      effectKey: "onPsiCreditsRevealed",
      logLine: `${identity.title} becomes pending — psi credits are revealed (CR ${CR.psiRevealSpend.number}).`,
    },
  ]);
}
