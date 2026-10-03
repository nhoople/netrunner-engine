/**
 * Rezzing ice and assets, including rez-cost modifiers.
 */
import { log } from "../state/createGame.js";
import { getCardDef } from "../cards/load.js";
import {
  applyHostServerRecurringTowardCorpRez,
  applyRezIceRecurringTowardCorpRez,
  continuousIceRezCostIncrease,
  continuousIceRezCostReduction,
  currentWindow,
  iceRezCostReductionFromScoredAgendaCounters,
  rezCostDiscountIfAgendaScoredOrStolenThisTurn,
  rezCostDiscountPerOtherUnrezzedIce,
  rezCostDiscountPerRezzedSubtype,
  rootRezCostReduction,
} from "../cards/stubs.js";
import { addRestriction, withCostCheckpoint } from "../legality/checkpoints.js";
import {
  ensurePriorityWindow,
  nestPriorityAfterAbility,
} from "../legality/priority.js";
import {
  evalEffect,
  fireHostRezStateTriggers,
  fireIceRezDuringRunHooks,
  fireOnAnyIceRez,
} from "../effects/eval.js";
import { syncAllTourGuideSubs } from "../effects/sansanUotPrimitives.js";
import { fireDagAfterCorpRez } from "../effects/mumbadDagPrimitives.js";
import { fireSiAfterCorpRezOrPlay } from "../effects/mumbadSiPrimitives.js";
import {
  fireHostedCreditsOnAnyIceRez,
  firePowerCounterOnAnyCardRez,
  firePowerOnHarmonicIceRez,
} from "../state/powerCounters.js";
import { abilitiesSuppressed } from "../state/abilities.js";
import { runnerAbilityCarrierIds } from "../state/fenris.js";
import { runnerIsTagged } from "../state/tags.js";
import type { ApplyResult, GameState, RuleCite } from "../state/types.js";
import { CR } from "../timing/labels.js";

function fail(error: string, cites: RuleCite[]): ApplyResult {
  return { ok: false, error, cites };
}

function ok(state: GameState): ApplyResult {
  return { ok: true, state };
}

function hernandoIceRezSurcharge(state: GameState, cardId: string): number {
  const ice = state.cards[cardId];
  if (!ice || ice.type !== "ice") return 0;
  const subs = ice.subroutines?.length ?? 0;
  if (subs <= 0) return 0;
  for (const id of state.runner.rig) {
    const c = state.cards[id];
    const thr = c?.additionalIceRezCostEqualToSubroutineCountWhenCorpCreditsGte;
    if (typeof thr === "number" && state.corp.credits >= thr) {
      return subs;
    }
  }
  return 0;
}

function watchdogFirstIceRezReduction(state: GameState): number {
  if (state.turn.iceRezzedThisTurn > 0) return 0;
  let red = 0;
  for (const server of Object.values(state.servers)) {
    for (const id of server.root) {
      const c = state.cards[id];
      if (c?.rezzed && c.firstIceRezCostReductionPerRunnerTag) {
        red += state.runner.tags;
      }
    }
  }
  return red;
}

function firstIceRezIncrease(state: GameState): number {
  if (state.turn.iceRezzedThisTurn > 0) return 0;
  let increase = 0;
  for (const carrierId of runnerAbilityCarrierIds(state)) {
    if (abilitiesSuppressed(state, carrierId)) continue;
    increase += state.cards[carrierId]?.firstIceRezCostIncrease ?? 0;
  }
  return increase;
}

export function approachedIceId(state: GameState): string | null {
  const run = state.run;
  if (!run || run.position === null) return null;
  return state.servers[run.attackedServerId].ice[run.position] ?? null;
}

function forfeitAgenda(state: GameState): void {
  const id = state.corp.score.find((x) => !state.cards[x]?.cannotForfeit);
  if (!id) return;
  state.corp.score = state.corp.score.filter((x) => x !== id);
  const card = state.cards[id];
  state.lastForfeitedAgendaPoints = card.agendaPoints ?? 0;
  state.lastForfeitedAdvancementRequirement =
    card.advancementRequirement ??
    (card.defId ? getCardDef(card.defId)?.advancementRequirement : undefined) ??
    0;
  if (card.onForfeit) {
    const r = evalEffect({ state, sourceId: id }, card.onForfeit);
    if (!r.ok) {
      log(state, `Forfeit ${card.title} — onForfeit failed: ${r.error}`);
    }
  }
  // Jemison Astronautics identity
  const jemisonId = state.corp.identityId;
  const jemison = state.cards[jemisonId];
  if (jemison?.jemisonOnForfeitPlaceAdvancementsEqualAgendaPointsPlus1) {
    const jr = evalEffect(
      { state, sourceId: jemisonId },
      {
        op: "do",
        action: {
          kind: "jemison_place_advancements_on_forfeit",
          agendaPoints: state.lastForfeitedAgendaPoints,
        },
      },
    );
    if (!jr.ok) {
      log(state, `Jemison forfeit trigger failed: ${jr.error}`);
    }
  }
  state.corp.discard.push(id);
  card.zone = "corp:archives";
  card.faceup = true;
  log(state, `Forfeit ${card.title}.`);
}

function iceServerId(
  state: GameState,
  iceId: string,
): string | null {
  for (const [sid, server] of Object.entries(state.servers)) {
    if (server.ice.includes(iceId)) return sid;
  }
  return null;
}

export function rezIce(state: GameState, cardId: string): ApplyResult {
  const card = state.cards[cardId];
  if (!card || card.type !== "ice") {
    return fail("Not ice.", [CR.rezProcedure]);
  }
  if (state.turn.dagCannotRezCardIds?.includes(cardId)) {
    return fail("Cannot rez this card for the remainder of this turn (Councilman).", [
      CR.rezProcedure,
    ]);
  }
  const asNonIce =
    Boolean(card.rezAsNonIceDuringRunsOnServer) &&
    Boolean(state.run) &&
    iceServerId(state, cardId) === state.run!.attackedServerId;
  if (asNonIce) {
    const paw = currentWindow(state.timingKey);
    if (paw !== "approach_server_paw" && paw !== "corp_action_paw") {
      return fail(
        "This ice may only be rezzed as non-ice during approach-server or Corp action PAWs.",
        [CR.rezInPaw, CR.rezProcedure],
      );
    }
  } else if (state.timingKey !== "run.approachPaw") {
    return fail("Ice can only be rezzed during the approach PAW.", [
      CR.rezInPaw,
      CR.rezIceRestriction,
    ]);
  }
  ensurePriorityWindow(state);
  if (!asNonIce) {
    const approached = approachedIceId(state);
    if (approached !== cardId) {
      return fail("Only the approached ice may be rezzed here.", [
        CR.rezIceRestriction,
      ]);
    }
  }
  if (card.rezzed) {
    return fail("Ice is already rezzed.", [CR.rezProcedure]);
  }
  // DDoS: Corp cannot rez the outermost piece of ice during a run this turn.
  if (state.turn.uotCannotRezOutermostIce && state.run) {
    const sid = iceServerId(state, cardId);
    if (
      sid &&
      state.servers[sid as import("../state/types.js").ServerId]?.ice[0] ===
        cardId
    ) {
      return fail("DDoS — cannot rez outermost ice during a run this turn.", [
        CR.rezProcedure,
      ]);
    }
  }
  if (
    state.turn.cannotScoreOrRezCardIds.includes(cardId) ||
    state.cannotScoreOrRezUntilNextCorpTurnCardIds.includes(cardId)
  ) {
    return fail("Cannot rez this card for the remainder of this turn.", [
      CR.rezProcedure,
    ]);
  }
  const iqIncrease =
    (card.rezCostIncreasePerCorpCardInHq ?? 0) * state.corp.hand.length;
  const increase =
    (state.run?.iceRezCostIncrease ?? 0) +
    (state.run?.iceRezAdditionalCostEqualsPrintedRezCost
      ? (card.rezCost ?? 0)
      : 0) +
    (!state.run?.briberyFirstIceRezConsumed
      ? (state.run?.firstApproachedIceAdditionalRezCost ?? 0)
      : 0) +
    continuousIceRezCostIncrease(state, cardId) +
    (state.turn.iceAdditionalRezCostThisTurn[cardId] ?? 0) +
    firstIceRezIncrease(state) +
    hernandoIceRezSurcharge(state, cardId) +
    iqIncrease -
    (state.turn.pendingBioroidRezDiscount ?? 0) -
    watchdogFirstIceRezReduction(state);
  const discount =
    rezCostDiscountPerRezzedSubtype(state, cardId) +
    rezCostDiscountPerOtherUnrezzedIce(state, cardId) +
    rezCostDiscountIfAgendaScoredOrStolenThisTurn(state, cardId) +
    iceRezCostReductionFromScoredAgendaCounters(state);
  const serverReduction = continuousIceRezCostReduction(state, cardId);
  const advRezReduction =
    (card.rezCostReductionPerAdvancement ?? 0) *
    (card.advancementTokens ?? 0);
  let cost = Math.max(
    0,
    (card.rezCost ?? 0) + increase - discount - serverReduction - advRezReduction,
  );
  cost = applyHostServerRecurringTowardCorpRez(state, cardId, cost);
  cost = applyRezIceRecurringTowardCorpRez(state, cost);
  const agendaCreditDiscount = card.rezCostCreditDiscountOnForfeitAgenda ?? 0;
  let payCost = cost;
  let forfeitAgendaOnPay = false;
  if (state.turn.rezIceForfeitDiscountCardId === cardId) {
    state.turn.rezIceForfeitDiscountCardId = null;
    payCost = Math.max(0, cost - agendaCreditDiscount);
    forfeitAgendaOnPay = agendaCreditDiscount > 0;
  } else if (
    agendaCreditDiscount > 0 &&
    state.corp.score.length > 0 &&
    state.pendingRezCardId !== cardId
  ) {
    const discountedCost = Math.max(0, cost - agendaCreditDiscount);
    const canPayFull = state.corp.credits >= cost;
    const canPayDiscount = state.corp.credits >= discountedCost;
    if (!canPayFull && !canPayDiscount) {
      return fail("Insufficient credits to rez.", [
        CR.inherentRezCost,
        CR.rezProcedure,
      ]);
    }
    if (canPayDiscount && (canPayFull || state.corp.credits < cost)) {
      state.pendingRezCardId = cardId;
      state.pendingChoice = {
        sourceId: cardId,
        chooser: "corp",
        options: [
          ...(canPayFull
            ? [
                {
                  id: "rez-full",
                  label: `Rez paying full ${cost}¢`,
                  effect: {
                    op: "do" as const,
                    action: {
                      kind: "set_rez_ice_forfeit_discount" as const,
                      cardId,
                      forfeit: false,
                    },
                  },
                },
              ]
            : []),
          {
            id: "rez-forfeit-discount",
            label: `Forfeit 1 agenda (−${agendaCreditDiscount}¢) and rez for ${discountedCost}¢`,
            effect: {
              op: "do" as const,
              action: {
                kind: "set_rez_ice_forfeit_discount" as const,
                cardId,
                forfeit: true,
              },
            },
          },
        ],
      };
      log(
        state,
        `${card.title} — may forfeit an agenda for −${agendaCreditDiscount}¢ rez cost.`,
      );
      return ok(state);
    }
  }
  if (state.corp.credits < payCost) {
    return fail("Insufficient credits to rez.", [
      CR.inherentRezCost,
      CR.rezProcedure,
    ]);
  }
  if (card.rezAdditionalCostForfeitAgenda) {
    if (!state.corp.score.some((id) => !state.cards[id]?.cannotForfeit)) {
      return fail("Rez requires forfeiting 1 agenda.", [CR.rezProcedure]);
    }
  }
  let derezTarget: string | null = null;
  if (card.rezAdditionalCostDerezSubtype) {
    const subtype = card.rezAdditionalCostDerezSubtype;
    const targets: string[] = [];
    for (const server of Object.values(state.servers)) {
      for (const id of server.ice) {
        if (id === cardId) continue;
        const c = state.cards[id];
        if (c?.rezzed && (c.subtypes ?? []).includes(subtype)) {
          targets.push(id);
        }
      }
    }
    if (targets.length === 0) {
      return fail(
        `Rez requires derezzing another rezzed ${subtype} ice.`,
        [CR.rezProcedure],
      );
    }
    // Deterministic: first eligible target (multi-match auto-pick).
    derezTarget = targets[0]!;
  }
  // Valentão-class: additional rez cost Effect (may open a choice).
  if (card.rezAdditionalCost) {
    if (state.pendingRezCardId === cardId) {
      state.pendingRezCardId = null;
    } else {
      state.pendingRezCardId = cardId;
      const r = evalEffect(
        { state, sourceId: cardId },
        card.rezAdditionalCost,
      );
      if (!r.ok) {
        state.pendingRezCardId = null;
        return fail(r.error, r.cites);
      }
      if (state.pendingChoice) {
        // Drop remove-tag when Runner has no tags (must take bad publicity).
        if (state.runner.tags <= 0) {
          state.pendingChoice.options = state.pendingChoice.options.filter(
            (o) => o.id !== "remove-tag",
          );
        }
        if (state.pendingChoice.options.length === 1) {
          const only = state.pendingChoice.options[0]!;
          state.pendingChoice = null;
          const paid = evalEffect(
            { state, sourceId: cardId },
            only.effect,
          );
          if (!paid.ok) {
            state.pendingRezCardId = null;
            return fail(paid.error, paid.cites);
          }
          state.pendingRezCardId = null;
        } else if (state.pendingChoice.options.length === 0) {
          state.pendingRezCardId = null;
          state.pendingChoice = null;
          return fail("No legal additional rez cost.", [CR.rezProcedure]);
        } else {
          return ok(state);
        }
      } else {
        state.pendingRezCardId = null;
      }
    }
  }
  withCostCheckpoint(state, "rez_ice", () => {
    state.corp.credits -= payCost;
    if (forfeitAgendaOnPay) {
      forfeitAgenda(state);
    }
    if (card.rezAdditionalCostForfeitAgenda) {
      forfeitAgenda(state);
    }
    if (derezTarget) {
      const t = state.cards[derezTarget];
      t.rezzed = false;
      t.faceup = false;
      log(
        state,
        `Additional rez cost: derez ${t.title} (${card.rezAdditionalCostDerezSubtype}).`,
      );
    }
  });
  state.turn.pendingBioroidRezDiscount = 0;
  card.rezzed = true;
  card.faceup = true;
  if (state.run && state.timingKey === "run.approachPaw" && card.type === "ice") {
    state.run.iceRezzedDuringApproachId = cardId;
  }
  if (state.turn.socialEngineeringMarkedIce === cardId) {
    const gainAmt = card.rezCost ?? 0;
    if (gainAmt > 0) {
      state.runner.credits += gainAmt;
      log(state, `Social Engineering — Runner gains ${gainAmt}¢.`);
    }
    state.turn.socialEngineeringMarkedIce = undefined;
  }
  state.turn.iceRezzedThisTurn += 1;
  if (!state.turn.rezzedThisTurnIds) state.turn.rezzedThisTurnIds = [];
  if (!state.turn.rezzedThisTurnIds.includes(cardId)) {
    state.turn.rezzedThisTurnIds.push(cardId);
  }
  // Bribery: consume first-ice additional rez once any ice is rezzed this run.
  if (card.type === "ice" && state.run?.firstApproachedIceAdditionalRezCost) {
    state.run.briberyFirstIceRezConsumed = true;
  }
  // Collective Consciousness: draw when Corp rezzes ice.
  if (card.type === "ice") {
    for (const rid of [...state.runner.rig]) {
      const rc = state.cards[rid];
      const n = rc?.drawWhenCorpRezzesIce;
      if (typeof n !== "number" || n <= 0) continue;
      let drawn = 0;
      for (let i = 0; i < n; i++) {
        const top = state.runner.deck.shift();
        if (!top) break;
        state.runner.hand.push(top);
        state.cards[top]!.zone = "runner:grip";
        drawn += 1;
      }
      if (drawn > 0) {
        log(state, `${rc!.title} — draw ${drawn} (Corp rezzed ice).`);
      }
    }
  }
  const idCard = state.cards[state.corp.identityId];
  if (idCard?.onFirstIceRezEachTurn && state.turn.iceRezzedThisTurn === 1) {
    const r = evalEffect(
      { state, sourceId: state.corp.identityId },
      idCard.onFirstIceRezEachTurn,
    );
    if (!r.ok) return fail(r.error, r.cites);
  }
  // Los: Data Hijacker — first ice rez each turn → Runner identity effect.
  if (card.type === "ice") {
    const iceRezzedCount = (state.turn.rezzedThisTurnIds ?? []).filter(
      (id) => state.cards[id]?.type === "ice",
    ).length;
    if (iceRezzedCount === 1) {
      const runnerId = state.cards[state.runner.identityId];
      if (runnerId?.onFirstIceRezEachTurn) {
        const r = evalEffect(
          { state, sourceId: state.runner.identityId },
          runnerId.onFirstIceRezEachTurn,
        );
        if (!r.ok) return fail(r.error, r.cites);
      }
    }
  }
  if (
    (card.recurringCreditsMax ?? 0) > 0 ||
    card.recurringCreditsMaxEqualsRunnerLink ||
    card.recurringCreditsMaxEqualsVirusCounters ||
    card.recurringCreditsMaxEqualsRemoteServers ||
    card.recurringCreditsMaxEqualsIceProtectingHq
  ) {
    if (card.recurringCreditsMaxEqualsRunnerLink) {
      card.recurringCreditsMax = state.runner.link;
    }
    if (card.recurringCreditsMaxEqualsVirusCounters) {
      card.recurringCreditsMax = card.virusCounters ?? 0;
    }
    if (card.recurringCreditsMaxEqualsRemoteServers) {
      card.recurringCreditsMax = Object.keys(state.servers).filter((id) =>
        id.startsWith("remote"),
      ).length;
    }
    if (card.recurringCreditsMaxEqualsIceProtectingHq) {
      card.recurringCreditsMax = state.servers.hq?.ice.length ?? 0;
    }
    card.recurringCredits = card.recurringCreditsMax;
  }
  const base = card.rezCost ?? 0;
  let rezDetail = "";
  if (increase > 0 || discount > 0) {
    const parts: string[] = [`base ${base}`];
    if (increase > 0) parts.push(`+${increase}`);
    if (discount > 0) parts.push(`−${discount}`);
    rezDetail = ` (${parts.join("")})`;
  }
  log(
    state,
    `Corp rezzes ${card.title} for ${payCost}¢${rezDetail} (CR ${CR.rezInPaw.number}, ${CR.rezProcedure.number}).`,
  );
  // Amaze becomes persistent once rezzed during the run.
  if (state.run && (card.tagsIfAgendaStolenThisRun ?? 0) > 0) {
    const server = state.servers[state.run.attackedServerId];
    if (server.root.includes(cardId)) {
      state.run.persistentTagsIfAgendaStolen = Math.max(
        state.run.persistentTagsIfAgendaStolen ?? 0,
        card.tagsIfAgendaStolenThisRun ?? 0,
      );
    }
  }
  if (card.onRez) {
    const r = evalEffect({ state, sourceId: cardId }, card.onRez);
    if (!r.ok) return fail(r.error, r.cites);
  } else if (card.prevention?.jackOutForRun && state.run) {
    state.run.cannotJackOut = true;
    addRestriction(state, "jack_out", CR.cannotPrecedence, card.id);
  }
  if ((card.subtypes ?? []).includes("harmonic")) {
    firePowerOnHarmonicIceRez(state, cardId);
  }
  if (card.type === "ice") {
    fireHostedCreditsOnAnyIceRez(state, cardId);
    if (state.run) {
      if (!state.run.iceRezzedThisRunIds) state.run.iceRezzedThisRunIds = [];
      if (!state.run.iceRezzedThisRunIds.includes(cardId)) {
        state.run.iceRezzedThisRunIds.push(cardId);
      }
    }
  }
  firePowerCounterOnAnyCardRez(state, cardId);
  fireDagAfterCorpRez(state, cardId);
  fireSiAfterCorpRezOrPlay(state, cardId);
  if (state.pendingChoice) return ok(state);
  if (card.type === "ice") {
    fireHostRezStateTriggers(state, cardId, "rez");
    fireIceRezDuringRunHooks(state, cardId);
    fireOnAnyIceRez(state, cardId);
  }
  nestPriorityAfterAbility(state, "rez_ice");
  return ok(state);
}

export function rezAsset(state: GameState, cardId: string): ApplyResult {
  const paw = currentWindow(state.timingKey);
  if (paw !== "corp_action_paw" && paw !== "approach_server_paw") {
    return fail("Assets can only be rezzed in a Corp paid-ability window.", [
      CR.rezInPaw,
      CR.rezProcedure,
    ]);
  }
  ensurePriorityWindow(state);
  const card = state.cards[cardId];
  if (!card || (card.type !== "asset" && card.type !== "upgrade")) {
    return fail("Not an asset/upgrade.", [CR.rezProcedure]);
  }
  if (state.turn.dagCannotRezCardIds?.includes(cardId)) {
    return fail("Cannot rez this card for the remainder of this turn (Councilman).", [
      CR.rezProcedure,
    ]);
  }
  if (card.rezzed) {
    return fail("Already rezzed.", [CR.rezProcedure]);
  }
  if (card.rezRequiresTagged && !runnerIsTagged(state)) {
    return fail("Can only be rezzed if the Runner is tagged.", [CR.rezProcedure]);
  }
  if (
    state.turn.cannotScoreOrRezCardIds.includes(cardId) ||
    state.cannotScoreOrRezUntilNextCorpTurnCardIds.includes(cardId)
  ) {
    return fail("Cannot rez this card for the remainder of this turn.", [
      CR.rezProcedure,
    ]);
  }
  // Interdiction: Corp cannot rez non-ice during the Runner's turn.
  if (state.activeSide === "runner") {
    const blocked = Object.values(state.cards).some(
      (c) => c?.lingerAsCurrent && c.cannotRezNonIceDuringRunnerTurn,
    );
    if (blocked) {
      return fail(
        "Cannot rez non-ice cards during the Runner's turn (Interdiction).",
        [CR.rezProcedure],
      );
    }
  }
  const inRoot = Object.values(state.servers).some((srv) =>
    srv.root.includes(cardId),
  );
  if (!inRoot) {
    return fail("Card is not installed in a server root.", [CR.rezProcedure]);
  }
  if (paw === "approach_server_paw") {
    const sid = state.run?.attackedServerId;
    if (!sid || !state.servers[sid].root.includes(cardId)) {
      return fail("Only upgrades on the attacked server may be rezzed here.", [
        CR.rezProcedure,
      ]);
    }
  }
  const reduction = rootRezCostReduction(state, cardId);
  const discount = rezCostDiscountIfAgendaScoredOrStolenThisTurn(state, cardId);
  const cost = Math.max(0, (card.rezCost ?? 0) - reduction - discount);
  if (state.corp.credits < cost) {
    return fail("Insufficient credits to rez.", [
      CR.inherentRezCost,
      CR.rezProcedure,
    ]);
  }
  // Hacktivist Meeting: additional cost to rez non-ice — randomly trash HQ.
  {
    let hacktivist = false;
    for (const c of Object.values(state.cards)) {
      if (c?.rezNonIceAdditionalCostRandomTrashHq && c.lingerAsCurrent) {
        hacktivist = true;
        break;
      }
    }
    if (hacktivist) {
      if (state.corp.hand.length === 0) {
        return fail(
          "Hacktivist Meeting — must randomly trash a card from HQ.",
          [CR.rezProcedure],
        );
      }
      const pick =
        state.corp.hand[Math.floor(Math.random() * state.corp.hand.length)]!;
      state.corp.hand = state.corp.hand.filter((id) => id !== pick);
      state.corp.discard.push(pick);
      const trashed = state.cards[pick];
      if (trashed) {
        trashed.zone = "corp:archives";
        trashed.faceup = true;
      }
      log(
        state,
        `Hacktivist Meeting — randomly trash ${trashed?.title ?? pick} from HQ.`,
      );
    }
  }
  if (card.rezAdditionalCostForfeitAgenda) {
    if (!state.corp.score.some((id) => !state.cards[id]?.cannotForfeit)) {
      return fail("Rez requires forfeiting 1 agenda.", [CR.rezProcedure]);
    }
  }
  if (card.rezOnlyDuringCorpTurn && state.activeSide !== "corp") {
    return fail("This card can only be rezzed during your turn.", [
      CR.rezProcedure,
    ]);
  }
  withCostCheckpoint(state, "rez_asset", () => {
    state.corp.credits -= cost;
    if (card.rezAdditionalCostForfeitAgenda) {
      forfeitAgenda(state);
    }
  });
  card.rezzed = true;
  card.faceup = true;
  if (
    (card.recurringCreditsMax ?? 0) > 0 ||
    card.recurringCreditsMaxEqualsRunnerLink ||
    card.recurringCreditsMaxEqualsVirusCounters ||
    card.recurringCreditsMaxEqualsRemoteServers ||
    card.recurringCreditsMaxEqualsIceProtectingHq
  ) {
    if (card.recurringCreditsMaxEqualsRunnerLink) {
      card.recurringCreditsMax = state.runner.link;
    }
    if (card.recurringCreditsMaxEqualsVirusCounters) {
      card.recurringCreditsMax = card.virusCounters ?? 0;
    }
    if (card.recurringCreditsMaxEqualsRemoteServers) {
      card.recurringCreditsMax = Object.keys(state.servers).filter((id) =>
        id.startsWith("remote"),
      ).length;
    }
    if (card.recurringCreditsMaxEqualsIceProtectingHq) {
      card.recurringCreditsMax = state.servers.hq?.ice.length ?? 0;
    }
    card.recurringCredits = card.recurringCreditsMax;
  }
  if ((card.badPublicityCountersOnRez ?? 0) > 0) {
    card.badPublicityCounters = card.badPublicityCountersOnRez;
    log(
      state,
      `Load ${card.badPublicityCounters} bad publicity counter(s) on ${card.title}.`,
    );
  }
  if ((card.powerCountersOnRez ?? 0) > 0) {
    card.powerCounters = card.powerCountersOnRez;
    log(
      state,
      `Load ${card.powerCounters} power counter(s) on ${card.title}.`,
    );
  }
  if (card.rezSpendCreditsForPowerCounters) {
    const max = card.rezSpendCreditsForPowerCounters.max;
    const affordable = Math.min(max, state.corp.credits);
    if (affordable > 0) {
      const options: import("../effects/ir.js").ChoiceOption[] = [];
      for (let n = 0; n <= affordable; n++) {
        options.push({
          id: `rez-power:${n}`,
          label:
            n === 0
              ? "Place 0 power counters"
              : `Pay ${n}¢ → place ${n} power counter(s)`,
          effect: {
            op: "do",
            action: {
              kind: "rez_spend_credits_for_power_counters",
              amount: n,
            },
          },
        });
      }
      state.pendingChoice = {
        sourceId: cardId,
        chooser: "corp",
        options,
      };
      log(
        state,
        `${card.title} — may pay up to ${affordable}¢ for power counters.`,
      );
    }
  }
  log(
    state,
    `Corp rezzes ${card.title} for ${cost}¢ (CR ${CR.rezInPaw.number}, ${CR.rezProcedure.number}).`,
  );
  if ((card.handSizeBonus ?? 0) !== 0) {
    state.corp.maxHandSize += card.handSizeBonus!;
    log(
      state,
      `${card.title} — Corp max hand size +${card.handSizeBonus} → ${state.corp.maxHandSize}.`,
    );
  }
  syncAllTourGuideSubs(state);
  fireSparkAgencyOnAdvertisementRez(state, cardId);
  if (card.onRez) {
    const r = evalEffect({ state, sourceId: cardId }, card.onRez);
    if (!r.ok) return fail(r.error, r.cites);
  }
  firePowerCounterOnAnyCardRez(state, cardId);
  fireDagAfterCorpRez(state, cardId);
  fireSiAfterCorpRezOrPlay(state, cardId);
  if (state.pendingChoice) return ok(state);
  nestPriorityAfterAbility(state, "rez_asset");
  return ok(state);
}

/** Spark Agency: first advertisement rez each turn — Runner loses N¢. */
function fireSparkAgencyOnAdvertisementRez(
  state: GameState,
  rezzedId: string,
): void {
  const rezzed = state.cards[rezzedId];
  if (!rezzed || !(rezzed.subtypes ?? []).includes("advertisement")) return;
  if (state.turn.advertisementRezzedThisTurn) return;
  state.turn.advertisementRezzedThisTurn = true;
  const idCard = state.cards[state.corp.identityId];
  const lose = idCard?.loseCreditsOnFirstAdvertisementRezThisTurn;
  if (!lose || lose < 1) return;
  const lost = Math.min(lose, state.runner.credits);
  state.runner.credits -= lost;
  log(
    state,
    `${idCard!.title} — Runner loses ${lost}¢ (first advertisement rez this turn).`,
  );
}
