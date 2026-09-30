/** Agenda scoring / stealing and game-end checks. */

import { log } from "./createGame.js";
import {
  trashCorpCurrentsOnAgendaStolen,
  trashCurrentsOnAgendaScored,
} from "./currents.js";
import { noteRunnerStoleOrTrashedCorpCard } from "./trashHooks.js";
import type { CardInstance, GameState, Side } from "./types.js";
import { CR } from "../timing/labels.js";

export function agendaPointsFor(state: GameState, side: Side): number {
  const p = side === "corp" ? state.corp : state.runner;
  return p.score.reduce((sum, id) => {
    const card = state.cards[id];
    if (
      side === "runner" &&
      card.worthZeroAgendaPointsWhileHasAgendaCounters &&
      (card.agendaCounters ?? 0) >= 1
    ) {
      return sum;
    }
    const base = card.agendaPoints ?? 0;
    const per = card.agendaPointsPerAgendaCounter ?? 0;
    const fromCounters = per * (card.agendaCounters ?? 0);
    const runnerMod =
      side === "runner" ? (card.agendaPointsModifierInRunnerScoreArea ?? 0) : 0;
    let hostedMod = 0;
    for (const hid of card.hostedCardIds ?? []) {
      hostedMod += state.cards[hid]?.hostAgendaPointsModifier ?? 0;
    }
    return sum + base + fromCounters + runnerMod + hostedMod;
  }, 0);
}

export function checkWinConditions(state: GameState): void {
  if (state.winner) {
    state.done = true;
    return;
  }
  const corpId = state.cards[state.corp.identityId];
  const bothMod = corpId?.agendaPointsToWinModifierBoth ?? 0;
  const baseNeed = Math.max(1, state.config.agendaPointsToWin + bothMod);
  const reductionPer =
    corpId?.agendaPointsToWinReductionPerPowerCounter ?? 0;
  const corpNeed = Math.max(
    1,
    baseNeed - reductionPer * (corpId?.powerCounters ?? 0),
  );
  const corpPts = agendaPointsFor(state, "corp");
  const runnerPts = agendaPointsFor(state, "runner");
  if (corpPts >= corpNeed) {
    state.winner = "corp";
    state.winReason = "corp_agenda";
    state.done = true;
    log(
      state,
      `Corp wins with ${corpPts} agenda points (need ${corpNeed}) (CR ${CR.corpWinAgenda.number}).`,
    );
    return;
  }
  const runnerNeed = Math.max(1, state.config.agendaPointsToWin + bothMod);
  if (runnerPts >= runnerNeed) {
    state.winner = "runner";
    state.winReason = "runner_agenda";
    state.done = true;
    log(
      state,
      `Runner wins with ${runnerPts} agenda points (need ${runnerNeed}) (CR ${CR.runnerWinAgenda.number}).`,
    );
    return;
  }
  // Superdeep Borehole: rezzed asset with winWhenBadPublicityCountersEmpty
  // and 0 hosted BP → Corp alternate win (CR §1.13.3 / card text).
  for (const card of Object.values(state.cards)) {
    if (
      !card.winWhenBadPublicityCountersEmpty ||
      !card.rezzed ||
      !card.zone.endsWith(":root")
    ) {
      continue;
    }
    if ((card.badPublicityCounters ?? 0) <= 0) {
      state.winner = "corp";
      state.winReason = "corp_alternate";
      state.done = true;
      log(
        state,
        `Corp wins — ${card.title} has no hosted bad publicity counters.`,
      );
      return;
    }
  }
  // Jeitinho: ≥3 assassination agendas in Runner score → Runner alternate win.
  {
    const assassinationCount = state.runner.score.filter((id) =>
      (state.cards[id]?.subtypes ?? []).includes("assassination"),
    ).length;
    if (assassinationCount >= 3) {
      state.winner = "runner";
      state.winReason = "runner_alternate";
      state.done = true;
      log(
        state,
        `Runner wins — ${assassinationCount} assassination agendas in the score area.`,
      );
      return;
    }
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

/**
 * Printed / dynamic advancement requirement for scoring, after agenda-local
 * and same-server region reductions (SanSan). Floor is 0.
 */
export function effectiveAdvancementRequirement(
  state: GameState,
  card: CardInstance,
): number {
  let req = card.advancementRequirementEqualsRunnerGrip
    ? state.runner.hand.length
    : (card.advancementRequirement ?? 0);
  const perTag = card.advancementRequirementReductionPerTag ?? 0;
  if (perTag > 0) {
    req -= perTag * (state.runner.tags ?? 0);
  }
  const perCore = card.advancementRequirementReductionPerCoreDamageThisGame ?? 0;
  if (perCore > 0) {
    req -= perCore * (state.runner.brainDamage ?? 0);
  }
  const perBp = card.advancementRequirementReductionPerBadPublicity;
  if (perBp && perBp.per > 0) {
    let bp = state.corp.badPublicity ?? 0;
    if (perBp.max !== undefined) bp = Math.min(bp, perBp.max);
    req -= perBp.per * bp;
  }
  const incBp = card.advancementRequirementIncreasePerCorpBadPublicity ?? 0;
  if (incBp > 0) {
    req += incBp * (state.corp.badPublicity ?? 0);
  }
  // SanSan City Grid: rezzed region upgrades on same server reduce requirement.
  if (card.zone.startsWith("server:") && card.zone.endsWith(":root")) {
    const serverId = card.zone.replace(/^server:/, "").replace(/:root$/, "");
    const server = state.servers[serverId as keyof typeof state.servers];
    if (server) {
      for (const id of server.root) {
        if (id === card.id) continue;
        const up = state.cards[id];
        if (
          up?.rezzed &&
          (up.advancementRequirementReduction ?? 0) > 0
        ) {
          req -= up.advancementRequirementReduction ?? 0;
        }
      }
    }
  }
  const perCopy = card.advancementRequirementReductionPerSameTitleAnywhere ?? 0;
  if (perCopy > 0) {
    let copies = 0;
    const zones = [
      state.corp.hand,
      state.corp.deck,
      state.corp.discard,
      ...Object.values(state.servers).flatMap((s) => [...s.root, ...s.ice]),
      state.corp.score,
    ];
    for (const ids of zones) {
      for (const id of ids) {
        if (state.cards[id]?.defId === card.defId) copies++;
      }
    }
    req -= perCopy * copies;
  }
  // Global auras: installed Runner resources that raise every agenda's
  // advancement requirement (The Source / Chakana).
  for (const id of state.runner.rig) {
    const rc = state.cards[id];
    if (!rc) continue;
    req += rc.agendaAdvancementRequirementBonus ?? 0;
    const virusAura = rc.agendaAdvancementRequirementBonusIfVirusCountersGte;
    if (virusAura && (rc.virusCounters ?? 0) >= virusAura.threshold) {
      req += virusAura.bonus;
    }
  }
  // Traffic Jam current: +N per copy of this agenda in Corp score area.
  for (const id of Object.keys(state.cards)) {
    const c = state.cards[id];
    if (!c || c.zone !== "runner:play-area") continue;
    const per = c.agendaAdvancementRequirementBonusPerCopyInCorpScore ?? 0;
    if (per <= 0) continue;
    const copies = state.corp.score.filter(
      (sid) => state.cards[sid]?.defId === card.defId,
    ).length;
    req += per * copies;
  }
  return Math.max(0, req);
}

export function canScoreAgenda(
  state: GameState,
  card: CardInstance,
): boolean {
  if (card.type !== "agenda") return false;
  if (card.side !== "corp") return false;
  const req = effectiveAdvancementRequirement(state, card);
  const tokens = card.advancementTokens ?? 0;
  if (tokens < req) return false;
  // Must be installed in a remote root
  if (!card.zone.startsWith("server:") || !card.zone.endsWith(":root")) {
    return false;
  }
  // Azef-class: additional cost requires another installed Corp card.
  // Skip when resuming after the cost was already paid (pendingScoreAgendaId).
  if (card.scoreAdditionalCost && state.pendingScoreAgendaId !== card.id) {
    let others = 0;
    for (const server of Object.values(state.servers)) {
      for (const id of [...server.ice, ...server.root]) {
        if (id === card.id) continue;
        if (state.cards[id]?.side === "corp") others += 1;
      }
    }
    if (others < 1) return false;
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
  card.scoredFromServerId = serverId as import("./types.js").ServerId;
  log(
    state,
    `Corp scores ${card.title} for ${card.agendaPoints ?? 0} points (CR ${CR.scoringAgenda.number}).`,
  );
  trashCurrentsOnAgendaScored(state);
  checkWinConditions(state);
}

export function stealAgenda(state: GameState, cardId: string): void {
  const card = state.cards[cardId];
  const fromArchives =
    card.zone === "corp:archives" || state.corp.discard.includes(cardId);
  // Project Vacheron (CR 9.9.9c): replacement when added from anywhere except
  // Archives — place 4 agenda counters once; does not re-trigger on result.
  if (card.vacheronStealReplacement && !fromArchives) {
    card.agendaCounters = 4;
  }
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
    state.run.agendasStolenThisRun = (state.run.agendasStolenThisRun ?? 0) + 1;
  }
  const pts =
    card.worthZeroAgendaPointsWhileHasAgendaCounters &&
    (card.agendaCounters ?? 0) >= 1
      ? 0
      : (card.agendaPoints ?? 0) +
        (card.agendaPointsPerAgendaCounter ?? 0) * (card.agendaCounters ?? 0);
  state.turn.agendaPointsStolenThisTurn += pts;
  state.turn.agendasStolenThisTurn = (state.turn.agendasStolenThisTurn ?? 0) + 1;
  noteRunnerStoleOrTrashedCorpCard(state);
  log(
    state,
    card.vacheronStealReplacement && !fromArchives
      ? `Runner steals ${card.title} with 4 agenda counters (worth 0 while counters remain; CR ${CR.stealingAgenda.number}, 9.9.9c).`
      : `Runner steals ${card.title} for ${pts} points (CR ${CR.stealingAgenda.number}).`,
  );
  trashCorpCurrentsOnAgendaStolen(state);
  checkWinConditions(state);
}

export function removeCardFromCurrentZone(
  state: GameState,
  cardId: string,
): void {
  const card = state.cards[cardId];
  if (
    card?.returnHostedBadPublicityOnUninstall &&
    (card.badPublicityCounters ?? 0) > 0
  ) {
    const take = card.badPublicityCounters ?? 0;
    card.badPublicityCounters = 0;
    state.corp.badPublicity = (state.corp.badPublicity ?? 0) + take;
    state.log.push(
      `${card.title} — return ${take} hosted bad publicity → player BP ${state.corp.badPublicity}.`,
    );
  }
  state.corp.hand = state.corp.hand.filter((id) => id !== cardId);
  state.corp.deck = state.corp.deck.filter((id) => id !== cardId);
  state.corp.discard = state.corp.discard.filter((id) => id !== cardId);
  state.runner.hand = state.runner.hand.filter((id) => id !== cardId);
  state.runner.deck = state.runner.deck.filter((id) => id !== cardId);
  state.runner.discard = state.runner.discard.filter((id) => id !== cardId);
  state.runner.rig = state.runner.rig.filter((id) => id !== cardId);
  state.runner.score = state.runner.score.filter((id) => id !== cardId);
  state.corp.score = state.corp.score.filter((id) => id !== cardId);
  if (state.runner.setAside) {
    state.runner.setAside = state.runner.setAside.filter((id) => id !== cardId);
  }
  if (state.corp.corpSetAside) {
    state.corp.corpSetAside = state.corp.corpSetAside.filter(
      (id) => id !== cardId,
    );
  }
  for (const server of Object.values(state.servers)) {
    server.root = server.root.filter((id) => id !== cardId);
    server.ice = server.ice.filter((id) => id !== cardId);
  }
  void card;
}
