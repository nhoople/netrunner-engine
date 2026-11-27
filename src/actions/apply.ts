import {
  endLooksAndReveals,
  lookAtChoiceCards,
} from "../state/visibility/reveal.js";
import { runApplyHook } from "../debug/applyHook.js";
import {
  costCardNeedForAction,
  costHasChoice,
  openCostChoice,
  openInstallTrashChoice,
  takeCostPick,
  validateCostCards,
} from "./costCards.js";
import {
  activePlayer,
  cloneState,
  log,
} from "../state/setupAndEnd/createGame.js";
import { runnerWinsOnEmptyRnd } from "../state/setupAndEnd/emptyRnd.js";
import { startingHandSizeFor } from "../state/setupAndEnd/startingHand.js";
import { currentWindow, effectiveIceStrength } from "../cards/stubs.js";
import {
  enhancedLoginProtocolClick,
  sumRunnerFirstRunAdditionalCost,
} from "../state/continuous/currents.js";
import {
  firstClickMustBlocks,
  firstClickMustIsActive,
} from "../state/turnAndActions/firstClickMust.js";
import { basicDrawBonus } from "../state/cardFlags/staticFlags.js";
import { onTagsRemoved } from "../state/cardFlags/cardDeclarations.js";
import { withCostCheckpoint } from "../legality/checkpoints.js";
import { nestPriorityAfterAbility } from "../legality/priority.js";
import { playRestrictionOk } from "../legality/candidateClicks.js";
import {
  legalActions as queryLegalActions,
  windowRefusal,
} from "../legality/query.js";
import {
  evalEffect,
  resumeContinuationsOfPausedWindows,
  resumePendingEffectContinuation,
} from "../effects/eval.js";
import { resumeExposeUpTo } from "../effects/visibility/exposeAndReveal.js";
import { effectResolutionBlocked } from "../effects/continuation.js";
import {
  abilityCost,
  canPayCost,
  costBeginsWithClick,
  payCost,
  basicTrashResourceCreditCost,
  basicRemoveTagCreditCost,
  wirelessNetPavilionExtra,
  runnerCreditsFor,
  spendRunnerCreditsFor,
  subtractRunnerCreditPool,
} from "../state/keywordsAndCredits/costs.js";
import {
  acceptPendingDamage,
  preventPendingDamage,
  preventPendingDamageLoseAllClicks,
} from "../state/damageAndPrevention/damage.js";
import {
  acceptPendingTags,
  conditionalInterruptRequiresActiveAtOpen,
} from "../state/keywordsAndCredits/tags.js";
import { acceptPendingExpose } from "../state/visibility/expose.js";
import {
  acceptPendingInstalledTrash,
  triggerPendingTrashInterrupt,
} from "../state/hostingAndTrash/trashPrevent.js";
import { acceptPendingEndTheRun } from "../state/run/endTheRun.js";
import { purgeVirusCounters } from "../state/hostingAndTrash/trashHooks.js";
import {
  offerSabotagePick,
  resolveSabotageAmount,
  sabotageHqBounds,
} from "../state/keywordsAndCredits/keywords.js";
import { fireRunnerValTrigger } from "../effects/triggers/firstTimeEachTurnTriggers.js";
import {
  abandonExtraDifferentAction,
  noteCorpActionType,
  takeExtraDifferentAction,
} from "../state/turnAndActions/corpActionHooks.js";
import { fireMeatDamageWhenRunnerTakesTags } from "../state/hostingAndTrash/trashHooks.js";
import {
  boostTrace,
  resolveTrace,
  spendLink,
} from "../state/turnAndActions/trace.js";
import { psiCorpBid, psiRunnerBid } from "../state/turnAndActions/psi.js";
import { agendaPointsFor } from "../state/turnAndActions/scoring.js";
import { abilitiesSuppressed } from "../state/continuous/abilities.js";
import { resolvePendingOnEncounter } from "../state/run/onEncounter.js";
import { runnerAbilityCarrierIds } from "../state/setupAndEnd/additionalIdentities.js";
import { beginBreachAccess } from "../state/access/access.js";
import { isRunTargetAllowed } from "../state/run/runLegality.js";
import type {
  Action,
  ApplyResult,
  GameState,
  RuleCite,
  Server,
  Side,
} from "../state/types.js";
import { CR } from "../timing/labels.js";
import { resumePendingStoredConditionals } from "../state/triggers/storedTriggers.js";
import { installCorp, likeCardsAtDestination } from "./installCorp.js";
import { installRunner } from "./installRunner.js";
import {
  advanceRunUntilStop,
  finishRunReturnToAction,
  jackOut,
  startRun,
} from "./run.js";
import {
  breakBioroidSubroutine,
  breakBioroidSubroutines,
  breakSubroutine,
  finalizePendingSubroutineBreak,
  resolveTyrsHandRezDuringBreakInterrupt,
} from "./breakSubroutine.js";
import { spendActionClicks, spendClick } from "./spendClick.js";
import { advanceCard, scoreAgendaAction } from "./score.js";
import { applyPatchworkDiscount, playEvent, playOperation } from "./play.js";
import { rezAsset, rezIce } from "./rez.js";
import {
  findPaidAbility,
  resolveGeistAfterTrashCost,
  usePaidAbility,
} from "./paidAbility.js";
import { advanceFromMidAccess } from "./access.js";
import { discardPhase, drawN, passWindow } from "./phase.js";
import {
  actionAllowedHere,
  afterBasicAction,
  autoWalk,
  enterStep,
  getStep,
  resolveAndAdvance,
} from "../timing/machine.js";
import { fireOnCorpBasicClickForCreditOrDraw } from "../state/triggers/miscConditionalHooks.js";
import { openPendingChoose } from "../state/triggers/pendingChoice.js";
import { shuffleInPlace } from "../state/rng.js";
import { trashCard } from "../state/hostingAndTrash/trash.js";
import { chooseOption } from "./chooseOption.js";
import { applyAccessAction } from "./accessActions.js";

/** The payer's pick for a one-card cost, or the last card when not asked. */
function chosenCostCard(state: GameState, pool: readonly string[]): string {
  const named = (state.costCardIds ?? []).find((id) => pool.includes(id));
  return named ?? pool[pool.length - 1]!;
}

export function fail(error: string, cites: RuleCite[]): ApplyResult {
  return { ok: false, error, cites };
}

/**
 * Security Nexus traces when the encounter begins (CR 6.5.2, 6.9.3a). Once
 * that trace is complete (CR 10.8.6f), the encounter's other pending
 * abilities resolve unless the trace ended the run (CR 6.8.2b) or bypassed
 * the ice (CR 6.5.8a), and the run continues.
 */
function resumeAfterEncounterStartTrace(
  state: GameState,
  traceSourceId: string,
): ApplyResult {
  const fromNexus = state.cards[traceSourceId]?.paidAbilities?.some(
    (ability) => ability.id === "security-nexus-trace",
  );
  if (!fromNexus || !state.run || state.timingKey !== "run.encounter") {
    return ok(state);
  }
  if (
    state.pendingChoice ||
    state.pendingTrashProgram ||
    state.pendingSabotage ||
    state.pendingDamage ||
    state.trace ||
    state.psi
  ) {
    return ok(state);
  }
  if (state.run.encounter?.onEncounterPending) resolvePendingOnEncounter(state);
  if (
    state.pendingChoice ||
    state.pendingTrashProgram ||
    state.pendingSabotage ||
    state.pendingDamage ||
    state.trace ||
    state.psi
  ) {
    return ok(state);
  }
  autoWalk(state);
  const cont = advanceRunUntilStop(state);
  if (!cont.ok) return cont;
  finishRunReturnToAction(cont.state);
  return cont;
}

export function ok(state: GameState): ApplyResult {
  return { ok: true, state };
}

function openingMulliganSide(state: GameState): Side | null {
  if (state.timingKey === "opening.corpMulligan") return "corp";
  if (state.timingKey === "opening.runnerMulligan") return "runner";
  return null;
}

/** CR 1.6.6a — keep the already-dealt starting hand and advance. */
function keepStartingHand(state: GameState): ApplyResult {
  const side = openingMulliganSide(state);
  if (!side) {
    return fail("keep_starting_hand is only legal during opening mulligan.", [
      CR.mulligan,
    ]);
  }
  const who = side === "corp" ? "Corp" : "Runner";
  log(state, `${who} keeps their starting hand`);
  resolveAndAdvance(state);
  return ok(state);
}

/**
 * CR 1.6.6a — shuffle starting hand into deck, draw a new starting hand,
 * then advance. Second hand cannot be mulliganed.
 */
function takeMulligan(state: GameState): ApplyResult {
  const side = openingMulliganSide(state);
  if (!side) {
    return fail("mulligan is only legal during opening mulligan.", [
      CR.mulligan,
    ]);
  }
  const p = side === "corp" ? state.corp : state.runner;
  const deckZone = side === "corp" ? "corp:rd" : "runner:stack";
  const handZone = side === "corp" ? "corp:hq" : "runner:grip";

  for (const id of p.hand) {
    const card = state.cards[id];
    card.zone = deckZone;
    if (side === "corp") card.faceup = false;
  }
  p.deck.push(...p.hand);
  p.hand = [];
  shuffleInPlace(state, p.deck);

  const n = startingHandSizeFor(state.cards[p.identityId]);
  let drawn = 0;
  for (let i = 0; i < n; i++) {
    const top = p.deck.shift();
    if (!top) break;
    drawn += 1;
    p.hand.push(top);
    const card = state.cards[top];
    card.zone = handZone;
    card.faceup = side === "runner";
  }
  if (side === "corp" && drawn < n) {
    runnerWinsOnEmptyRnd(state);
    return ok(state);
  }

  const who = side === "corp" ? "Corp" : "Runner";
  log(state, `${who} takes a mulligan`);
  resolveAndAdvance(state);
  return ok(state);
}

function listServers(state: GameState): Server[] {
  return Object.values(state.servers);
}

function emptyRemoteExists(state: GameState): Server | undefined {
  return listServers(state).find(
    (s) => s.kind === "remote" && s.root.length === 0,
  );
}

function chooseTrashProgram(state: GameState, cardId: string): ApplyResult {
  const pending = state.pendingTrashProgram;
  if (!pending) {
    return fail("No pending trash-program choice.", [CR.trashing]);
  }
  if (!pending.candidates.includes(cardId)) {
    return fail("That card is not a legal trash target.", [CR.trashing]);
  }
  const card = state.cards[cardId];
  // A subroutine's "trash a program": the Corp carries it out, unless it
  // names the Runner ("the Runner trashes 1 program"), CR 1.14.5.
  trashCard(state, cardId, {
    by: pending.chooser ?? "corp",
    ...(pending.preventable === false ? { preventable: false } : {}),
  });
  state.pendingTrashProgram = null;
  log(state, `Trashes ${card.title} (CR ${CR.trashing.number}).`);
  // The ability resumes after this pause: the rest of its instruction
  // (Sagittarius's second trash, Colossus's resource) resolves next
  // (CR 9.11.3).
  resumePendingEffectContinuation(state);
  if (effectResolutionBlocked(state)) return ok(state);
  // Resume the run graph from the current auto step (resolveSub).
  const step = getStep(state);
  if (step.kind === "auto" || step.kind === "branch") {
    const nextKey =
      typeof step.next === "function" ? step.next(state) : step.next;
    enterStep(state, nextKey);
  }
  const cont = advanceRunUntilStop(state);
  if (!cont.ok) return cont;
  finishRunReturnToAction(cont.state);
  return cont;
}

function resolveSabotageIntent(
  state: GameState,
  hqCardIds: string[],
): ApplyResult {
  const pending = state.pendingSabotage;
  if (!pending) {
    return fail("No pending sabotage.", [CR.sabotage]);
  }
  const r = resolveSabotageAmount(
    state,
    pending.sourceId,
    pending.amount,
    hqCardIds,
  );
  if (!r.ok) return fail(r.error, r.cites);
  state.pendingSabotage = null;
  if (state.pendingChoice || state.pendingTrashProgram || state.pendingDamage) {
    return ok(state);
  }
  if (state.run) {
    const step = getStep(state);
    if (step.kind === "auto" || step.kind === "branch") {
      const nextKey =
        typeof step.next === "function" ? step.next(state) : step.next;
      enterStep(state, nextKey);
    }
    const cont = advanceRunUntilStop(state);
    if (!cont.ok) return cont;
    finishRunReturnToAction(cont.state);
    return cont;
  }
  return ok(state);
}

function useIdentityAbility(state: GameState, abilityId: string): ApplyResult {
  const idCard =
    state.cards[
      state.activeSide === "corp"
        ? state.corp.identityId
        : state.runner.identityId
    ];
  if (!idCard) return fail("No identity.", [CR.identityAbility]);
  const ability = findPaidAbility(idCard, abilityId);
  if (!ability) {
    return fail("Unknown identity ability.", [CR.identityAbility]);
  }
  const window = currentWindow(state.timingKey);
  // CR 5.2.1: a cost that begins with a click is an action. Anything else
  // on an identity is a paid ability (CR 9.2.7b).
  const atTake =
    state.timingKey === "corp.takeAction" ||
    state.timingKey === "runner.takeAction";
  const clickAction = costBeginsWithClick(ability);
  if (clickAction && !atTake) {
    return fail(
      "A paid ability whose cost begins with a click is an action (CR 5.2.1).",
      [CR.actionPhase, CR.basicActions],
    );
  }
  if (!clickAction && atTake) {
    return fail("This identity ability is used in a paid ability window.", [
      CR.identityAbility,
    ]);
  }
  if (!atTake && (!window || !ability.windows.includes(window))) {
    return fail("Identity ability not usable now.", [CR.identityAbility]);
  }
  // In a paid ability window it is a paid ability like any other (CR 9.2.7b),
  // with once-per-turn limits and stipulations (AgInfusion: the approached
  // ice is unrezzed), so it resolves through the same path the list offers.
  if (!atTake) return usePaidAbility(state, idCard.id, abilityId);
  const cost = abilityCost(ability, state, idCard);
  if (!canPayCost(state, idCard.side, cost, idCard)) {
    return fail("Cannot pay identity ability cost.", [CR.identityAbility]);
  }
  payCost(state, idCard.side, cost, `identity:${abilityId}`, idCard);
  resolveGeistAfterTrashCost(state, idCard, cost);
  const applied = evalEffect(
    { state, sourceId: idCard.id, payerSide: idCard.side },
    ability.effect,
  );
  if (!applied.ok) return fail(applied.error, applied.cites);
  log(
    state,
    `${idCard.side} uses identity ability ${ability.label} (CR ${CR.identityAbility.number}).`,
  );
  if (atTake && (cost.clicks ?? 0) > 0) {
    afterBasicAction(state);
  } else if (window) {
    nestPriorityAfterAbility(state, `identity:${abilityId}`);
  }
  return ok(state);
}

/** Pure action apply: returns a new state or a cited legality error. */
/**
 * Apply one action, then settle what the players may see.
 *
 * A choice opened while a look or search choice resolves is part of the
 * same look (CR 1.21.2). When nothing is left to choose, the ability has
 * finished: nobody is looking any more, and no card in a deck stays faceup
 * (CR 1.21.6, CR 1.21.1a).
 */
export function applyAction(state: GameState, action: Action): ApplyResult {
  const result = applyActionCore(state, action);
  if (!result.ok) return result;
  // The window gate the legal-action list uses, so apply never takes a move
  // in a window the list refuses it in (CR 5.2.2, 5.2.4, 9.2.6, 9.2.7b;
  // appendix 11). Priority stays with the list: an action names no actor.
  // Checked after the action's own checks, so a refusal names what is wrong
  // with the card (a rezzed card, an agenda short of counters) before the
  // window (CR 8.1.2, 1.17.3a).
  const refusal = windowRefusal(state, action, { priority: false });
  if (refusal) return fail(refusal.reason, refusal.cites);
  const before = state.pendingChoice;
  const after = result.state.pendingChoice;
  if (
    action.type === "choose_option" &&
    before?.look &&
    after &&
    !after.look &&
    after.chooser === before.chooser
  ) {
    after.look = true;
    lookAtChoiceCards(result.state);
  }
  if (!after && !result.state.pendingCost) endLooksAndReveals(result.state);
  // An action can leave the timing walk parked on an auto step: a choice
  // opened by "when your turn begins" (11.2_1_d, 11.3_1_d) holds its step
  // until answered. The steps of a timing structure progress in sequence
  // (CR 9.2.2), so walk on to the next step where a player acts.
  if (!result.state.done) autoWalk(result.state);
  runApplyHook(result.state, action);
  return result;
}

/** The action itself. Calls made while an action resolves come here. */
export function applyActionCore(state: GameState, action: Action): ApplyResult {
  // A cost is waiting for its payer's cards: only those picks are taken
  // (CR 1.16.1). Once they are in, the held action resolves with them.
  if (state.pendingCost) {
    if (action.type !== "choose_option") {
      return fail(
        state.pendingCost.into === "trashFirstIds"
          ? "Choose the cards to trash before installing first."
          : "Choose the cards for the cost first.",
        [
          state.pendingCost.into === "trashFirstIds"
            ? CR.installTrashLikeCards
            : CR.cost,
        ],
      );
    }
    const picking = cloneState(state);
    const taken = takeCostPick(picking, action.optionId);
    if (!taken.ok) return fail(taken.error, taken.cites);
    if (!taken.action) return ok(picking);
    const paid = applyActionCore(picking, taken.action);
    if (paid.ok) return paid;
    log(
      picking,
      taken.action.type === "basic_install"
        ? `The install could not be completed: ${paid.error}`
        : `The cost could not be paid: ${paid.error}`,
    );
    return ok(picking);
  }

  // CR 8.5.6a, 8.5.6b: the Corp says which cards already in the destination
  // are trashed before the install.
  if (
    action.type === "basic_install" &&
    state.activeSide === "corp" &&
    action.trashFirst &&
    !action.trashFirstIds &&
    (action.destination.kind === "protect" ||
      action.destination.kind === "remote_root")
  ) {
    const like = likeCardsAtDestination(
      state,
      action.cardId,
      action.destination.serverId,
    );
    const optional = like.may.filter((id) => !like.must.includes(id));
    if (optional.length > 0) {
      // Trashing everything is the cheapest install: if that cannot be
      // done, no choice of cards can be.
      const trial = applyWithCostCards(
        state,
        { ...action, trashFirstIds: optional },
        undefined,
      );
      if (!trial.ok) return trial;
      const asking = cloneState(state);
      openInstallTrashChoice(asking, action, optional);
      return ok(asking);
    }
  }

  const need = costCardNeedForAction(state, action);
  const named = (action as { costCardIds?: string[] }).costCardIds;
  if (named) {
    const valid = validateCostCards(need, named);
    if (!valid.ok) return fail(valid.error, valid.cites);
  } else if (need && costHasChoice(state, need)) {
    // Check the action can be taken at all before asking for the cards.
    const trial = applyWithCostCards(state, action, undefined);
    if (!trial.ok) return trial;
    const asking = cloneState(state);
    openCostChoice(asking, need, action);
    return ok(asking);
  }
  return applyWithCostCards(state, action, named);
}

function applyWithCostCards(
  state: GameState,
  action: Action,
  costCardIds: string[] | undefined,
): ApplyResult {
  const next = cloneState(state);
  next.costCardIds = costCardIds ? [...costCardIds] : undefined;
  const result = applyResolved(next, action);
  if (result.ok) result.state.costCardIds = undefined;
  return result;
}

function applyResolved(next: GameState, action: Action): ApplyResult {
  if (next.done && action.type !== "pass_window") {
    return fail("Game marked done.", []);
  }
  if (firstClickMustBlocks(next, action)) {
    return fail(
      "The first click must be spent to make a run or play a run event.",
      [CR.mustNotForceAdditionalCost],
    );
  }

  // Trace / damage interrupts take precedence
  if (next.trace) {
    switch (action.type) {
      case "boost_trace": {
        const err = boostTrace(next, action.credits);
        if (err) return fail(err, [CR.trace]);
        return ok(next);
      }
      case "spend_link": {
        const err = spendLink(next, action.amount);
        if (err) return fail(err, [CR.trace]);
        return ok(next);
      }
      case "resolve_trace": {
        const traceSourceId = next.trace.sourceId;
        const r = resolveTrace(next);
        if (!r.ok) return fail(r.error, [CR.trace]);
        return resumeAfterEncounterStartTrace(next, traceSourceId);
      }
      case "use_paid_ability": {
        return usePaidAbility(
          next,
          action.cardId,
          action.abilityId,
          action.serverId,
        );
      }
      default:
        return fail("Trace in progress — boost, spend link, or resolve.", [
          CR.trace,
        ]);
    }
  }

  if (next.psi) {
    switch (action.type) {
      case "psi_runner_bid": {
        const err = psiRunnerBid(next, action.amount);
        if (err) return fail(err, [CR.trace]);
        return ok(next);
      }
      case "psi_corp_bid": {
        const err = psiCorpBid(next, action.amount);
        if (err) return fail(err, [CR.trace]);
        // Resume R&D breach after onBreachRd psi (Akiko Nisei).
        if (next.run?.onBreachRdPending) {
          next.run.onBreachRdPending = false;
          beginBreachAccess(next);
          if (next.pendingChoice || next.psi) return ok(next);
          autoWalk(next);
          const cont = advanceRunUntilStop(next);
          if (!cont.ok) return cont;
          finishRunReturnToAction(cont.state);
          return cont;
        }
        // Resume auto-walk if psi paused an auto/branch step (Letheia).
        if (
          next.pendingChoice ||
          next.pendingTrashProgram ||
          next.pendingSabotage ||
          next.pendingDamage ||
          next.trace ||
          next.psi
        ) {
          return ok(next);
        }
        autoWalk(next);
        if (next.run) {
          const cont = advanceRunUntilStop(next);
          if (!cont.ok) return cont;
          finishRunReturnToAction(cont.state);
          return cont;
        }
        return ok(next);
      }
      default:
        return fail("Psi game in progress — Runner then Corp must bid.", [
          CR.trace,
        ]);
    }
  }

  if (next.pendingExpose && next.pendingExpose.phase === "interrupt") {
    if (action.type === "use_paid_ability") {
      const paid = usePaidAbility(
        next,
        action.cardId,
        action.abilityId,
        action.serverId,
      );
      if (!paid.ok) return paid;
      if (next.pendingExpose) return ok(next);
      resumePendingEffectContinuation(next);
      return ok(next);
    }
    if (action.type === "accept_expose") {
      acceptPendingExpose(next);
      resumeExposeUpTo(next);
      resumePendingEffectContinuation(next);
      return ok(next);
    }
    return fail("Pending expose — prevent or accept.", [CR.expose]);
  }

  if (next.pendingTrashPrevent) {
    // Dummy Box-class: paid interrupt may open a grip-trash choice; allow it
    // while the installed-trash interrupt is still open (CR 1.2.1).
    if (action.type === "choose_option" && next.pendingChoice) {
      const chosen = chooseOption(next, action.optionId);
      if (!chosen.ok) return chosen;
      if (!next.pendingTrashPrevent) resumePendingEffectContinuation(next);
      return chosen;
    }
    if (action.type === "use_paid_ability") {
      const paid = usePaidAbility(
        next,
        action.cardId,
        action.abilityId,
        action.serverId,
      );
      if (!paid.ok) return paid;
      if (next.pendingTrashPrevent) return ok(next);
      resumePendingEffectContinuation(next);
      return ok(next);
    }
    if (action.type === "trigger_pending_trash_interrupt") {
      const triggered = triggerPendingTrashInterrupt(next, action.cardId);
      if (!triggered.ok) return fail(triggered.error, triggered.cites);
      resumePendingEffectContinuation(next);
      return ok(next);
    }
    if (action.type === "accept_installed_trash") {
      acceptPendingInstalledTrash(next, (s, id, by) =>
        trashCard(s, id, { by }),
      );
      resumePendingEffectContinuation(next);
      return ok(next);
    }
    return fail("Pending installed trash — prevent or accept.", [CR.trashing]);
  }

  if (next.pendingTags) {
    if (action.type === "choose_option" && next.pendingChoice) {
      return chooseOption(next, action.optionId);
    }
    if (action.type === "use_paid_ability") {
      const bornDuringWindow = Boolean(
        next.pendingTags.activeAtOpen &&
        !next.pendingTags.activeAtOpen.includes(action.cardId),
      );
      if (
        bornDuringWindow &&
        conditionalInterruptRequiresActiveAtOpen(action.abilityId)
      ) {
        const title = next.cards[action.cardId]?.title ?? action.cardId;
        return fail(
          `${title} was not active when the interrupt window opened, so its ability is not pending.`,
          [CR.conditionalInterruptStillRelevant],
        );
      }
      const paid = usePaidAbility(
        next,
        action.cardId,
        action.abilityId,
        action.serverId,
      );
      if (!paid.ok) return paid;
      if (bornDuringWindow) {
        log(
          next,
          `${next.cards[action.cardId]?.title ?? action.cardId} was not active when the interrupt window opened and can still be used (CR ${CR.paidInterruptNeedNotBeActiveAtOpen.number}).`,
        );
      }
      if (next.pendingTags) return ok(next);
      resumeAfterDamage(next);
      return continueAfterInterruptWindow(next);
    }
    if (action.type === "accept_tags") {
      const taken = acceptPendingTags(next);
      if (taken > 0) fireMeatDamageWhenRunnerTakesTags(next);
      resumeAfterDamage(next);
      return continueAfterInterruptWindow(next);
    }
    return fail("Pending tags — avoid or accept.", [CR.tags]);
  }

  if (next.pendingEndTheRun) {
    if (action.type === "use_paid_ability") {
      const paid = usePaidAbility(
        next,
        action.cardId,
        action.abilityId,
        action.serverId,
      );
      if (!paid.ok) return paid;
      if (next.pendingEndTheRun) return ok(next);
      resumePendingEffectContinuation(next);
      return ok(next);
    }
    if (action.type === "accept_end_the_run") {
      acceptPendingEndTheRun(next);
      resumePendingEffectContinuation(next);
      return ok(next);
    }
    return fail("Pending end the run — prevent or accept.", [CR.endTheRun]);
  }

  if (next.pendingSubroutineBreak) {
    if (action.type === "rez_asset") {
      return resolveTyrsHandRezDuringBreakInterrupt(next, action.cardId);
    }
    if (action.type === "use_paid_ability") {
      const paid = usePaidAbility(
        next,
        action.cardId,
        action.abilityId,
        action.serverId,
      );
      if (!paid.ok) return paid;
      if (next.pendingSubroutineBreak?.prevented) {
        return finalizePendingSubroutineBreak(next, true);
      }
      return ok(next);
    }
    if (action.type === "pass_window") {
      return finalizePendingSubroutineBreak(next, false);
    }
    return fail(
      "Pending subroutine-break interrupt — rez, use a paid ability, or pass.",
      [CR.encounterBreakPaw],
    );
  }

  if (next.pendingDamage) {
    if (action.type === "use_paid_ability") {
      const paid = usePaidAbility(
        next,
        action.cardId,
        action.abilityId,
        action.serverId,
      );
      if (!paid.ok) return paid;
      if (next.pendingDamage) return ok(next);
      resumeAfterDamage(next);
      if (
        next.run?.accessingCardId &&
        (next.timingKey === "access.cardAccessed" ||
          next.timingKey === "access.midAccess")
      ) {
        autoWalk(next);
        return advanceFromMidAccess(next);
      }
      return continueAfterInterruptWindow(next);
    }
    switch (action.type) {
      case "prevent_damage":
        // Damage only interrupt abilities may prevent offers no plain
        // prevention (CR 9.9.4d), as the list says.
        if (
          next.pendingDamage.interruptPawOnly ||
          next.pendingDamage.preventByLoseAllClicks
        ) {
          return fail("Only an interrupt ability can prevent this damage.", [
            CR.preventDamage,
          ]);
        }
        if (action.amount < 1 || action.amount > next.pendingDamage.remaining) {
          return fail("Cannot prevent that much damage.", [CR.preventDamage]);
        }
        preventPendingDamage(next, action.amount);
        break;
      case "prevent_damage_lose_all_clicks":
        if (!next.pendingDamage.preventByLoseAllClicks) {
          return fail("Cannot prevent this damage by losing clicks.", [
            CR.preventDamage,
          ]);
        }
        if (next.runner.clicks <= 0) {
          return fail("No clicks remaining to prevent damage.", [
            CR.preventDamage,
          ]);
        }
        preventPendingDamageLoseAllClicks(next);
        break;
      case "accept_damage":
        acceptPendingDamage(next);
        break;
      default:
        return fail("Pending damage — prevent or accept.", [CR.preventDamage]);
    }
    if (next.pendingDamage) return ok(next);
    resumeAfterDamage(next);
    // Resume nested access-a-card walk after onAccess damage interrupt.
    if (
      next.run?.accessingCardId &&
      (next.timingKey === "access.cardAccessed" ||
        next.timingKey === "access.midAccess")
    ) {
      autoWalk(next);
      return advanceFromMidAccess(next);
    }
    return continueAfterInterruptWindow(next);
  }

  if (next.pendingTrashProgram) {
    if (action.type === "choose_trash_program") {
      return chooseTrashProgram(next, action.cardId);
    }
    return fail("Pending trash-program choice — Corp must choose a target.", [
      CR.trashing,
    ]);
  }

  if (next.pendingSabotage) {
    if (action.type === "resolve_sabotage") {
      next.pendingChoice = null;
      return resolveSabotageIntent(next, action.hqCardIds);
    }
    // One HQ pick at a time (CR 10.12.2); the last possible pick resolves.
    if (
      action.type === "choose_option" &&
      action.optionId.startsWith("sabotage-hq:")
    ) {
      const id = action.optionId.slice("sabotage-hq:".length);
      const picked = next.pendingSabotage.picked ?? [];
      if (!next.corp.hand.includes(id) || picked.includes(id)) {
        return fail("Sabotage: choose a card in HQ.", [CR.sabotageResolution]);
      }
      next.pendingSabotage.picked = [...picked, id];
      if (next.pendingSabotage.picked.length >= sabotageHqBounds(next).max) {
        next.pendingChoice = null;
        return resolveSabotageIntent(next, next.pendingSabotage.picked);
      }
      offerSabotagePick(next);
      return ok(next);
    }
    return fail(
      "Pending sabotage — Corp must resolve_sabotage with HQ card ids.",
      [CR.sabotage, CR.sabotageResolution],
    );
  }

  if (next.pendingChoice) {
    if (action.type === "choose_option") {
      const chosen = chooseOption(next, action.optionId);
      if (chosen.ok) openExtraDifferentActionWindow(chosen.state);
      // The active player finished choosing what to discard: the discard
      // step now discards those cards together (CR 5.5.4c).
      if (chosen.ok && next.turn.chosenDiscardIds && !next.pendingChoice) {
        return discardPhase(next, undefined, true);
      }
      return chosen;
    }
    return fail(
      `Pending choice for ${next.pendingChoice.chooser} — resolve with choose_option.`,
      [CR.paidAbility],
    );
  }

  // MirrorMorph's extra action must differ from the first three (CR 5.2.5b).
  const extraRefusal = takeExtraDifferentAction(next, action);
  if (extraRefusal) return fail(extraRefusal.error, extraRefusal.cites);

  switch (action.type) {
    case "pass_window":
      return passWindow(next);

    case "keep_starting_hand":
      return keepStartingHand(next);

    case "mulligan":
      return takeMulligan(next);

    case "continue_run":
      if (next.timingKey !== "run.jackOutWindow") {
        return fail("continue_run is only for the jack-out window.", [
          CR.jackOutMovement,
        ]);
      }
      return passWindow(next);

    case "basic_gain_credit": {
      const gate = actionAllowedHere(next, action.type);
      if (!gate.ok) {
        return fail(
          "Basic actions are only legal at the take-action step.",
          gate.cites,
        );
      }
      const bad = spendActionClicks(next, "basic_gain_credit");
      if (bad) return bad;
      const cite =
        next.activeSide === "corp" ? CR.corpBasicCredit : CR.runnerBasicCredit;
      activePlayer(next).credits += 1;
      log(
        next,
        `${next.activeSide} gains 1 credit (CR ${cite.number}, ${CR.gainCredits.number}).`,
      );
      // CPC Generator: first Runner basic gain-credit each turn → Corp gains 1¢.
      if (
        next.activeSide === "runner" &&
        !next.turn.cpcGeneratorFiredThisTurn
      ) {
        for (const server of Object.values(next.servers)) {
          for (const id of server.root) {
            if (abilitiesSuppressed(next, id)) continue;
            const c = next.cards[id];
            const gainAmt = c?.rezzed
              ? c.corpGainsOnFirstRunnerBasicGainCreditEachTurn
              : undefined;
            if (typeof gainAmt === "number" && gainAmt > 0) {
              next.corp.credits += gainAmt;
              next.turn.cpcGeneratorFiredThisTurn = true;
              log(
                next,
                `${c!.title} — Corp gains ${gainAmt}¢ (Runner basic gain credit).`,
              );
              break;
            }
          }
          if (next.turn.cpcGeneratorFiredThisTurn) break;
        }
      }
      noteCorpActionType(next, "basic_gain");
      for (const rid of [...next.runner.installed]) {
        const rigCard = next.cards[rid];
        if (!rigCard?.onCorpBasicClickForCreditOrDraw) continue;
        fireOnCorpBasicClickForCreditOrDraw(next, rid);
        if (next.pendingChoice) break;
      }
      afterBasicAction(next);
      return ok(next);
    }

    case "basic_purge_virus": {
      const gate = actionAllowedHere(next, action.type);
      if (!gate.ok) {
        return fail(
          "Purge is only legal at the Corp take-action step.",
          gate.cites,
        );
      }
      if (next.activeSide !== "corp") {
        return fail("Only the Corp purges virus counters.", [
          CR.corpBasicPurge,
          CR.purge,
        ]);
      }
      if (next.corp.clicks < 3) {
        return fail("Purge costs 3 clicks.", [
          CR.corpBasicPurge,
          CR.spendClicks,
        ]);
      }
      const bad = spendActionClicks(next, "basic_purge", 3);
      if (bad) return bad;
      purgeVirusCounters(next, next.corp.identityId);
      log(
        next,
        `Corp purges virus counters (CR ${CR.corpBasicPurge.number}, ${CR.purge.number}).`,
      );
      noteCorpActionType(next, "basic_purge");
      afterBasicAction(next);
      return ok(next);
    }

    case "basic_remove_tag": {
      // Whose action it is comes before when (CR 5.2.7g, 5.2.4).
      if (next.activeSide !== "runner") {
        return fail("Only the Runner may remove a tag with the basic action.", [
          CR.runnerBasicRemoveTag,
          CR.taggedRemoveTag,
          CR.actionsOutsidePhase,
        ]);
      }
      const gate = actionAllowedHere(next, action.type);
      if (!gate.ok) {
        return fail(
          "Basic actions are only legal at the take-action step.",
          gate.cites,
        );
      }
      if (next.runner.tags <= 0) {
        return fail("Runner has no tags to remove.", [
          CR.runnerBasicRemoveTag,
          CR.taggedRemoveTag,
          CR.tagged,
        ]);
      }
      const tagCost = basicRemoveTagCreditCost(next);
      if (runnerCreditsFor(next, "basic_remove_tag") < tagCost) {
        return fail(`Need ${tagCost}¢ to remove a tag.`, [
          CR.runnerBasicRemoveTag,
          CR.taggedRemoveTag,
          CR.costCheckpoint,
        ]);
      }
      const bad = spendClick(next);
      if (bad) return bad;
      withCostCheckpoint(next, "basic_remove_tag", () => {
        spendRunnerCreditsFor(next, tagCost, "basic_remove_tag");
        next.runner.tags -= 1;
        onTagsRemoved(next);
      });
      log(
        next,
        `Runner removes 1 tag for {click}+2¢ → ${next.runner.tags} tag(s) (CR ${CR.runnerBasicRemoveTag.number}, ${CR.taggedRemoveTag.number}).`,
      );
      afterBasicAction(next);
      return ok(next);
    }

    case "basic_draw": {
      const gate = actionAllowedHere(next, action.type);
      if (!gate.ok) {
        return fail(
          "Basic actions are only legal at the take-action step.",
          gate.cites,
        );
      }
      const bad = spendActionClicks(next, "basic_draw");
      if (bad) return bad;
      if (next.activeSide === "runner" && next.turn.ccRunnerCannotDraw) {
        return fail("Runner cannot draw (Lockdown).", [CR.drawing]);
      }
      const cite =
        next.activeSide === "corp" ? CR.corpBasicDraw : CR.runnerBasicDraw;
      let drawAmount =
        1 + (next.activeSide === "runner" ? basicDrawBonus(next) : 0);
      if (next.activeSide === "runner" && next.turn.basicDrawsThisTurn === 0) {
        let extra = 0;
        let sourceTitle: string | undefined;
        for (const id of next.runner.installed) {
          if (abilitiesSuppressed(next, id)) continue;
          const card = next.cards[id];
          const n = card?.additionalCardsOnFirstBasicDrawEachTurn ?? 0;
          if (n <= 0) continue;
          extra += n;
          sourceTitle ??= card?.title;
        }
        if (extra > 0) {
          drawAmount += extra;
          log(next, `${sourceTitle} — first basic draw is ${drawAmount}.`);
        }
      }
      const drewTotal = drawN(next, next.activeSide, drawAmount);
      if (next.winReason === "empty_rd") return ok(next);
      if (drewTotal === 0) {
        return fail("Deck is empty.", [cite, CR.drawing]);
      }
      next.turn.basicDrawsThisTurn += 1;
      log(
        next,
        `${next.activeSide} draws ${drewTotal} (CR ${cite.number}, ${CR.drawing.number}).`,
      );
      if (next.pendingChoice) {
        next.deferAfterBasicAction = true;
        return ok(next);
      }
      if (next.activeSide === "runner") {
        fireRunnerValTrigger(
          next,
          "valBasicClickDrawTriggerCount",
          "onFirstBasicClickDrawEachTurn",
          "onFirstBasicClickDrawEachTurn",
        );
      }
      if (next.activeSide === "corp") {
        noteCorpActionType(next, "basic_draw");
        // Corporate Defector: reveal cards drawn with the basic action.
        if (
          next.runner.installed.some(
            (id) =>
              !abilitiesSuppressed(next, id) &&
              next.cards[id]?.revealCorpBasicActionDraws,
          )
        ) {
          const revealed = next.corp.hand.slice(-drewTotal);
          for (const id of revealed) {
            const c = next.cards[id];
            if (c) {
              log(next, `Corporate Defector — reveal ${c.title}.`);
            }
          }
        }
      }
      if (next.activeSide === "corp") {
        for (const rid of [...next.runner.installed]) {
          const rigCard = next.cards[rid];
          if (!rigCard?.onCorpBasicClickForCreditOrDraw) continue;
          fireOnCorpBasicClickForCreditOrDraw(next, rid);
          if (next.pendingChoice) break;
        }
      }
      afterBasicAction(next);
      return ok(next);
    }

    case "basic_install": {
      // Each player installs only their own cards (CR 5.2.6d, 5.2.7d).
      const installing = next.cards[action.cardId];
      if (installing && installing.side !== next.activeSide) {
        return installing.side === "corp"
          ? fail("Only the Corp installs Corp cards.", [
              CR.corpBasicInstall,
              CR.actionsOutsidePhase,
            ])
          : fail("Only the Runner installs Runner cards.", [
              CR.runnerBasicInstall,
              CR.actionsOutsidePhase,
            ]);
      }
      const gate = actionAllowedHere(next, action.type);
      if (!gate.ok) {
        return fail(
          "Basic actions are only legal at the take-action step.",
          gate.cites,
        );
      }
      if (next.activeSide === "runner" && next.turn.dtwnRunnerCannotInstall) {
        return fail(
          "Runner cannot install cards for the remainder of the turn (Jua).",
          [CR.runnerBasicInstall],
        );
      }
      const bad = spendActionClicks(next, "basic_install");
      if (bad) return bad;
      if (next.activeSide === "runner" && action.trashGripForDiscountCardId) {
        const pw = applyPatchworkDiscount(
          next,
          action.trashGripForDiscountCardId,
          action.cardId,
        );
        if (!pw.ok) return fail(pw.error, [CR.runnerBasicInstall]);
        next.turn.patchworkPendingDiscountThisAction = pw.discount;
      }
      const result =
        next.activeSide === "corp"
          ? installCorp(next, action.cardId, action.destination, {
              trashFirstIds: action.trashFirstIds,
            })
          : action.destination.kind === "installed" ||
              action.destination.kind === "host_ice" ||
              action.destination.kind === "host_card"
            ? installRunner(next, action.cardId, action.destination)
            : fail(
                "Runner installs go to the installed area or a legal host.",
                [CR.runnerBasicInstall],
              );
      next.turn.patchworkPendingDiscountThisAction = 0;
      if (!result.ok) return result;
      if (next.activeSide === "corp") {
        noteCorpActionType(result.state, "basic_install");
      }
      // Install-cost X / MU trash open a choice before the card is installed;
      // finish the basic action after that choice resolves.
      if (result.state.deferAfterBasicAction && result.state.pendingChoice) {
        return result;
      }
      afterBasicAction(result.state);
      return result;
    }

    case "basic_trash_resource": {
      // Whose action it is comes before when (CR 5.2.6g, 5.2.4).
      if (next.activeSide !== "corp") {
        return fail(
          "Only the Corp may trash a resource with the basic action.",
          [CR.corpBasicTrashResource, CR.actionsOutsidePhase],
        );
      }
      const gate = actionAllowedHere(next, action.type);
      if (!gate.ok) {
        return fail(
          "Basic actions are only legal at the take-action step.",
          gate.cites,
        );
      }
      if (next.runner.tags <= 0) {
        return fail("Runner must be tagged to trash a resource.", [
          CR.corpBasicTrashResource,
          CR.tagged,
        ]);
      }
      const target = next.cards[action.cardId];
      if (
        !target ||
        target.type !== "resource" ||
        !next.runner.installed.includes(action.cardId)
      ) {
        return fail("Not an installed Runner resource.", [
          CR.corpBasicTrashResource,
        ]);
      }
      if (target.corpCannotTrashWhileOtherResourceInstalled) {
        const other = next.runner.installed.some(
          (id) => id !== action.cardId && next.cards[id]?.type === "resource",
        );
        if (other) {
          return fail(
            "Cannot trash this resource while another resource is installed.",
            [CR.corpBasicTrashResource],
          );
        }
      }
      const corpPts = agendaPointsFor(next, "corp");
      const runnerPts = agendaPointsFor(next, "runner");
      const threat = Math.max(corpPts, runnerPts);
      const threatCost = target.threatBasicTrashAdditionalCostTrashHq;
      const connectionCost = runnerAbilityCarrierIds(next).some((cid) => {
        if (abilitiesSuppressed(next, cid)) return false;
        return (
          Boolean(next.cards[cid]?.connectionBasicTrashAdditionalCostTrashHq) &&
          (target.subtypes ?? []).includes("connection")
        );
      });
      if (typeof threatCost === "number" && threat >= threatCost) {
        if (next.corp.hand.length < 1) {
          return fail("Threat additional cost: must trash 1 card from HQ.", [
            CR.corpBasicTrashResource,
            CR.trashing,
          ]);
        }
        const hqId = chosenCostCard(next, next.corp.hand);
        const hqCard = next.cards[hqId]!;
        // An additional cost; facedown from HQ (CR 1.16.1a, 4.4.6b).
        trashCard(next, hqId, { by: "corp", cause: "cost" });
        log(
          next,
          `Threat ${threatCost} — trash ${hqCard.title} from HQ as additional cost.`,
        );
      } else if (connectionCost) {
        if (next.corp.hand.length < 1) {
          return fail(
            "Sebastião: must trash 1 card from HQ to trash a connection.",
            [CR.corpBasicTrashResource, CR.trashing],
          );
        }
        const hqId = chosenCostCard(next, next.corp.hand);
        const hqCard = next.cards[hqId]!;
        // An additional cost; facedown from HQ (CR 1.16.1a, 4.4.6b).
        trashCard(next, hqId, { by: "corp", cause: "cost" });
        log(
          next,
          `Sebastião — trash ${hqCard.title} from HQ as additional cost.`,
        );
      }
      // Wireless Net Pavilion: additional credit cost to basic trash resource.
      {
        const extra = wirelessNetPavilionExtra(next);
        if (extra > 0) {
          if (next.corp.credits < extra) {
            return fail(
              `Wireless Net Pavilion — must pay ${extra}¢ additional cost.`,
              [CR.corpBasicTrashResource],
            );
          }
          next.corp.credits -= extra;
          log(
            next,
            `Wireless Net Pavilion — pay ${extra}¢ additional cost → ${next.corp.credits}¢.`,
          );
        }
      }
      const pay = basicTrashResourceCreditCost(next);
      if (next.corp.credits < pay) {
        return fail(`Need ${pay}¢ to trash a resource.`, [
          CR.corpBasicTrashResource,
        ]);
      }
      let bad: ApplyResult | null = null;
      withCostCheckpoint(next, "basic_trash_resource", () => {
        next.corp.credits -= pay;
        bad = spendClick(next);
      });
      if (bad) return bad;
      trashCard(next, action.cardId);
      log(
        next,
        `Corp trashes ${target.title} with the basic action (CR ${CR.corpBasicTrashResource.number}).`,
      );
      noteCorpActionType(next, "basic_trash_resource");
      afterBasicAction(next);
      return ok(next);
    }

    case "basic_run": {
      if (next.activeSide !== "runner") {
        return fail("Only the Runner may make a run.", [CR.runnerBasicRun]);
      }
      const gate = actionAllowedHere(next, action.type);
      if (!gate.ok) {
        return fail(
          "Runs are only legal at the Runner take-action step.",
          gate.cites,
        );
      }
      if (!isRunTargetAllowed(next, action.serverId)) {
        return fail(
          "The first run each turn cannot be made against a remote server.",
          [CR.runnerBasicRun],
        );
      }
      const extra = next.turn.runnerMadeRunThisTurn
        ? 0
        : sumRunnerFirstRunAdditionalCost(next);
      const prompted =
        extra > 0 &&
        firstClickMustIsActive(next) &&
        !next.turn.payingFirstRunAdditionalCost;
      if (prompted) {
        const canPay = next.runner.credits >= extra;
        next.turn.pendingFirstRunServerId = action.serverId;
        openPendingChoose(next, {
          sourceId: next.runner.identityId,
          chooser: "runner",
          options: [
            ...(canPay
              ? [
                  {
                    id: "first-run-cost:pay",
                    label: `Pay ${extra}¢ and make the run`,
                    effect: {
                      op: "do" as const,
                      action: {
                        kind: "gain_credits" as const,
                        side: "runner" as const,
                        amount: 0,
                      },
                    },
                  },
                ]
              : []),
            {
              id: "first-run-cost:decline",
              label: "Decline the additional cost",
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
          logLine: `The first click must be a run — the additional ${extra}¢ can be declined (CR ${CR.mustNotForceAdditionalCost.number}).`,
        });
        return ok(next);
      }
      if (extra > 0 && next.runner.credits < extra) {
        return fail(
          `First run this turn requires ${extra} additional credits (Enhanced Login Protocol).`,
          [CR.runnerBasicRun],
        );
      }
      const elpClick = enhancedLoginProtocolClick(next);
      if (elpClick && next.runner.clicks < 2) {
        return fail(
          "Enhanced Login Protocol — the first run each turn spends an additional click.",
          [CR.abilitiesDuringRun, CR.runnerBasicRun],
        );
      }
      // The click and any additional costs are paid together, then the
      // cost checkpoint, before the run begins (CR 1.16.10b, 10.3.4).
      let bad: ApplyResult | null = null;
      withCostCheckpoint(next, "basic_run", () => {
        bad = spendClick(next);
        if (bad) return;
        if (elpClick) {
          bad = spendClick(next);
          if (bad) return;
          log(
            next,
            `Enhanced Login Protocol — spend 1 click to initiate the run (CR ${CR.abilitiesDuringRun.number}).`,
          );
        }
        if (extra > 0) {
          subtractRunnerCreditPool(next, extra);
          next.turn.payingFirstRunAdditionalCost = false;
          log(
            next,
            `Runner pays ${extra}¢ additional cost for first run this turn.`,
          );
        }
      });
      if (bad) return bad;
      next.turn.runnerTookBasicRunActionThisTurn = true;
      const walked = startRun(next, action.serverId);
      if (!walked.ok) {
        next.run = null;
        return walked;
      }
      finishRunReturnToAction(walked.state);
      return walked;
    }

    case "play_operation":
    case "play_event": {
      // The list's "play only if" check (CR 9.3.3b, 9.1.8c). Read before the
      // play and applied after it, so the play's own reasons come first.
      const restricted =
        Boolean(next.cards[action.cardId]) &&
        !playRestrictionOk(next, action.cardId);
      const played =
        action.type === "play_operation"
          ? playOperation(next, action.cardId)
          : playEvent(
              next,
              action.cardId,
              action.serverId,
              action.trashGripForDiscountCardId,
            );
      if (played.ok && restricted) {
        return fail(
          `${next.cards[action.cardId]?.title ?? action.cardId}: its play restriction is not met.`,
          [
            CR.actRestriction,
            action.type === "play_operation" ? CR.playOperation : CR.playEvent,
          ],
        );
      }
      return played;
    }

    case "advance":
      return advanceCard(next, action.cardId);

    case "score_agenda":
      return scoreAgendaAction(next, action.cardId);

    case "use_identity_ability":
      return useIdentityAbility(next, action.abilityId);

    case "rez_ice":
      return rezIce(next, action.cardId);

    case "break_subroutine":
      return breakSubroutine(next, action.breakerId, action.subIndex);

    case "break_bioroid_subroutine":
      return breakBioroidSubroutine(next, action.subIndex);

    case "break_bioroid_subroutines":
      return breakBioroidSubroutines(next, action.subIndexes);

    case "use_paid_ability":
      return usePaidAbility(
        next,
        action.cardId,
        action.abilityId,
        action.serverId,
      );

    case "rez_asset":
      return rezAsset(next, action.cardId);

    case "choose_trash_program":
      return fail("No pending trash-program choice.", [CR.trashing]);

    case "resolve_sabotage":
      return fail("No pending sabotage.", [CR.sabotage]);

    case "jack_out":
      return jackOut(next);
    case "access_card":
    case "steal_agenda":
    case "trash_accessed":
    case "access_rfg_paying_trash_cost":
    case "access_trash_from_grip":
    case "access_trash_with_virus":
    case "access_trash_free":
    case "access_trash_paying_printed_cost_from_stealth":
    case "access_trash_self_non_agenda_draw":
    case "access_host_non_agenda_faceup":
    case "access_host_agenda_on_film_critic":
    case "finish_access":
    case "finish_breach":
      return applyAccessAction(next, action);

    case "boost_trace":
    case "spend_link":
    case "resolve_trace":
      return fail("No trace in progress.", [CR.trace]);

    case "psi_runner_bid":
    case "psi_corp_bid":
      return fail("No psi game in progress.", [CR.trace]);

    case "prevent_damage":
    case "prevent_damage_lose_all_clicks":
    case "accept_damage":
      return fail("No pending damage.", [CR.preventDamage]);

    case "accept_expose":
      if (!next.pendingExpose) {
        return fail("No pending expose.", [CR.expose]);
      }
      acceptPendingExpose(next);
      resumeExposeUpTo(next);
      return ok(next);
    case "accept_installed_trash":
      if (!next.pendingTrashPrevent) {
        return fail("No pending installed trash.", [CR.trashing]);
      }
      acceptPendingInstalledTrash(next, (s, id, by) =>
        trashCard(s, id, { by }),
      );
      return ok(next);
    case "trigger_pending_trash_interrupt":
      return fail("No pending installed trash.", [
        CR.conditionalInterruptStillRelevant,
      ]);
    case "accept_tags":
      return fail("No pending tags.", [CR.tags]);

    case "accept_end_the_run":
      return fail("No pending end the run.", [CR.endTheRun]);

    case "discard_to_hand_size":
      return discardPhase(next, action.cardIds);

    case "choose_option":
      return fail("No pending choice.", [CR.paidAbility]);

    default: {
      const _exhaustive: never = action;
      return fail(`Unknown action: ${JSON.stringify(_exhaustive)}`, []);
    }
  }
}

/**
 * MirrorMorph: the Corp chose to take another different action. It is part
 * of resolving the reward in the reaction window (CR 5.2.2d), so the action
 * window opens now, before the next paid ability window (CR 5.6.2a).
 */
function openExtraDifferentActionWindow(state: GameState): void {
  if (
    !state.turn.extraDifferentAction ||
    state.pendingChoice ||
    state.timingKey === "corp.takeAction" ||
    state.activeSide !== "corp" ||
    state.turnPhase !== "corp_action"
  ) {
    return;
  }
  const from = state.timingKey;
  enterStep(state, "corp.takeAction");
  if (queryLegalActions(state).length === 0) {
    abandonExtraDifferentAction(state);
    enterStep(state, from);
  }
}

export function describeState(state: GameState): string {
  const step = getStep(state);
  const lines = [
    `Turn ${state.turnNumber} | active=${state.activeSide} | phase=${state.turnPhase} | key=${state.timingKey}`,
    `Timing: [${step.stepNumber}] ${step.label} (${step.stepId}) kind=${step.kind}`,
    `Corp: ${state.corp.clicks} clicks, ${state.corp.credits}c, hand=${state.corp.hand.length}, R&D=${state.corp.deck.length}, score=${state.corp.scoreArea.length}`,
    `Runner: ${state.runner.clicks} clicks, ${state.runner.credits}c, tags=${state.runner.tags}, coreDamage=${state.runner.coreDamage}, grip=${state.runner.hand.length}, installed=${state.runner.installed.length}`,
    `Servers: ${listServers(state)
      .map((s) => {
        const iceDesc = s.ice
          .map(
            (id) =>
              `${state.cards[id].title}${state.cards[id].rezzed ? "*" : ""}`,
          )
          .join("|");
        return `${s.id}[ice=${iceDesc || "—"},root=${s.root.length}]`;
      })
      .join(", ")}`,
  ];
  if (state.winner) {
    lines.push(`Winner: ${state.winner} (${state.winReason})`);
  }
  if (state.checkpoints.length) {
    lines.push(
      `Checkpoints: ${state.checkpoints.map((c) => `${c.kind}:${c.label}`).join(" > ")}`,
    );
  }
  if (state.priorityStack.length) {
    lines.push(
      `Priority: ${state.priorityStack.map((p) => `d${p.nestDepth}/${p.priorityHolder}/pass${p.consecutivePasses}`).join(" > ")}`,
    );
  }
  if (state.restrictions.length) {
    lines.push(
      `Restrictions: ${state.restrictions.map((r) => `${r.forbid}@${r.source}`).join(", ")}`,
    );
  }
  if (state.trace) {
    lines.push(
      `Trace: base=${state.trace.baseStrength} corp+${state.trace.corpSpent} link+${state.trace.runnerLinkSpent}`,
    );
  }
  if (state.pendingDamage) {
    lines.push(
      `Pending damage: ${state.pendingDamage.remaining} ${state.pendingDamage.type}`,
    );
  }
  if (state.pendingTrashProgram) {
    lines.push(
      `Pending trash program: choose among ${state.pendingTrashProgram.candidates.join(",")}`,
    );
  }
  if (state.run) {
    lines.push(
      `Run: ${state.run.attackedServerId} phase=${state.run.phase} success=${state.run.successful} pos=${state.run.position} etr=${state.run.endedTheRun} noJack=${state.run.cannotJackOut}`,
    );
    if (state.run.encounter) {
      const iceId = state.run.encounter.iceId;
      lines.push(
        `Encounter: ${iceId} str=${effectiveIceStrength(state, iceId)} broken=${state.run.encounter.broken.join(",")}`,
      );
    }
    if (state.run.accessingCardId) {
      lines.push(`Accessing: ${state.run.accessingCardId}`);
    }
  }
  const empty = emptyRemoteExists(state);
  if (empty) lines.push(`Empty remote present: ${empty.id}`);
  return lines.join("\n");
}

/**
 * A damage or tag interrupt window has closed (CR 9.2.9). When a run step's
 * instruction opened it and nothing else is waiting, the run goes on from
 * that step as it does after a choice, instead of resolving the step again
 * (CR 9.2.4: the game continues to the next timing step; 9.12.3d).
 * Elsewhere the walk is left as it was.
 */
function continueAfterInterruptWindow(state: GameState): ApplyResult {
  if (!state.run || effectResolutionBlocked(state) || state.pendingEndTheRun) {
    return ok(state);
  }
  const kind = getStep(state).kind;
  if (kind !== "auto" && kind !== "branch") return ok(state);
  return continueRunAfterPausedStep(state);
}

/**
 * A choice or an interrupt window opened by a run step's instruction has
 * closed and nothing else is waiting. The run goes on from that step (CR
 * 9.2.2): the step's instruction has resolved, so it is not resolved again.
 * A "choose one" encounter ability is asked once (CR 9.12.3d, 9.11.4g).
 */
export function continueRunAfterPausedStep(state: GameState): ApplyResult {
  const run = state.run!;
  // ETR from jack-out offer
  if (run.endedTheRun) {
    enterStep(state, "run.closePriorityWindows");
  } else if (state.timingKey !== "run.ends" || run.isPostRunBreach) {
    // Run Ends is not skipped: a run-end ability's choice (Boomerang)
    // pauses it partway, and it resolves again to finish, so the run is
    // complete (CR 6.9.6d). Its onResolve is written to come back. Once it
    // has finished and a post-run breach has begun (Virtuoso), the step
    // goes on to that breach.
    const step = getStep(state);
    if (step.kind === "auto" || step.kind === "branch") {
      const nextKey =
        typeof step.next === "function" ? step.next(state) : step.next;
      enterStep(state, nextKey);
    }
  }
  if (
    run.accessingCardId &&
    (state.timingKey === "access.midAccess" ||
      state.timingKey === "access.cardAccessed" ||
      state.timingKey === "access.stealAgenda")
  ) {
    autoWalk(state);
    return advanceFromMidAccess(state);
  }
  const cont = advanceRunUntilStop(state);
  if (!cont.ok) return cont;
  finishRunReturnToAction(cont.state);
  return cont;
}

/**
 * The damage or tags were one instruction, often of a pending instance in a
 * paused reaction window. The rest of that instance resolves first, then the
 * window's other instances (CR 9.2.8a, 9.2.8d), and only then the next
 * instruction of the ability that opened the window (CR 9.11.3, 10.3.2).
 */
function resumeAfterDamage(state: GameState): void {
  resumeContinuationsOfPausedWindows(state);
  if (!state.pendingChoice) resumePendingStoredConditionals(state);
  resumePendingEffectContinuation(state);
}
