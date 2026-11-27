import { addRestriction, occurCheckpoint } from "../legality/checkpoints.js";

import { abilitiesSuppressed } from "../state/continuous/abilities.js";

import { log } from "../state/setupAndEnd/createGame.js";
import { lookAtChoiceCards } from "../state/visibility/reveal.js";
import { currentMark } from "../state/keywordsAndCredits/keywords.js";

import { syncGainsSubroutinesPerAdvancement } from "../state/counters/powerCounters.js";
import {
  effectiveRunnerTags,
  runnerIsTagged,
} from "../state/keywordsAndCredits/tags.js";
import {
  canScoreAgenda,
  agendaPointsFor,
} from "../state/turnAndActions/scoring.js";
import { memoryLimit, usedMemory } from "../state/turnAndActions/turn.js";
import type { GameState } from "../state/types/game.js";
import type { RuleCite } from "../state/types/restrictions.js";
import type { Side } from "../state/types/shared.js";
import { CR } from "../timing/labels.js";
import { fx } from "./ir/fx.js";
import { type Cond } from "./ir/cond.js";
import { type Effect } from "./ir/effect.js";
import { type Primitive } from "./ir/primitive.js";
import { type SideRef } from "./ir/shared.js";
import { applyCoreKinds } from "./coreKinds.js";

import {
  currentReactionWindow,
  pendingAbilitiesWithStatus,
} from "../state/triggers/pendingAbilities.js";

import { applyHostedCreditPrimitive } from "./keywordsAndCredits/hostedCreditPrimitives.js";
import { applyDamagePrimitive } from "./damageAndPrevention/damagePrimitives.js";
import { applyChooseCard } from "./triggers/chooseCard.js";
import { applyChooseCards } from "./triggers/chooseCards.js";
import { applyRunPrimitive } from "./run/runPrimitives.js";
import {
  applyTagPrimitive,
  canPayTakeTagsNestedCost,
} from "./keywordsAndCredits/tagPrimitives.js";
import { applyDrawPrimitive, drawCards } from "./searchAndDeck/draw.js";
import { applyCreditPrimitive } from "./keywordsAndCredits/creditPrimitives.js";
import {
  deferContinuationAfter,
  effectResolutionBlocked,
} from "./continuation.js";
import { applyTracePrimitive } from "./turnAndActions/tracePrimitives.js";
import { applyClickPrimitive } from "./turnAndActions/clickPrimitives.js";
import { applyPsiPrimitive } from "./turnAndActions/psiPrimitives.js";
import { applyBadPublicityPrimitive } from "./keywordsAndCredits/badPublicityPrimitives.js";
import { applyCorpInstallPrimitive } from "./install/corpInstall.js";
import { applyCounterPrimitive } from "./counters/counterPrimitives.js";
import { applyEncounterPrimitive } from "./run/encounterPrimitives.js";
import { iceStrength } from "./continuous/iceStrength.js";
import { openPendingChoose } from "../state/triggers/pendingChoice.js";

export interface EffectCtx {
  state: GameState;
  /** Card whose ability/sub is firing. */
  sourceId: string;
  /** Who paid (paid abilities); defaults to source.side. */
  payerSide?: Side;
  /**
   * The printed instruction tells the Runner to suffer the damage, so the
   * Runner is responsible for it (CR 10.4.1).
   */
  runnerSuffers?: boolean;
}

export type EvalResult =
  { ok: true } | { ok: false; error: string; cites: RuleCite[] };

import {
  fireOnBypassTriggers,
  fireHostRezStateTriggers,
  fireOnAnyIceRez,
} from "../state/rez/iceRezHooks.js";
import {
  fireOnAccess,
  fireOnForfeit,
  fireOnFullyBreak,
  fireOnInstall,
  fireOnMovedToServerRoot,
  noteCheckpointAndResolvePlay,
  fireOnRez,
} from "../state/triggers/cardLifecycleHooks.js";
import { trashCard } from "../state/hostingAndTrash/trash.js";
import { subroutinesBrokenByRunnerCount } from "../state/turnAndActions/break.js";
import { maybeFireZwickyCreditsGained } from "./keywordsAndCredits/abilityCreditGain.js";
export {
  fireOnBypassTriggers,
  fireHostRezStateTriggers,
  fireOnAnyIceRez,
  fireOnAccess,
  fireOnForfeit,
  fireOnFullyBreak,
  fireOnInstall,
  fireOnMovedToServerRoot,
  noteCheckpointAndResolvePlay,
  fireOnRez,
};

/**
 * Dadiana Chacon: whenever Runner has 0 credits, trash self and take N meat.
 */

export function maybeFireKerosMcintyreOnDerez(state: GameState): void {
  if (state.turn.kerosMcintyreDerezGainUsedThisTurn) return;
  for (const rid of [...state.runner.installed]) {
    if (abilitiesSuppressed(state, rid)) continue;
    const card = state.cards[rid];
    const n = card?.gainCreditsOnFirstDerezIceEachTurn;
    if (typeof n !== "number" || n <= 0) continue;
    state.turn.kerosMcintyreDerezGainUsedThisTurn = true;
    state.runner.credits += n;
    log(
      state,
      `${card!.title} — gain ${n}¢ (first ice derez this turn) → ${state.runner.credits}¢.`,
    );
    break;
  }
}

function maybeFireDadianaChaconZeroCredits(state: GameState): void {
  if (state.runner.credits !== 0) return;
  for (const rid of [...state.runner.installed]) {
    const card = state.cards[rid];
    const n = card?.trashSelfAndMeatDamageWhenCreditsZero;
    if (typeof n !== "number" || n <= 0) continue;
    // Its own ability trashes it (CR 1.14.5).
    trashCard(state, rid, { by: "runner" });
    log(state, `${card!.title} trashed (0 credits).`);
    const r = evalEffect(
      { state, sourceId: rid },
      { op: "do", action: { kind: "meat_damage", amount: n } },
    );
    if (!r.ok) {
      log(state, `${card!.title} meat damage failed: ${r.error}`);
    }
  }
}

export function resolveSide(ctx: EffectCtx, ref: SideRef): Side {
  if (ref === "corp" || ref === "runner") return ref;
  if (ref === "payer") {
    return ctx.payerSide ?? ctx.state.cards[ctx.sourceId].side;
  }
  return ctx.state.cards[ctx.sourceId].side;
}

/** Install cost after card-level discounts, then effect discount. */

/**
 * Flux Capacitor: after the first subroutine break this encounter with host
 * ice, offer may-charge. Returns true when a pendingChoice was opened.
 */
export function maybeFireFluxFirstBreakCharge(state: GameState): boolean {
  const enc = state.run?.encounter;
  if (!enc) return false;
  const brokenCount = subroutinesBrokenByRunnerCount(enc);
  if (brokenCount !== 1) return false;
  const fired = enc.firstBreakChargeFiredIds ?? [];
  for (const id of state.runner.installed) {
    const card = state.cards[id];
    if (
      !card?.chargeOnFirstBreakDuringHostEncounter ||
      card.hostId !== enc.iceId ||
      fired.includes(id)
    ) {
      continue;
    }
    enc.firstBreakChargeFiredIds = [...fired, id];
    const r = evalEffect({ state, sourceId: id }, fx.mayChargeChoose());
    if (!r.ok) {
      log(state, `Flux first-break charge failed on ${card.title}: ${r.error}`);
      continue;
    }
    if (state.pendingChoice) return true;
  }
  return false;
}

export function offerMayChargeCard(
  state: GameState,
  cardId: string,
  sourceId: string,
): EvalResult {
  const card = state.cards[cardId];
  if (!card || (card.powerCounters ?? 0) < 1) {
    log(
      state,
      `May charge ${card?.title ?? cardId} — not able (CR ${CR.chargeRequiresCounter.number}).`,
    );
    return { ok: true };
  }
  openPendingChoose(state, {
    sourceId,
    chooser: "runner",
    options: [
      {
        id: "charge",
        label: `Charge ${card.title}`,
        effect: {
          op: "do" as const,
          action: {
            kind: "charge" as const,
            pick: "card" as const,
            cardId,
          },
        },
      },
      {
        id: "decline",
        label: "Decline to charge",
        effect: {
          op: "do" as const,
          action: {
            kind: "gain_credits" as const,
            side: "runner" as const,
            amount: 0,
          },
        },
      },
    ],
    logLine: `May charge ${card.title} (CR ${CR.charge.number}).`,
  });
  return { ok: true };
}

/**
 * Offer the next unused exclusive option, or auto-resolve when only one
 * remains. Clears `pendingExclusiveChoices` when done.
 */
function offerNextExclusiveChoice(state: GameState): EvalResult {
  const pend = state.pendingExclusiveChoices;
  if (!pend || pend.remaining <= 0) {
    state.pendingExclusiveChoices = null;
    return { ok: true };
  }
  const available = pend.options.filter((o) => !pend.usedIds.includes(o.id));
  if (available.length === 0) {
    state.pendingExclusiveChoices = null;
    log(state, `Exclusive choices — no unused options left.`);
    return { ok: true };
  }
  if (available.length === 1) {
    const o = available[0]!;
    pend.usedIds.push(o.id);
    pend.remaining -= 1;
    log(state, `Exclusive choice auto-resolve "${o.label}".`);
    const r = evalEffect({ state, sourceId: pend.sourceId }, o.effect);
    if (!r.ok) return r;
    if (
      state.pendingChoice ||
      state.pendingTrashProgram ||
      state.pendingSabotage ||
      state.pendingDamage ||
      state.trace
    ) {
      return r;
    }
    return offerNextExclusiveChoice(state);
  }
  openPendingChoose(state, {
    sourceId: pend.sourceId,
    chooser: pend.chooser,
    options: available.map((o) => ({
      id: o.id,
      label: o.label,
      effect: structuredClone(o.effect),
    })),
    logLine: `Exclusive choices — ${pend.remaining} remaining among ${available.length} options (from ${state.cards[pend.sourceId]?.title ?? pend.sourceId}).`,
  });
  return { ok: true };
}

/**
 * After a nested pendingChoice resolves, continue exclusive multi-choice
 * if any remain. Call from choose_option after the selected effect settles.
 */
export function resumeExclusiveChoicesIfPending(state: GameState): EvalResult {
  if (!state.pendingExclusiveChoices) return { ok: true };
  if (
    state.pendingChoice ||
    state.pendingTrashProgram ||
    state.pendingSabotage ||
    state.pendingDamage ||
    state.trace
  ) {
    return { ok: true };
  }
  return offerNextExclusiveChoice(state);
}

export function startExclusiveChoicesExactlyN(
  state: GameState,
  sourceId: string,
  n: number,
  options: Array<{ id: string; label: string; effect: Effect }>,
  chooser: "corp" | "runner",
): EvalResult {
  const remaining = Math.min(n, options.length);
  if (remaining <= 0) {
    log(state, `Choose exactly ${n} — no options to resolve.`);
    return { ok: true };
  }
  state.pendingExclusiveChoices = {
    sourceId,
    chooser,
    options: options.map((o) => ({
      id: o.id,
      label: o.label,
      effect: structuredClone(o.effect),
    })),
    remaining,
    usedIds: [],
  };
  log(state, `Choose exactly ${n} — resolve ${remaining} exclusive option(s).`);
  return offerNextExclusiveChoice(state);
}

export function startExclusiveChoicesPerPassedIce(
  state: GameState,
  sourceId: string,
  options: Array<{ id: string; label: string; effect: Effect }>,
): EvalResult {
  const passed = state.run?.passedIceIds?.length ?? 0;
  const remaining = Math.min(passed, options.length);
  if (remaining <= 0) {
    log(
      state,
      `Exclusive choices per passed ice — passed ${passed}; nothing to resolve.`,
    );
    return { ok: true };
  }
  state.pendingExclusiveChoices = {
    sourceId,
    chooser: "runner",
    options: options.map((o) => ({
      id: o.id,
      label: o.label,
      effect: structuredClone(o.effect),
    })),
    remaining,
    usedIds: [],
  };
  log(
    state,
    `Exclusive choices per passed ice — passed ${passed}, resolve ${remaining} (CR ${CR.successfulRun.number}).`,
  );
  return offerNextExclusiveChoice(state);
}

function iceProtectsRemote(state: GameState, iceId: string): boolean {
  for (const server of Object.values(state.servers)) {
    if (server.ice.includes(iceId)) {
      return server.kind === "remote";
    }
  }
  return false;
}

function iceProtectsCentral(state: GameState, iceId: string): boolean {
  for (const server of Object.values(state.servers)) {
    if (server.ice.includes(iceId)) {
      return server.kind === "central";
    }
  }
  return false;
}

export function serverHostingCard(
  state: GameState,
  cardId: string,
): import("../state/types/servers.js").Server | null {
  for (const server of Object.values(state.servers)) {
    if (server.root.includes(cardId) || server.ice.includes(cardId)) {
      return server;
    }
  }
  return null;
}

export function hostServerUnprotectedByIce(
  state: GameState,
  sourceId: string,
): boolean {
  const server = serverHostingCard(state, sourceId);
  if (!server) return false;
  return server.ice.length === 0;
}

export function finishPlaceAdvancementsOnTarget(
  ctx: EffectCtx,
  action: Extract<Primitive, { kind: "place_advancements" }>,
  sourceId: string,
  source: import("../state/types/card.js").CardInstance,
  targetId: string,
): EvalResult {
  const { state } = ctx;
  const target = state.cards[targetId];
  if (!target) {
    log(state, `Place advancements — invalid target.`);
    if (action.then) return evalEffect(ctx, action.then);
    return { ok: true };
  }
  let amount = action.amount;
  if (
    (action.bonusAmountIfNoCorpInstallFromHqThisTurn ?? 0) > 0 &&
    !state.turn.corpInstalledFromHqThisTurn
  ) {
    amount += action.bonusAmountIfNoCorpInstallFromHqThisTurn!;
  }
  const prior = target.advancementCounters ?? 0;
  target.advancementCounters = prior + amount;
  state.turn.lastAdvancementTargetId = targetId;
  syncGainsSubroutinesPerAdvancement(target);
  if (action.cannotScoreTargetThisTurn) {
    if (!state.turn.cannotScoreOrRezCardIds.includes(targetId)) {
      state.turn.cannotScoreOrRezCardIds.push(targetId);
    }
  }
  log(
    state,
    `Place ${amount} advancement(s) on ${target.title} → ${target.advancementCounters}.`,
  );
  const after = action.then;
  if (action.thenMayScore && canScoreAgenda(state, target)) {
    const scoreFx: Effect = {
      op: "do",
      action: { kind: "score_agenda_card", cardId: targetId },
    };
    const options: Array<{ id: string; label: string; effect: Effect }> = [
      {
        id: `score:${targetId}`,
        label: `Score ${target.title}`,
        effect: after
          ? { op: "seq", effects: [scoreFx, structuredClone(after)] }
          : scoreFx,
      },
      {
        id: "decline",
        label: "Decline",
        effect: after
          ? structuredClone(after)
          : {
              op: "do",
              action: {
                kind: "gain_credits",
                side: "corp",
                amount: 0,
              },
            },
      },
    ];
    openPendingChoose(state, {
      sourceId,
      chooser: "corp",
      options,
      logLine: `${source.title} — may score ${target.title} (CR ${CR.scoringAgenda.number}).`,
    });
    return { ok: true };
  }
  if (after) return evalEffect(ctx, after);
  return { ok: true };
}

function evalCond(ctx: EffectCtx, cond: Cond): boolean {
  if (
    cond === null ||
    typeof cond !== "object" ||
    typeof (cond as { op?: unknown }).op !== "string"
  ) {
    return false;
  }
  const { state, sourceId } = ctx;
  const source = state.cards[sourceId];
  switch (cond.op) {
    case "true":
      return true;
    case "false":
      return false;
    case "during_run":
      return state.run !== null;
    case "source_is_breaker":
      return Boolean(source.breaker);
    case "source_is_ice":
      return source.type === "ice";
    case "source_rezzed":
      return Boolean(source.rezzed);
    case "grip_nonempty":
      return state.runner.hand.length > 0;
    case "has_installed_program":
      return state.runner.installed.some(
        (id) => state.cards[id].type === "program",
      );
    case "runner_tagged":
      return runnerIsTagged(state);
    case "tags_gte":
      return effectiveRunnerTags(state) >= cond.amount;
    case "first_mandate_this_turn":
      // Sudden Commandment is counted when played; first means ≤ 1 including self.
      return (state.turn.mandatesPlayedThisTurn ?? 0) <= 1;
    case "clicks_remaining": {
      const side = resolveSide(ctx, cond.side);
      const p = side === "corp" ? state.corp : state.runner;
      return p.clicks > 0;
    }
    case "clicks_gte": {
      const side = resolveSide(ctx, cond.side);
      const p = side === "corp" ? state.corp : state.runner;
      return p.clicks >= cond.amount;
    }
    case "credits_gt_other_side": {
      const side = resolveSide(ctx, cond.side);
      const mine = side === "corp" ? state.corp.credits : state.runner.credits;
      const theirs =
        side === "corp" ? state.runner.credits : state.corp.credits;
      return mine > theirs;
    }
    case "credits_eq_other_side": {
      const side = resolveSide(ctx, cond.side);
      const mine = side === "corp" ? state.corp.credits : state.runner.credits;
      const theirs =
        side === "corp" ? state.runner.credits : state.corp.credits;
      return mine === theirs;
    }
    case "credits_lte": {
      const side = resolveSide(ctx, cond.side);
      const p = side === "corp" ? state.corp : state.runner;
      return p.credits <= cond.amount;
    }
    case "credits_gte": {
      const side = resolveSide(ctx, cond.side);
      const p = side === "corp" ? state.corp : state.runner;
      return p.credits >= cond.amount;
    }
    case "protecting_remote":
      return iceProtectsRemote(state, sourceId);
    case "protecting_central":
      return iceProtectsCentral(state, sourceId);
    case "not":
      return !evalCond(ctx, cond.cond);
    case "ice_rezzed_this_turn":
      return (state.turn.iceRezzedThisTurn ?? 0) > 0;
    case "self_scored_this_turn":
      return (state.turn.scoredCardIdsThisTurn ?? []).includes(sourceId);
    case "hq_nonempty":
      return state.corp.hand.length > 0;
    case "has_installed_resource":
      return state.runner.installed.some(
        (id) => state.cards[id].type === "resource",
      );
    case "grip_count_odd":
      return state.runner.hand.length % 2 === 1;
    case "grip_count_gte":
      return state.runner.hand.length >= cond.amount;
    case "hq_count_gt_grip":
      return state.corp.hand.length > state.runner.hand.length;
    case "grip_count_eq_hq":
      return state.runner.hand.length === state.corp.hand.length;
    case "encounter_ice_strength_lte": {
      const iceId = state.run?.encounter?.iceId;
      if (!iceId) return false;
      return iceStrength(state, iceId) <= cond.amount;
    }
    case "no_successful_run_on_host_server_last_turn": {
      const host = serverHostingCard(state, sourceId);
      // Daily Quest pays only when this card's server had no successful run.
      if (!host) return false;
      return !(state.turn.successfulRunServersLastTurn ?? []).includes(host.id);
    }
    case "successful_run_this_turn":
      return state.turn.successfulRunThisTurn;
    case "self_installed_this_turn":
      return (state.turn.installedThisTurn ?? []).includes(sourceId);
    case "run_unsuccessful":
      return state.run?.successful === false;
    case "run_successful":
      return state.run?.successful === true;
    case "attacking_central": {
      const sid = state.run?.attackedServerId;
      return sid === "hq" || sid === "rd" || sid === "archives";
    }
    case "attacking_rd":
      return state.run?.attackedServerId === "rd";
    case "attacking_hq":
      return state.run?.attackedServerId === "hq";
    case "attacking_archives":
      return state.run?.attackedServerId === "archives";
    case "attacking_remote": {
      const sid = state.run?.attackedServerId;
      if (!sid) return false;
      return state.servers[sid]?.kind === "remote";
    }
    case "advancements_gte":
      return (source.advancementCounters ?? 0) >= cond.amount;
    case "agenda_counters_gte":
      return (source.agendaCounters ?? 0) >= cond.amount;
    case "hq_count_lte":
      return state.corp.hand.length <= cond.amount;
    case "power_counters_gte":
      return (source.powerCounters ?? 0) >= cond.amount;
    case "hosted_credits_gte":
      return (source.hostedCredits ?? 0) >= cond.amount;
    case "virus_counters_gte":
      return (source.virusCounters ?? 0) >= cond.amount;
    case "has_mark":
      return currentMark(state) !== null;
    case "attacking_mark":
      return (
        currentMark(state) !== null &&
        state.run?.attackedServerId === currentMark(state)
      );
    case "source_protects_attacked_server": {
      if (!state.run) return false;
      const server = state.servers[state.run.attackedServerId];
      if (!server) return false;
      return server.ice.includes(sourceId) || server.root.includes(sourceId);
    }
    case "source_installed": {
      const zone = source.zone ?? "";
      return zone.endsWith(":root") || zone.endsWith(":ice");
    }
    case "another_copy_of_source_title_in_either_score_area": {
      const title = source.title;
      let count = 0;
      for (const id of [...state.corp.scoreArea, ...state.runner.scoreArea]) {
        if (state.cards[id]?.title === title) count++;
      }
      return count >= 2;
    }
    case "threat": {
      const corpPts = agendaPointsFor(state, "corp");
      const runnerPts = agendaPointsFor(state, "runner");
      return Math.max(corpPts, runnerPts) >= cond.level;
    }
    case "source_has_subtype":
      return (source.subtypes ?? []).includes(cond.subtype);
    case "host_server_unprotected_by_ice":
      return hostServerUnprotectedByIce(state, sourceId);
    case "attacked_server_protected_by_ice": {
      if (!state.run) return false;
      const server = state.servers[state.run.attackedServerId];
      return (server?.ice.length ?? 0) > 0;
    }
    case "attacking_chosen_server":
      return Boolean(
        state.run &&
        source.chosenServerId &&
        state.run.attackedServerId === source.chosenServerId,
      );
    case "last_agenda_scored_or_stolen_from_source_server_root": {
      const host = serverHostingCard(state, sourceId);
      if (!host) return false;
      return state.turn.lastAgendaScoredOrStolenServerId === host.id;
    }
    case "successful_all_centrals_this_turn":
      return (
        state.turn.successfulHqRunThisTurn &&
        state.turn.successfulRdRunThisTurn &&
        state.turn.successfulArchivesRunThisTurn
      );
    case "corp_played_operation_this_turn":
      return (state.turn.corpOperationsPlayedThisTurn ?? 0) > 0;
    case "identity_flipped":
      return Boolean(source.identityFlipped);
    case "identity_unflipped":
      return !source.identityFlipped;
    case "accessed_a_card_this_turn":
      return Boolean(state.turn.accessedACardThisTurn);
    case "not_accessed_a_card_this_turn":
      return !state.turn.accessedACardThisTurn;
    case "last_scored_agenda_installed_this_turn": {
      const scored = state.turn.scoredCardIdsThisTurn ?? [];
      const last = scored[scored.length - 1];
      if (!last) return false;
      return (state.turn.installedThisTurn ?? []).includes(last);
    }
    case "played_from_non_hq":
      return Boolean(state.turn.operationPlayedFromNonHq);
    case "and":
      return cond.conds.every((c) => evalCond(ctx, c));
    case "or":
      return cond.conds.some((c) => evalCond(ctx, c));
    case "identity_has_subtype": {
      const idCard = state.cards[state.runner.identityId];
      return (idCard?.subtypes ?? []).includes(cond.subtype);
    }
    case "link_gte": {
      const idCard = state.cards[state.runner.identityId];
      const printed = idCard?.link ?? 0;
      const effective = Math.max(state.runner.link ?? 0, printed);
      return effective >= cond.amount;
    }
    case "runner_mu_full":
      return usedMemory(state) >= memoryLimit(state);
    case "runner_unused_mu_gte":
      return memoryLimit(state) - usedMemory(state) >= cond.amount;
    case "subroutine_resolved_this_run":
      return Boolean(state.run?.subroutineResolvedThisRun);
    case "lost_click_to_break_this_run":
      return Boolean(state.run?.lostClickToBreakThisRun);
    case "clicks_gained_this_run_gte": {
      return (state.run?.clicksGainedThisRun ?? 0) >= cond.amount;
    }
    case "did_not_break_printed_sub_with_decoder_this_encounter": {
      return !state.run?.encounter?.brokePrintedSubWithDecoder;
    }
    default: {
      const _c: never = cond;
      void _c;
      return false;
    }
  }
}

export function applyPrimitive(ctx: EffectCtx, action: Primitive): EvalResult {
  const chosen = applyChooseCard(ctx, action);
  if (chosen) return chosen;
  const chosenCards = applyChooseCards(ctx, action, evalEffect);
  if (chosenCards) return chosenCards;
  const hostedCredits = applyHostedCreditPrimitive(ctx, action, drawCards);
  if (hostedCredits) return hostedCredits;
  const damage = applyDamagePrimitive(
    ctx,
    action,
    evalEffect,
    serverHostingCard,
  );
  if (damage) return damage;
  const run = applyRunPrimitive(
    ctx,
    action,
    (s, id, by) => trashCard(s, id, { by }),
    canPayTakeTagsNestedCost,
  );
  if (run) return run;
  const tags = applyTagPrimitive(ctx, action, evalEffect);
  if (tags) return tags;
  const drawn = applyDrawPrimitive(ctx, action, resolveSide);
  if (drawn) return drawn;
  const credits = applyCreditPrimitive(
    ctx,
    action,
    resolveSide,
    evalEffect,
    maybeFireZwickyCreditsGained,
    maybeFireDadianaChaconZeroCredits,
  );
  if (credits) return credits;
  const trace = applyTracePrimitive(ctx, action);
  if (trace) return trace;
  const clicks = applyClickPrimitive(ctx, action, resolveSide, evalEffect);
  if (clicks) return clicks;
  const psi = applyPsiPrimitive(ctx, action);
  if (psi) return psi;
  const badPublicity = applyBadPublicityPrimitive(ctx, action);
  if (badPublicity) return badPublicity;
  const corpInstall = applyCorpInstallPrimitive(ctx, action);
  if (corpInstall) return corpInstall;
  const counters = applyCounterPrimitive(ctx, action);
  if (counters) return counters;
  const encounter = applyEncounterPrimitive(ctx, action);
  if (encounter) return encounter;

  const core = applyCoreKinds(ctx, action);
  if (core) return core;

  const _a = action;
  return {
    ok: false,
    error: `Unhandled primitive: ${JSON.stringify(_a)}`,
    cites: [],
  };
}

/** Pay a swap's remaining credit gain once its install trigger has resolved (CR 8.8.4b). */
export function payPendingSwapContinuation(state: GameState): void {
  const gain = state.turn.pendingSwapContinuationCredits ?? 0;
  if (gain <= 0 || state.pendingChoice) return;
  state.turn.pendingSwapContinuationCredits = undefined;
  state.corp.credits += gain;
  log(state, `Corp gains ${gain}¢.`);
}

/** Resume a seq that paused on pendingDamage / pendingTags / pendingChoice. */
export function resumePendingEffectContinuation(state: GameState): void {
  const cont = state.pendingEffectContinuation;
  if (!cont) return;
  if (effectResolutionBlocked(state)) return;
  state.pendingEffectContinuation = cont.followedBy ?? null;
  const r = evalEffect(
    {
      state,
      sourceId: cont.sourceId,
      ...(cont.payerSide ? { payerSide: cont.payerSide } : {}),
    },
    { op: "seq", effects: cont.effects },
  );
  if (!r.ok) {
    log(state, `Effect continuation failed: ${r.error}`);
  }
  if (!effectResolutionBlocked(state)) {
    resumePendingEffectContinuation(state);
  }
}

/**
 * After an interrupt paused a reaction window, finish what belongs to that
 * window first: the rest of the instance that was resolving (CR 9.2.8d).
 * The window's other pending instances resume next, and an outer
 * instruction's remainder last (CR 9.11.3, 10.3.2). Returns once the head
 * continuation belongs to no paused window or play pauses again.
 */
export function resumeContinuationsOfPausedWindows(state: GameState): void {
  const paused = new Set(
    pendingAbilitiesWithStatus(state, "pending")
      .map((p) => p.windowId)
      .filter((id): id is string => Boolean(id)),
  );
  for (;;) {
    const cont = state.pendingEffectContinuation;
    if (!cont?.windowId || !paused.has(cont.windowId)) return;
    if (effectResolutionBlocked(state)) return;
    state.pendingEffectContinuation = cont.followedBy ?? null;
    const r = evalEffect(
      { state, sourceId: cont.sourceId },
      { op: "seq", effects: cont.effects },
    );
    if (!r.ok) log(state, `Effect continuation failed: ${r.error}`);
  }
}

/** Execute an effect tree against game state (mutates). */
export function evalEffect(ctx: EffectCtx, effect: Effect): EvalResult {
  switch (effect.op) {
    case "seq": {
      for (let i = 0; i < effect.effects.length; i++) {
        const e = effect.effects[i]!;
        // Damage/tag interrupt abilities may reduce an already-open pending
        // window (Prāna / AirbladeX-class) then continue with place/gain —
        // only pause when a *new* pendingDamage/Tags is opened mid-seq.
        const hadPendingDamage = Boolean(ctx.state.pendingDamage);
        const hadPendingTags = Boolean(ctx.state.pendingTags);
        const hadPendingExpose = Boolean(ctx.state.pendingExpose);
        const hadPendingTrashPrevent = Boolean(ctx.state.pendingTrashPrevent);
        const r = evalEffect(ctx, e);
        if (!r.ok) return r;
        const openedNewDamage =
          Boolean(ctx.state.pendingDamage) && !hadPendingDamage;
        const openedNewTags = Boolean(ctx.state.pendingTags) && !hadPendingTags;
        const openedNewExpose =
          Boolean(ctx.state.pendingExpose) && !hadPendingExpose;
        const openedNewTrashPrevent =
          Boolean(ctx.state.pendingTrashPrevent) && !hadPendingTrashPrevent;
        // Pause seq when a choice / pending target is opened.
        if (
          ctx.state.pendingChoice ||
          ctx.state.pendingTrashProgram ||
          ctx.state.pendingSabotage ||
          openedNewDamage ||
          openedNewTags ||
          openedNewExpose ||
          openedNewTrashPrevent ||
          ctx.state.trace ||
          ctx.state.psi
        ) {
          const rest = effect.effects.slice(i + 1);
          if (rest.length > 0) {
            deferContinuationAfter(ctx.state, {
              sourceId: ctx.sourceId,
              effects: rest,
              windowId: currentReactionWindow(ctx.state)?.id,
            });
          }
          return { ok: true };
        }
        // The current instruction has finished. The next one is not yet
        // imminent (CR 9.1.2). One printed sentence is one instruction, with
        // no checkpoint inside it (CR 9.11.3).
        if (i + 1 < effect.effects.length && !effect.oneInstruction) {
          occurCheckpoint(
            ctx.state,
            "instruction",
            "Between instructions",
            [CR.resolveAbility],
            ctx.sourceId,
          );
        }
      }
      return { ok: true };
    }
    case "do": {
      const open = ctx.state.pendingChoice;
      const looksBefore = ctx.state.lookSeq ?? 0;
      const result = applyPrimitive(ctx, effect.action);
      // CR 1.21.2, CR 8.7.1: a choice opened by a look or a search is made
      // from cards the other player may not see, and the player making it is
      // the one looking.
      const opened = ctx.state.pendingChoice;
      if (
        opened &&
        opened !== open &&
        /^(look|search)_/.test(effect.action.kind)
      ) {
        opened.look = true;
        for (const event of ctx.state.looks ?? []) {
          if (event.seq > looksBefore) event.by = opened.chooser;
        }
        for (const card of Object.values(ctx.state.cards)) {
          if (card.lookedBy) card.lookedBy = opened.chooser;
        }
        lookAtChoiceCards(ctx.state);
      }
      return result;
    }
    case "if": {
      if (evalCond(ctx, effect.cond)) {
        return evalEffect(ctx, effect.then);
      }
      if (effect.else) return evalEffect(ctx, effect.else);
      return { ok: true };
    }
    case "prevent": {
      if (effect.forbid === "jack_out") {
        if (ctx.state.run) ctx.state.run.cannotJackOut = true;
        addRestriction(
          ctx.state,
          "jack_out",
          CR.cannotPrecedence,
          ctx.sourceId,
        );
        return { ok: true };
      }
      return { ok: true };
    }
    case "choose": {
      openPendingChoose(ctx.state, {
        sourceId: ctx.sourceId,
        chooser: effect.chooser,
        options: effect.options.map((o) => ({
          id: o.id,
          label: o.label,
          effect: structuredClone(o.effect),
        })),
        logLine: `Choice pending for ${effect.chooser} (${effect.options.length} options) from ${ctx.state.cards[ctx.sourceId].title}.`,
      });
      return { ok: true };
    }
    default: {
      const _e: never = effect;
      return {
        ok: false,
        error: `Unhandled effect op: ${JSON.stringify(_e)}`,
        cites: [],
      };
    }
  }
}

/**
 * Preconditions for paying a paid ability whose effect is this tree.
 * Returns a failure result if illegal, otherwise null.
 */
export function validatePaidEffect(
  ctx: EffectCtx,
  effect: Effect,
): Extract<EvalResult, { ok: false }> | null {
  const { state, sourceId } = ctx;
  const source = state.cards[sourceId];

  const walk = (e: Effect): Extract<EvalResult, { ok: false }> | null => {
    switch (e.op) {
      case "seq": {
        for (const child of e.effects) {
          const r = walk(child);
          if (r) return r;
        }
        return null;
      }
      case "if":
        return walk(e.then) ?? (e.else ? walk(e.else) : null);
      case "prevent":
        return null;
      case "choose":
        return null;
      case "do": {
        const a = e.action;
        if (a.kind === "pump_strength") {
          if (!state.run) {
            return {
              ok: false,
              error: "Pump requires an active run/encounter.",
              cites: [CR.icebreakerStrengthImplicit],
            };
          }
          if (!source.breaker) {
            return {
              ok: false,
              error: "Pump requires an icebreaker.",
              cites: [CR.programStrength],
            };
          }
        }
        if (a.kind === "fortify_ice") {
          if (!state.run || source.type !== "ice") {
            return {
              ok: false,
              error: "Fortify requires approached ice during a run.",
              cites: [CR.iceStrength],
            };
          }
        }
        if (a.kind === "weaken_ice") {
          if (!state.run?.encounter) {
            return {
              ok: false,
              error: "Weaken ice requires an encounter.",
              cites: [CR.iceStrength],
            };
          }
        }
        return null;
      }
      default: {
        const _e: never = e;
        return _e;
      }
    }
  };
  return walk(effect);
}

// trashCorpCardToArchives used by trash_hq / shuffle paths.
