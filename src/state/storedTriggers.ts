/**
 * Conditional abilities whose card data is loaded and whose moment is a
 * shared procedure: the ability becomes pending when that moment happens.
 */
import { evalEffect } from "../effects/eval.js";
import type { Effect } from "../effects/ir.js";
import { abilitiesSuppressed } from "./abilities.js";
import { log } from "./createGame.js";
import type { GameState, ServerId } from "./types.js";
import { CR } from "../timing/labels.js";

function fire(
  state: GameState,
  cardId: string,
  effect: Effect | undefined,
  line: string,
): void {
  if (!effect || abilitiesSuppressed(state, cardId)) return;
  const card = state.cards[cardId];
  if (!card) return;
  log(state, line);
  const resolved = evalEffect({ state, sourceId: cardId }, effect);
  if (!resolved.ok) {
    log(state, `${card.title} failed: ${resolved.error}`);
  }
}

export function fireScoreTurnEnd(state: GameState): void {
  for (const id of [...state.corp.scoreArea]) {
    const card = state.cards[id];
    if (!card?.scoredThisTurn || !card.onScoreTurnEnd) continue;
    card.scoredThisTurn = false;
    fire(
      state,
      id,
      card.onScoreTurnEnd,
      `${card.title} — the turn it was scored ends (CR 11.2_3_d).`,
    );
  }
}

/** True when a replacement for taking bad publicity is now pending. */
export function fireWouldTakeBadPublicity(state: GameState): boolean {
  for (const server of Object.values(state.servers)) {
    for (const id of [...server.root]) {
      const card = state.cards[id];
      if (!card?.rezzed || !card.onWouldTakeBadPublicity) continue;
      fire(
        state,
        id,
        card.onWouldTakeBadPublicity,
        `${card.title} — the Corp would take bad publicity (CR 10.6).`,
      );
      if (state.psi || state.trace || state.pendingChoice) return true;
    }
  }
  return false;
}

export function fireRunnerCreditPoolEmpty(
  state: GameState,
  creditsBefore: number,
): void {
  if (creditsBefore <= 0 || state.runner.credits > 0) return;
  if (state.turn.runnerCreditPoolEmptyFiredThisTurn) return;
  state.turn.runnerCreditPoolEmptyFiredThisTurn = true;
  const ids = [state.runner.identityId, ...state.runner.installed];
  for (const id of ids) {
    const card = state.cards[id];
    if (!card?.onFirstRunnerCreditPoolEmptyThisTurn) continue;
    fire(
      state,
      id,
      card.onFirstRunnerCreditPoolEmptyThisTurn,
      `${card.title} — the Runner's credit pool is empty for the first time this turn (CR 1.10).`,
    );
  }
}

export function fireSuccessfulRunServerAbilities(state: GameState): void {
  const run = state.run;
  if (!run || run.successful !== true) return;
  const server = state.servers[run.attackedServerId];
  if (!server) return;
  for (const id of [...server.root]) {
    const card = state.cards[id];
    if (!card?.rezzed) continue;
    if (card.onSuccessfulRun) {
      fire(
        state,
        id,
        card.onSuccessfulRun,
        `${card.title} — successful run on this server (CR ${CR.ifSuccessfulAbilityOptional.number}).`,
      );
      if (state.trace || state.pendingChoice) return;
    }
    if (card.onSuccessfulRunOnThisServer) {
      fire(
        state,
        id,
        card.onSuccessfulRunOnThisServer,
        `${card.title} — successful run on this server (CR ${CR.successfulRun.number}).`,
      );
    }
    if (card.onSuccessfulRunThisServer) {
      fire(
        state,
        id,
        card.onSuccessfulRunThisServer,
        `${card.title} — successful run on this server (CR ${CR.successfulRun.number}).`,
      );
    }
  }
}

export function fireUnsuccessfulRunServerAbilities(state: GameState): void {
  const run = state.run;
  if (!run) return;
  const server = state.servers[run.attackedServerId];
  if (!server) return;
  for (const id of [...server.root]) {
    const card = state.cards[id];
    if (!card?.rezzed || !card.onUnsuccessfulRunOnThisServer) continue;
    fire(
      state,
      id,
      card.onUnsuccessfulRunOnThisServer,
      `${card.title} — unsuccessful run on this server (CR ${CR.unsuccessfulRun.number}).`,
    );
  }
}

export function fireAccessedCardAbilities(state: GameState): void {
  const cardId = state.run?.accessingCardId;
  const card = cardId ? state.cards[cardId] : undefined;
  if (!cardId || !card) return;
  const installed =
    card.zone.includes(":root") ||
    card.zone.includes(":ice") ||
    card.zone.startsWith("hosted:");
  if (installed && card.onAccessWhileInstalled) {
    fire(
      state,
      cardId,
      card.onAccessWhileInstalled,
      `${card.title} — accessed while installed (CR 7.1).`,
    );
  }
  if (!installed && card.onAccessWhileUninstalled) {
    fire(
      state,
      cardId,
      card.onAccessWhileUninstalled,
      `${card.title} — accessed while not installed (CR 7.1).`,
    );
  }
  const fromRd = card.zone === "corp:rd" || state.corp.deck.includes(cardId);
  if (!fromRd && card.onAccessNotFromRd) {
    fire(
      state,
      cardId,
      card.onAccessNotFromRd,
      `${card.title} — accessed from somewhere other than R&D (CR 7.1).`,
    );
  }
}

export function fireCorpDrewCards(state: GameState, count: number): void {
  if (count <= 0) return;
  const ids = [state.runner.identityId, ...state.runner.installed];
  for (let n = 0; n < count; n++) {
    for (const id of ids) {
      const card = state.cards[id];
      if (!card?.onCorpDrawCard) continue;
      fire(
        state,
        id,
        card.onCorpDrawCard,
        `${card.title} — the Corp draws a card (CR ${CR.drawing.number}).`,
      );
      if (state.pendingChoice) return;
    }
  }
}

export function fireExposeWhileInstalled(state: GameState, cardId: string): void {
  const card = state.cards[cardId];
  if (!card?.onExposeWhileInstalled) return;
  const installed =
    card.zone.includes(":root") || card.zone.includes(":ice");
  if (!installed) return;
  fire(
    state,
    cardId,
    card.onExposeWhileInstalled,
    `${card.title} — exposed while installed (CR ${CR.expose.number}).`,
  );
}

export function fireFirstAdvancementOnServer(
  state: GameState,
  serverId: ServerId,
): void {
  const server = state.servers[serverId];
  if (!server) return;
  for (const id of [...server.root]) {
    const card = state.cards[id];
    if (!card?.rezzed || !card.onFirstAdvancementOnServerThisTurn) continue;
    fire(
      state,
      id,
      card.onFirstAdvancementOnServerThisTurn,
      `${card.title} — first advancement on this server this turn (CR ${CR.advancing.number}).`,
    );
  }
}

export function fireEncounterAnyIceOncePerTurn(state: GameState): void {
  const encountered = state.run?.encounter?.iceId;
  if (state.run && encountered && !state.run.firstEncounteredIceId) {
    state.run.firstEncounteredIceId = encountered;
  }
  if (state.turn.encounterAnyIceHookFiredThisTurn) return;
  const ids = [state.runner.identityId, ...state.runner.installed];
  let fired = false;
  for (const id of ids) {
    const card = state.cards[id];
    if (!card?.onEncounterAnyIceOncePerTurn) continue;
    fired = true;
    fire(
      state,
      id,
      card.onEncounterAnyIceOncePerTurn,
      `${card.title} — encounter ice, once this turn (CR 6.5).`,
    );
    if (state.pendingChoice) break;
  }
  if (fired) state.turn.encounterAnyIceHookFiredThisTurn = true;
}

export function fireCompileFirstEncounter(state: GameState): void {
  const run = state.run;
  const eventId = state.playedRunEventId;
  if (!run || !eventId || run.compileFirstEncounterFired) return;
  const event = state.cards[eventId];
  const effect = event?.runEvent?.onFirstEncounterThisRun;
  if (!effect) return;
  run.compileFirstEncounterFired = true;
  fire(
    state,
    eventId,
    effect,
    `${event!.title} — first encounter this run (CR 6.5).`,
  );
}

export function fireFinishAccessRdOncePerTurn(state: GameState): void {
  if (state.run?.attackedServerId !== "rd") return;
  if (state.turn.finishAccessRdHookFiredThisTurn) return;
  let fired = false;
  for (const id of [...state.runner.installed]) {
    const card = state.cards[id];
    if (!card?.onFinishAccessRdOncePerTurn) continue;
    fired = true;
    fire(
      state,
      id,
      card.onFinishAccessRdOncePerTurn,
      `${card.title} — an R&D access finishes, once this turn (CR 7.5).`,
    );
    if (state.pendingChoice) break;
  }
  if (fired) state.turn.finishAccessRdHookFiredThisTurn = true;
}

export function fireTenninTurnBegin(state: GameState): void {
  if (state.turn.successfulRunLastTurn) return;
  const identity = state.cards[state.corp.identityId];
  if (!identity?.onTurnBeginIfNoRunnerSuccessfulRunLastTurn) return;
  fire(
    state,
    identity.id,
    identity.onTurnBeginIfNoRunnerSuccessfulRunLastTurn,
    `${identity.title} — the Runner made no successful run last turn (CR 5.1.2).`,
  );
}

export function firePsiCreditsRevealed(state: GameState): void {
  const identity = state.cards[state.corp.identityId];
  if (!identity?.onPsiCreditsRevealed) return;
  fire(
    state,
    identity.id,
    identity.onPsiCreditsRevealed,
    `${identity.title} — psi credits are revealed (CR ${CR.psiRevealSpend.number}).`,
  );
}
