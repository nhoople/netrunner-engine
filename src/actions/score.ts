/**
 * Advancing a card and scoring an agenda.
 * Stealing during a run stays with access resolution.
 */
import { log } from "../state/createGame.js";
import { evalEffect, noteBuiltToLastHadNoCounters } from "../effects/eval.js";
import { withCostCheckpoint } from "../legality/checkpoints.js";
import { dealDamage } from "../state/damage.js";
import { noteCorpActionType } from "../state/corpActionHooks.js";
import { fireFirstBadPublicityTake } from "../state/badPublicityHooks.js";
import { onCardAdvanced } from "../state/cardDeclarations.js";
import {
  fireFirstAdvancementOnServer,
  fireInlineConditional,
  fireStoredConditionals,
  fireWouldTakeBadPublicity,
  type StoredConditionalMark,
} from "../state/storedTriggers.js";
import { fireFirstAgendaScoredOrStolenThisTurn } from "../state/agendaHooks.js";
import { fireTdatdOnAgendaAccessedOrScored } from "../effects/kitaraTdatdPrimitives.js";
import { canScoreAgenda, checkWinConditions, scoreAgenda } from "../state/scoring.js";
import { syncGainsSubroutinesPerAdvancement } from "../state/powerCounters.js";
import {
  applyAdvanceIceRecurringTowardAdvance,
  applyAdvanceThisServerRecurringTowardAdvance,
} from "../cards/stubs.js";
import { corpMayScore } from "../cards/stubs.js";
import { nestPriorityAfterAbility } from "../legality/priority.js";
import { afterBasicAction } from "../timing/machine.js";
import type { ApplyResult, GameState, RuleCite, ServerId } from "../state/types.js";
import { fx } from "../effects/ir.js";
import { mayAdvanceInstalledCard } from "../state/advanceable.js";
import { CR } from "../timing/labels.js";
import { spendClick } from "./spendClick.js";
import {
  fireOnAgendaScoredFromThisServer,
  fireOnAgendaScoredOrStolen,
} from "../state/miscConditionalHooks.js";

function fail(error: string, cites: RuleCite[]): ApplyResult {
  return { ok: false, error, cites };
}

function ok(state: GameState): ApplyResult {
  return { ok: true, state };
}

export function advanceCard(state: GameState, cardId: string): ApplyResult {
  if (state.activeSide !== "corp") {
    return fail("Only Corp may advance.", [CR.corpBasicAdvance]);
  }
  if (state.turn.cannotAdvanceCards) {
    return fail("Cannot advance cards for the remainder of this turn.", [
      CR.advancing,
    ]);
  }
  const card = state.cards[cardId];
  if (!card) return fail("Unknown card.", [CR.advancing]);
  if (!mayAdvanceInstalledCard(card)) {
    return fail("That card cannot be advanced.", [CR.youCanAdvance]);
  }
  if (!card.zone.endsWith(":root") && !card.zone.endsWith(":ice")) {
    return fail("Card must be installed to advance.", [CR.advancing]);
  }
  if (state.corp.credits < 1) {
    let avail = 0;
    if (card.type === "ice") {
      const idCardProbe = state.cards[state.corp.identityId];
      for (const c of [
        idCardProbe,
        ...Object.values(state.cards).filter(
          (x) => x.side === "corp" && x.rezzed && x.type !== "identity",
        ),
      ]) {
        if (!c?.recurringSpendFor?.includes("advance_ice")) continue;
        avail += c.recurringCredits ?? 0;
      }
    }
    // Simone Diego-class: recurring for cards in this server.
    for (const server of Object.values(state.servers)) {
      if (!server.root.includes(cardId) && !server.ice.includes(cardId)) continue;
      for (const id of [...server.root, ...server.ice]) {
        const c = state.cards[id];
        if (!c?.rezzed) continue;
        if (!(c.recurringSpendFor ?? []).includes("advance_cards_this_server")) {
          continue;
        }
        avail += c.recurringCredits ?? 0;
      }
    }
    if (avail < 1) {
      return fail("Need 1¢ to advance.", [CR.advancing]);
    }
  }
  const bad = spendClick(state);
  if (bad) return bad;
  withCostCheckpoint(state, "advance", () => {
    let left = 1;
    left = applyAdvanceThisServerRecurringTowardAdvance(state, cardId, left);
    if (card.type === "ice" && left > 0) {
      left = applyAdvanceIceRecurringTowardAdvance(state, left);
    }
    if (left > 0) state.corp.credits -= left;
  });
  const prior = card.advancementCounters ?? 0;
  card.advancementCounters = prior + 1;
  const serverId = card.zone.split(":")[1] as ServerId;
  const firstOnThisServer = !state.turn.advancedThisTurn.some((id) => {
    const other = state.cards[id];
    return other?.zone.split(":")[1] === serverId;
  });
  const firstAdvanceThisTurn = !state.turn.advancedThisTurn.includes(cardId);
  if (firstAdvanceThisTurn) {
    state.turn.advancedThisTurn.push(cardId);
    onCardAdvanced(state, cardId);
  }
  if (firstOnThisServer) fireFirstAdvancementOnServer(state, serverId);
  noteBuiltToLastHadNoCounters(state, card, prior);
  if (card.creditsOnFirstAdvanceThisTurn && firstAdvanceThisTurn) {
    const n = card.creditsOnFirstAdvanceThisTurn;
    state.corp.credits += n;
    log(
      state,
      `${card.title} — gain ${n}¢ (first advance this turn) → ${state.corp.credits}.`,
    );
  }
  if (card.creditsOnAdvance) {
    const nextAdvancementCounters = card.advancementCounters ?? 0;
    const spec = card.creditsOnAdvance;
    const gain =
      spec.atOrAbove !== undefined && nextAdvancementCounters >= spec.atOrAbove
        ? spec.bonus ?? spec.default
        : spec.default;
    state.corp.credits += gain;
    log(
      state,
      `${card.title} — gain ${gain}¢ on advance → ${state.corp.credits}.`,
    );
  }
  if (card.trashTopOfStackOnAdvance) {
    const nextAdvancementCounters = card.advancementCounters ?? 0;
    const spec = card.trashTopOfStackOnAdvance;
    const n =
      spec.atOrAbove !== undefined && nextAdvancementCounters >= spec.atOrAbove
        ? spec.bonus ?? spec.default
        : spec.default;
    for (let i = 0; i < n; i++) {
      const top = state.runner.deck.shift();
      if (!top) break;
      const milled = state.cards[top]!;
      milled.zone = "runner:heap";
      milled.faceup = true;
      state.runner.discardPile.push(top);
    }
    log(state, `${card.title} — trash top ${n} of Runner stack.`);
  }
  if (card.placeAdvancementOnAnotherOnAdvance) {
    const nextAdvancementCounters = card.advancementCounters ?? 0;
    const spec = card.placeAdvancementOnAnotherOnAdvance;
    const amount =
      spec.atOrAbove !== undefined && nextAdvancementCounters >= spec.atOrAbove
        ? spec.bonus ?? spec.default
        : spec.default;
    const r = evalEffect(
      { state, sourceId: cardId },
      {
        op: "do",
        action: {
          kind: "place_advancement_on_another_on_advance",
          amount,
        },
      },
    );
    if (!r.ok) {
      log(state, `${card.title} on-advance place failed: ${r.error}`);
    }
  }
  const advanceItems: StoredConditionalMark[] = [];
  if (card.onAdvance) {
    advanceItems.push({
      abilityKey: "on-advance",
      sourceId: cardId,
      controller: "corp",
      mandatory: true,
      effectKey: "onAdvance",
      logLine: `${card.title} becomes pending — advanced.`,
    });
  }
  for (const hid of card.hostedCardIds ?? []) {
    const hosted = state.cards[hid];
    if (!hosted?.onAdvance) continue;
    advanceItems.push({
      abilityKey: "on-advance",
      sourceId: hid,
      controller: "corp",
      mandatory: true,
      effectKey: "onAdvance",
      logLine: `${hosted.title} becomes pending — host advanced.`,
    });
  }
  fireStoredConditionals(state, advanceItems);
  if (typeof card.gainCreditsOnAdvance === "number" && card.gainCreditsOnAdvance > 0) {
    state.corp.credits += card.gainCreditsOnAdvance;
    log(
      state,
      `${card.title} — gain ${card.gainCreditsOnAdvance}¢ on advance → ${state.corp.credits}¢.`,
    );
  }
  log(
    state,
    `Corp advances ${card.title} → ${card.advancementCounters} (CR ${CR.corpBasicAdvance.number}, ${CR.advancing.number}).`,
  );
  syncGainsSubroutinesPerAdvancement(card);
  noteCorpActionType(state, "basic_advance");
  afterBasicAction(state);
  return ok(state);
}

function grantCreditsOnScoreOrSteal(state: GameState): void {
  for (const id of state.runner.installed) {
    const card = state.cards[id];
    const n = card.creditsOnScoreOrSteal ?? 0;
    if (n > 0) {
      state.runner.credits += n;
      log(state, `${card.title} — gain ${n}¢ (agenda scored/stolen).`);
    }
  }
}

export function fireScoreOrStealSideEffects(
  state: GameState,
  scoredOrStolenId: string,
  kind: "score" | "steal",
  serverIdBefore?: string,
): ApplyResult {
  if (serverIdBefore && state.servers[serverIdBefore as ServerId]) {
    state.turn.lastAgendaScoredOrStolenServerId =
      serverIdBefore as ServerId;
  }
  state.turn.lastScoredOrStolenAgendaId = scoredOrStolenId;
  grantCreditsOnScoreOrSteal(state);
  if (kind === "score") {
    fireTdatdOnAgendaAccessedOrScored(state);
    if (state.pendingChoice || state.trace) return ok(state);
  }

  fireFirstAgendaScoredOrStolenThisTurn(state);
  if (state.pendingChoice || state.pendingSabotage) return ok(state);

  // Jinteki: Personal Evolution
  const corpId = state.cards[state.corp.identityId];
  if (corpId?.netDamageOnAgendaScoredOrStolen) {
    fireInlineConditional(
      state,
      corpId.id,
      fx.netDamage(corpId.netDamageOnAgendaScoredOrStolen),
      "net-damage-on-agenda-scored-or-stolen",
      `${corpId.title} becomes pending — agenda scored or stolen (net damage).`,
      "corp",
    );
    if (state.pendingChoice || state.pendingDamage) return ok(state);
  }

  // Pantograph may-install
  for (const id of state.runner.installed) {
    const card = state.cards[id];
    if (!card?.mayInstallOnScoreOrSteal) continue;
    fireInlineConditional(
      state,
      id,
      fx.mayInstallFromGrip(),
      "may-install-on-score-or-steal",
      `${card.title} becomes pending — agenda scored or stolen (may install).`,
    );
    if (state.pendingChoice) return ok(state);
  }

  // Daeg-class / Leela-class: on agenda scored or stolen (rig + Runner identity)
  fireOnAgendaScoredOrStolen(state, [
    state.runner.identityId,
    ...state.runner.installed,
  ]);
  if (state.pendingChoice) return ok(state);

  // Perfect Recall: power on agenda scored/stolen from this server
  if (serverIdBefore) {
    const server = state.servers[serverIdBefore as keyof typeof state.servers];
    if (server) {
      for (const id of [...server.root, ...server.ice]) {
        const card = state.cards[id];
        const n = card?.powerCounterOnAgendaScoredOrStolenFromThisServer;
        if (!n || !card.rezzed) continue;
        card.powerCounters = (card.powerCounters ?? 0) + n;
        log(
          state,
          `${card.title} — place ${n} power (agenda scored/stolen from this server) → ${card.powerCounters}.`,
        );
      }
    }
  }

  // Vera Ivanovna-class: rezzed Corp installed onAgendaScoredOrStolen
  {
    const veraIds = [];
    for (const server of Object.values(state.servers)) {
      for (const id of [...server.root, ...server.ice]) {
        const card = state.cards[id];
        if (!card?.onAgendaScoredOrStolen) continue;
        if (!card.rezzed && !card.persistent) continue;
        veraIds.push(id);
      }
    }
    fireOnAgendaScoredOrStolen(state, veraIds);
    if (state.pendingChoice) return ok(state);
  }

  // Send a Message (on the agenda itself)
  const agenda = state.cards[scoredOrStolenId];
  if (agenda.mayRezIceIgnoringCostsOnScoreOrSteal) {
    fireInlineConditional(
      state,
      scoredOrStolenId,
      fx.rezIceIgnoringCosts(),
      "may-rez-ice-ignoring-costs-on-score-or-steal",
      `${agenda.title} becomes pending — agenda scored or stolen (may rez ice).`,
      "corp",
    );
    if (state.pendingChoice) return ok(state);
  }

  // Tāo Salonga ice swap
  const runnerId = state.cards[state.runner.identityId];
  if (runnerId?.maySwapIceOnAgendaScoredOrStolen) {
    fireInlineConditional(
      state,
      runnerId.id,
      fx.swapTwoIce(),
      "may-swap-ice-on-agenda-scored-or-stolen",
      `${runnerId.title} becomes pending — agenda scored or stolen (may swap ice).`,
    );
    if (state.pendingChoice) return ok(state);
  }

  // Malapert: search R&D when scoring from its server
  if (kind === "score" && serverIdBefore) {
    const server = state.servers[serverIdBefore as ServerId];
    if (server) {
      for (const id of server.root) {
        const up = state.cards[id];
        if (!up?.rezzed || !up.searchRdNonAgendaOnScoreFromServer) continue;
        fireInlineConditional(
          state,
          id,
          fx.searchRdNonAgenda(),
          "search-rd-non-agenda-on-score-from-server",
          `${up.title} becomes pending — agenda scored from this server (search R&D).`,
          "corp",
        );
        if (state.pendingChoice) return ok(state);
      }
    }
  }

  return ok(state);
}

export function scoreAgendaAction(state: GameState, cardId: string): ApplyResult {
  if (state.activeSide !== "corp") {
    return fail("Only Corp scores agendas.", [CR.scoringAgenda]);
  }
  // CR 1.17.3 / 9.2.7d: scoring is an option in an (S) window, not an action.
  if (!corpMayScore(state.timingKey)) {
    return fail("Score only in a paid ability window marked (S).", [
      CR.scoringAgenda,
      CR.scoreInPaidWindow,
    ]);
  }
  if (state.turn.cannotScoreAgendas) {
    return fail("Cannot score agendas for the remainder of this turn.", [
      CR.scoringAgenda,
    ]);
  }
  if (
    state.turn.cannotScoreOrRezCardIds.includes(cardId) ||
    state.cannotScoreOrRezUntilNextCorpTurnCardIds.includes(cardId)
  ) {
    return fail("Cannot score this card for the remainder of this turn.", [
      CR.scoringAgenda,
    ]);
  }
  const card = state.cards[cardId];
  if (state.turn.installedThisTurn.includes(cardId)) {
    if (card.cannotScoreIfInstalledThisTurn) {
      return fail(
        "Cannot score this agenda if it was installed this turn.",
        [CR.scoringAgenda],
      );
    }
    for (const id of state.runner.installed) {
      if (state.cards[id].forbidScoreAgendaInstalledThisTurn) {
        return fail(
          "Cannot score an agenda installed this turn (Clot).",
          [CR.scoringAgenda],
        );
      }
    }
  }
  if (!canScoreAgenda(state, card)) {
    return fail("Agenda cannot be scored.", [CR.scoringAgenda]);
  }

  // Word on the Street-class: additional cost when scoring an agenda installed
  // this turn — add each such resource to Corp score as a −1 agenda.
  if (state.turn.installedThisTurn.includes(cardId)) {
    for (const id of [...state.runner.installed]) {
      const runnerCard = state.cards[id];
      if (!runnerCard?.additionalCostOnScoreAgendaInstalledThisTurn) continue;
      const r = evalEffect(
        { state, sourceId: id },
        runnerCard.additionalCostOnScoreAgendaInstalledThisTurn,
      );
      if (!r.ok) return fail(r.error, r.cites);
      if (state.pendingChoice) return ok(state);
    }
  }

  // Additional score cost (Azef): pay before the agenda leaves its server.
  if (card.scoreAdditionalCost) {
    if (state.pendingScoreAgendaId === cardId) {
      // Cost already resolved via choose_option.
      state.pendingScoreAgendaId = null;
    } else {
      state.pendingScoreAgendaId = cardId;
      const r = evalEffect(
        { state, sourceId: cardId },
        card.scoreAdditionalCost,
      );
      if (!r.ok) {
        state.pendingScoreAgendaId = null;
        return fail(r.error, r.cites);
      }
      if (state.pendingChoice) {
        return ok(state);
      }
      // Cost resolved synchronously (unlikely for must_trash) — clear and continue.
      state.pendingScoreAgendaId = null;
    }
  }

  const serverIdBefore = card.zone
    .replace(/^server:/, "")
    .replace(/:root$/, "");
  scoreAgenda(state, cardId);
  state.turn.agendaPointsScoredThisTurn += card.agendaPoints ?? 0;
  if (!state.turn.scoredCardIdsThisTurn) state.turn.scoredCardIdsThisTurn = [];
  state.turn.scoredCardIdsThisTurn.push(cardId);
  // Djupstad Grid-class: core damage when scoring from this server's root.
  // Arella Salvatore-class: onAgendaScoredFromThisServer effect.
  const scoredFromServer = state.servers[serverIdBefore as ServerId];
  if (scoredFromServer) {
    for (const uid of scoredFromServer.root) {
      const up = state.cards[uid];
      if (
        up?.rezzed &&
        (up.coreDamageOnAgendaScoredFromThisServer ?? 0) > 0
      ) {
        dealDamage(
          state,
          "core",
          up.coreDamageOnAgendaScoredFromThisServer!,
          uid,
        );
        log(
          state,
          `${up.title} — do ${up.coreDamageOnAgendaScoredFromThisServer} core damage (agenda scored from this server).`,
        );
      }
      if (up?.rezzed && up.onAgendaScoredFromThisServer) {
        fireOnAgendaScoredFromThisServer(state, uid);
        if (state.pendingChoice || state.pendingSabotage) return ok(state);
      }
    }
  }
  if ((card.badPublicityOnScore ?? 0) > 0) {
    const bpGain = card.badPublicityOnScore ?? 0;
    state.turn.pendingBadPublicityTake = bpGain;
    if (fireWouldTakeBadPublicity(state)) return ok(state);
    state.corp.badPublicity = (state.corp.badPublicity ?? 0) + bpGain;
    log(
      state,
      `${card.title} — take ${bpGain} bad publicity → ${state.corp.badPublicity}.`,
    );
    fireFirstBadPublicityTake(state, bpGain);
  }
  if ((card.handSizeBonus ?? 0) !== 0) {
    state.corp.maxHandSize += card.handSizeBonus!;
  }
  const sideFx = fireScoreOrStealSideEffects(
    state,
    cardId,
    "score",
    serverIdBefore,
  );
  if (!sideFx.ok) return sideFx;
  if (state.pendingChoice) return sideFx;
  if (card.onScore) {
    if (card.onScoreIfRunnerTaggedPlaceAgendaCounter && state.runner.tags > 0) {
      card.agendaCounters = (card.agendaCounters ?? 0) + 1;
      log(
        state,
        `${card.title} — Runner tagged; place agenda counter → ${card.agendaCounters}.`,
      );
    }
    fireStoredConditionals(state, [
      {
        abilityKey: "on-score",
        sourceId: cardId,
        controller: "corp",
        mandatory: true,
        effectKey: "onScore",
        logLine: `${card.title} becomes pending — scored.`,
      },
    ]);
    // Wait for onScore choice (e.g. Élivágar may_derez) before identity /
    // installed onAgendaScored triggers (CR §9.5 / ability resolution).
    if (state.pendingChoice || state.pendingSabotage) return ok(state);
  }
  const idCard = state.cards[state.corp.identityId];
  // Issuaq Adaptics: power if agenda was not installed or advanced this turn
  if (idCard?.powerOnScoreIfAgendaNotInstalledOrAdvancedThisTurn) {
    const touched =
      state.turn.installedThisTurn.includes(cardId) ||
      state.turn.advancedThisTurn.includes(cardId);
    if (!touched) {
      idCard.powerCounters = (idCard.powerCounters ?? 0) + 1;
      log(
        state,
        `${idCard.title} — place 1 power → ${idCard.powerCounters} (agenda not installed/advanced this turn).`,
      );
      checkWinConditions(state);
      if (state.winner) return ok(state);
    }
  }
  const agendaScored: StoredConditionalMark[] = [];
  if (idCard?.onAgendaScored) {
    agendaScored.push({
      abilityKey: "on-agenda-scored",
      sourceId: idCard.id,
      controller: "corp",
      mandatory: true,
      effectKey: "onAgendaScored",
      logLine: `${idCard.title} becomes pending — agenda scored.`,
    });
  }
  // Marrow-class: installed Runner cards with onAgendaScored
  for (const id of state.runner.installed) {
    const runnerCard = state.cards[id];
    if (!runnerCard?.onAgendaScored) continue;
    agendaScored.push({
      abilityKey: "on-agenda-scored",
      sourceId: id,
      controller: "runner",
      mandatory: true,
      effectKey: "onAgendaScored",
      logLine: `${runnerCard.title} becomes pending — agenda scored.`,
    });
  }
  // Clones are not People-class: corp currents' onAgendaScored
  for (const cur of Object.values(state.cards)) {
    if (cur.zone !== "corp:play-area" || !cur.onAgendaScored) continue;
    agendaScored.push({
      abilityKey: "on-agenda-scored",
      sourceId: cur.id,
      controller: "corp",
      mandatory: true,
      effectKey: "onAgendaScored",
      logLine: `${cur.title} becomes pending — agenda scored.`,
    });
  }
  // The Powers That Be-class: rezzed Corp installed onAgendaScored
  for (const server of Object.values(state.servers)) {
    for (const id of [...server.root, ...server.ice]) {
      const installed = state.cards[id];
      if (!installed?.onAgendaScored) continue;
      if (!installed.rezzed && !installed.persistent) continue;
      agendaScored.push({
        abilityKey: "on-agenda-scored",
        sourceId: id,
        controller: "corp",
        mandatory: true,
        effectKey: "onAgendaScored",
        logLine: `${installed.title} becomes pending — agenda scored.`,
      });
    }
  }
  // Salvo Testing-class: scored agendas with onAgendaScored (incl. this one)
  for (const id of state.corp.scoreArea) {
    const scored = state.cards[id];
    if (!scored?.onAgendaScored) continue;
    agendaScored.push({
      abilityKey: "on-agenda-scored",
      sourceId: id,
      controller: "corp",
      mandatory: true,
      effectKey: "onAgendaScored",
      logLine: `${scored.title} becomes pending — agenda scored.`,
    });
  }
  fireStoredConditionals(state, agendaScored);
  if (state.pendingChoice || state.pendingSabotage) return ok(state);
  nestPriorityAfterAbility(state, "score_agenda");
  return ok(state);
}

