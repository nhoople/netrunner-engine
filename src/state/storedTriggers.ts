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
  cancelPendingIfSourceInactive,
  closeReactionWindow,
  completePendingAbility,
  createPendingAbilityInstance,
  findPendingAbility,
  markPendingAbilityResolving,
  openReactionWindow,
  pendingAbilitiesWithStatus,
  pruneSettledPendingAbilities,
} from "./pendingAbilities.js";
import { noteStoredConditionals } from "./storedConditionalHooks.js";
import { checkpointAfterInstruction } from "../legality/checkpoints.js";

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
  if (key === "identityFlippedHooks.onRunnerDiscardPhaseEnd") {
    return card.identityFlippedHooks?.onRunnerDiscardPhaseEnd;
  }
  if (key === "identityFlippedHooks.onFlipToBackIfRunMatchesFace") {
    return card.identityFlippedHooks?.onFlipToBackIfRunMatchesFace;
  }
  if (key === "onArchivesFacedownTurnedFaceupGte") {
    return card.onArchivesFacedownTurnedFaceupGte?.effect;
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

export type InlineConditionalMark = {
  abilityKey: string;
  sourceId: string;
  controller: Side;
  mandatory: boolean;
  effect: Effect;
  logLine: string;
};

/** Mark and resolve a single card-field conditional (CR 9.6.2). */
export function fireCardConditional(
  state: GameState,
  sourceId: string,
  effectKey: StoredConditionalEffectKey,
  abilityKey: string,
  logLine: string,
  controller?: Side,
): boolean {
  const card = state.cards[sourceId];
  if (!card) return false;
  return fireStoredConditionals(state, [
    {
      abilityKey,
      sourceId,
      controller: controller ?? (card.side === "corp" ? "corp" : "runner"),
      mandatory: true,
      effectKey,
      logLine,
    },
  ]);
}

/**
 * Mark flag-driven / synthesized Effects pending (CR 9.6.2) when the card
 * has no Effect field — payload carries the Effect for resume.
 */
export function fireInlineConditionals(
  state: GameState,
  items: InlineConditionalMark[],
): boolean {
  if (items.length === 0) return false;
  const createdIds: string[] = [];
  for (const item of items) {
    if (abilitiesSuppressed(state, item.sourceId)) continue;
    const card = state.cards[item.sourceId];
    if (!card) continue;
    const inst = createPendingAbilityInstance(state, {
      abilityKey: item.abilityKey,
      sourceId: item.sourceId,
      controller: item.controller,
      mandatory: item.mandatory,
      payload: {
        kind: "inline_conditional",
        effect: item.effect,
      } satisfies PendingAbilityPayload,
    });
    createdIds.push(inst.id);
    log(state, item.logLine);
  }
  if (createdIds.length === 0) return false;
  return resolveStoredConditionalPendings(state, createdIds);
}

/** Mark and resolve a single inline Effect conditional (CR 9.6.2). */
export function fireInlineConditional(
  state: GameState,
  sourceId: string,
  effect: Effect,
  abilityKey: string,
  logLine: string,
  controller?: Side,
): boolean {
  const card = state.cards[sourceId];
  if (!card) return false;
  return fireInlineConditionals(state, [
    {
      abilityKey,
      sourceId,
      controller: controller ?? (card.side === "corp" ? "corp" : "runner"),
      mandatory: true,
      effect,
      logLine,
    },
  ]);
}

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

function effectForConditionalPending(
  state: GameState,
  inst: { sourceId: string; payload?: PendingAbilityPayload },
): Effect | undefined {
  if (inst.payload?.kind === "inline_conditional") {
    return inst.payload.effect;
  }
  if (inst.payload?.kind === "stored_conditional") {
    const card = state.cards[inst.sourceId];
    return card ? effectFromKey(card, inst.payload.effectKey) : undefined;
  }
  return undefined;
}

/**
 * Resolve a fixed set of already-pending stored/inline conditionals in one
 * reaction window (CR 9.2.8a / 9.6.2). Used to resume leftover turn-begin
 * instances after an interrupt closes the prior window (CR 9.6.5d).
 */
export function resolveStoredConditionalPendings(
  state: GameState,
  pendingIds: string[],
): boolean {
  // Drop still-pending instances whose source ability was blanked (CR 9.6.10).
  // Trash/zone leaves are handled at the leave-play site so on-trash triggers
  // (source already in heap/Archives) can still resolve.
  cancelPendingIfSourceInactive(
    state,
    (inst) => !abilitiesSuppressed(state, inst.sourceId),
  );
  const frame = openReactionWindow(state, pendingIds, null);
  for (const pendingId of pendingIds) {
    const inst = findPendingAbility(state, pendingId);
    if (!inst || inst.status !== "pending") continue;
    if (
      inst.payload?.kind !== "stored_conditional" &&
      inst.payload?.kind !== "inline_conditional"
    ) {
      completePendingAbility(state, pendingId, "cancelled");
      continue;
    }
    markPendingAbilityResolving(state, pendingId);
    const card = state.cards[inst.sourceId];
    const effect = effectForConditionalPending(state, inst);
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

/**
 * Resolve one stored/inline conditional pending inside an already-open
 * reaction window (CR 9.6.2). Returns true if an interrupt opened.
 */
export function resolveStoredOrInlineConditionalInstance(
  state: GameState,
  pendingId: string,
): boolean {
  const inst = findPendingAbility(state, pendingId);
  if (!inst || inst.status !== "pending") return false;
  if (
    inst.payload?.kind !== "stored_conditional" &&
    inst.payload?.kind !== "inline_conditional"
  ) {
    completePendingAbility(state, pendingId, "cancelled");
    return false;
  }
  if (abilitiesSuppressed(state, inst.sourceId)) {
    completePendingAbility(state, pendingId, "cancelled");
    const title = state.cards[inst.sourceId]?.title ?? inst.sourceId;
    log(
      state,
      `${title} loses pending status — ability inactive (CR ${CR.pendingAbilityInactive.number}).`,
    );
    return false;
  }
  markPendingAbilityResolving(state, pendingId);
  const card = state.cards[inst.sourceId];
  const effect = effectForConditionalPending(state, inst);
  if (effect) {
    const resolved = evalEffect({ state, sourceId: inst.sourceId }, effect);
    if (!resolved.ok) {
      log(state, `${card?.title ?? inst.sourceId} failed: ${resolved.error}`);
    }
  }
  completePendingAbility(state, pendingId, "done");
  return interruptOpen(state);
}

/** Resume stored/inline conditional instances left pending after a nested interrupt. */
export function resumePendingStoredConditionals(state: GameState): void {
  if (interruptOpen(state)) return;
  cancelPendingIfSourceInactive(
    state,
    (inst) => !abilitiesSuppressed(state, inst.sourceId),
  );
  const bag = pendingAbilitiesWithStatus(state, "pending").filter(
    (p) =>
      p.payload?.kind === "stored_conditional" ||
      p.payload?.kind === "inline_conditional",
  );
  if (bag.length === 0) return;
  resolveStoredConditionalPendings(
    state,
    bag.map((p) => p.id),
  );
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
  noteStoredConditionals(state, items);
  if ((state.turn.storedConditionalPending ?? []).length === 0) return false;
  checkpointAfterInstruction(state, "badPublicity.wouldTake");
  return interruptOpen(state);
}

/**
 * Order of Sol: first empty credit pool this turn. Records the condition for
 * the next 10.3.1a scanner pass (phase 3). Does not mark pending here.
 */
export function fireRunnerCreditPoolEmpty(
  state: GameState,
  creditsBefore: number,
): void {
  if (creditsBefore <= 0 || state.runner.credits > 0) return;
  noteFirstCreditPoolEmpty(state);
}

/** Record that the Runner's credit pool first emptied this turn (phase 3). */
export function noteFirstCreditPoolEmpty(state: GameState): void {
  if (state.turn.runnerCreditPoolEmptyFiredThisTurn) return;
  if (state.turn.firstCreditPoolEmptyMetPending) return;
  const ids = [state.runner.identityId, ...state.runner.installed];
  for (const id of ids) {
    if (abilitiesSuppressed(state, id)) continue;
    if (!state.cards[id]?.onFirstRunnerCreditPoolEmptyThisTurn) continue;
    state.turn.firstCreditPoolEmptyMetPending = true;
    return;
  }
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
  // Drop blanked / left-play Bug-class sources before resolve (CR 9.6.10).
  cancelPendingIfSourceInactive(state);
  const frame = openReactionWindow(state, pendingIds, null);
  for (const pendingId of pendingIds) {
    const inst = findPendingAbility(state, pendingId);
    if (!inst || inst.status !== "pending") continue;
    if (inst.payload?.kind !== "on_corp_draw_card") {
      completePendingAbility(state, pendingId, "cancelled");
      continue;
    }
    if (abilitiesSuppressed(state, inst.sourceId)) {
      completePendingAbility(state, pendingId, "cancelled");
      continue;
    }
    markPendingAbilityResolving(state, pendingId);
    state.turn.pendingCorpDrawnCardId = inst.payload.drawnCardId;
    const card = state.cards[inst.sourceId];
    const effect = card?.onCorpDrawCard;
    if (effect) {
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
  noteStoredConditionals(state, [
    {
      abilityKey: "on-expose-while-installed",
      sourceId: cardId,
      controller: "corp",
      mandatory: true,
      effectKey: "onExposeWhileInstalled",
      logLine: `${card.title} becomes pending — exposed while installed (CR ${CR.expose.number}).`,
    },
  ]);
  if ((state.turn.storedConditionalPending ?? []).length > 0) {
    checkpointAfterInstruction(state, "expose.whileInstalled");
  }
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
  noteStoredConditionals(state, items);
  if ((state.turn.storedConditionalPending ?? []).length > 0) {
    checkpointAfterInstruction(state, "advance.firstOnServer");
  }
}

export function firePsiCreditsRevealed(state: GameState): void {
  const identity = state.cards[state.corp.identityId];
  if (!identity?.onPsiCreditsRevealed) return;
  noteStoredConditionals(state, [
    {
      abilityKey: "on-psi-credits-revealed",
      sourceId: identity.id,
      controller: "corp",
      mandatory: true,
      effectKey: "onPsiCreditsRevealed",
      logLine: `${identity.title} becomes pending — psi credits are revealed (CR ${CR.psiRevealSpend.number}).`,
    },
  ]);
  if ((state.turn.storedConditionalPending ?? []).length > 0) {
    checkpointAfterInstruction(state, "psi.creditsRevealed");
  }
}
