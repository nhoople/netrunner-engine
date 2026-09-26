/** Agenda scoring / stealing and game-end checks. */

import { log } from "./createGame.js";
import type { CardInstance, GameState, Side } from "./types.js";
import { CR } from "../timing/labels.js";

export function agendaPointsFor(state: GameState, side: Side): number {
  const p = side === "corp" ? state.corp : state.runner;
  return p.score.reduce((sum, id) => {
    const card = state.cards[id];
    return sum + (card.agendaPoints ?? 0);
  }, 0);
}

export function checkWinConditions(state: GameState): void {
  if (state.winner) {
    state.done = true;
    return;
  }
  const need = state.config.agendaPointsToWin;
  const corpPts = agendaPointsFor(state, "corp");
  const runnerPts = agendaPointsFor(state, "runner");
  if (corpPts >= need) {
    state.winner = "corp";
    state.winReason = "corp_agenda";
    state.done = true;
    log(
      state,
      `Corp wins with ${corpPts} agenda points (need ${need}) (CR ${CR.corpWinAgenda.number}).`,
    );
    return;
  }
  if (runnerPts >= need) {
    state.winner = "runner";
    state.winReason = "runner_agenda";
    state.done = true;
    log(
      state,
      `Runner wins with ${runnerPts} agenda points (need ${need}) (CR ${CR.runnerWinAgenda.number}).`,
    );
    return;
  }
  // Flatline: brain damage >= max hand size, or meat/net emptied grip while
  // still owing damage — handled in damage module by setting winReason.
  if (state.runner.brainDamage >= state.runner.maxHandSize + state.runner.brainDamage) {
    // maxHandSize already reduced by brain damage in applyBrainDamage
  }
  if (state.winReason === "flatline") {
    state.winner = "corp";
    state.done = true;
  }
}

export function canScoreAgenda(
  state: GameState,
  card: CardInstance,
): boolean {
  if (card.type !== "agenda") return false;
  if (card.side !== "corp") return false;
  const req = card.advancementRequirement ?? 0;
  const tokens = card.advancementTokens ?? 0;
  if (tokens < req) return false;
  // Must be installed in a remote root
  if (!card.zone.startsWith("server:") || !card.zone.endsWith(":root")) {
    return false;
  }
  return true;
}

export function scoreAgenda(state: GameState, cardId: string): void {
  const card = state.cards[cardId];
  const serverId = card.zone.replace(/^server:/, "").replace(/:root$/, "");
  const server = state.servers[serverId as keyof typeof state.servers];
  if (server) {
    server.root = server.root.filter((id) => id !== cardId);
  }
  state.corp.score.push(cardId);
  card.zone = "corp:score";
  card.faceup = true;
  card.rezzed = true;
  log(
    state,
    `Corp scores ${card.title} for ${card.agendaPoints ?? 0} points (CR ${CR.scoringAgenda.number}).`,
  );
  checkWinConditions(state);
}

export function stealAgenda(state: GameState, cardId: string): void {
  const card = state.cards[cardId];
  // Remove from wherever it lives
  removeCardFromCurrentZone(state, cardId);
  state.runner.score.push(cardId);
  card.zone = "runner:score";
  card.faceup = true;
  card.rezzed = true;
  if (state.run) {
    state.run.accessCandidates = state.run.accessCandidates.filter(
      (id) => id !== cardId,
    );
    state.run.accessingCardId = null;
  }
  log(
    state,
    `Runner steals ${card.title} for ${card.agendaPoints ?? 0} points (CR ${CR.stealingAgenda.number}).`,
  );
  checkWinConditions(state);
}

export function removeCardFromCurrentZone(
  state: GameState,
  cardId: string,
): void {
  const card = state.cards[cardId];
  state.corp.hand = state.corp.hand.filter((id) => id !== cardId);
  state.corp.deck = state.corp.deck.filter((id) => id !== cardId);
  state.corp.discard = state.corp.discard.filter((id) => id !== cardId);
  state.runner.hand = state.runner.hand.filter((id) => id !== cardId);
  state.runner.deck = state.runner.deck.filter((id) => id !== cardId);
  state.runner.discard = state.runner.discard.filter((id) => id !== cardId);
  state.runner.rig = state.runner.rig.filter((id) => id !== cardId);
  for (const server of Object.values(state.servers)) {
    server.root = server.root.filter((id) => id !== cardId);
    server.ice = server.ice.filter((id) => id !== cardId);
  }
  void card;
}
