/**
 * Playing an operation or an event, including the Patchwork discount.
 */
import { log } from "../state/createGame.js";
import {
  evalEffect,
  fireGrayBlackOpsTrashedHooks,
  fireOnAfterOperationOrExpendable,
} from "../effects/eval.js";
import { fireCorpIdentityFlippedFirstOperationPlay } from "../state/identityFlipHooks.js";
import { fireSiAfterCorpRezOrPlay } from "../effects/mumbadSiPrimitives.js";
import { withCostCheckpoint } from "../legality/checkpoints.js";
import {
  isCurrentCard,
  placeCurrentAfterPlay,
  runnerCannotPlayCurrentEvents,
} from "../state/currents.js";
import {
  effectiveEventPlayCost,
  firstDoubleOperationClickDiscountAvailable,
  operationAndEventPlayCostIncreaseTotal,
  runnerCreditsFor,
  spendRunnerCreditsFor,
} from "../state/costs.js";
import { hasActiveLockdown } from "../state/lockdowns.js";
import { effectiveRunnerTags, runnerIsTagged } from "../state/tags.js";
import { noteCorpActionType } from "../state/corpActionHooks.js";
import {
  moveRunnerCardToHeap,
  noteCorpCardAddedToArchives,
} from "../state/trashHooks.js";
import { agendaPointsFor } from "../state/scoring.js";
import { isServerAllowedForSpec, modifiersFromStartsRun } from "../state/runStart.js";
import { afterBasicAction } from "../timing/machine.js";
import type { ApplyResult, GameState, RuleCite, ServerId } from "../state/types.js";
import { CR } from "../timing/labels.js";
import { hostedPlayableAsGrip } from "./installRunner.js";
import { finishRunReturnToAction, startRun } from "./run.js";
import { spendClick } from "./spendClick.js";

function fail(error: string, cites: RuleCite[]): ApplyResult {
  return { ok: false, error, cites };
}

function ok(state: GameState): ApplyResult {
  return { ok: true, state };
}

export function applyPatchworkDiscount(
  state: GameState,
  trashGripCardId: string | undefined,
  playingOrInstallingId: string,
): { ok: true; discount: number } | { ok: false; error: string } {
  if (!trashGripCardId) return { ok: true, discount: 0 };
  if (state.turn.patchworkDiscountUsedThisTurn) {
    return { ok: false, error: "Patchwork discount already used this turn." };
  }
  if (trashGripCardId === playingOrInstallingId) {
    return { ok: false, error: "Cannot trash the card being played/installed." };
  }
  let amount = 0;
  let hwId: string | undefined;
  for (const id of state.runner.rig) {
    const c = state.cards[id];
    const n = c?.playOrInstallDiscountByTrashingGripOncePerTurn;
    if (n) {
      amount = n;
      hwId = id;
      break;
    }
  }
  if (!amount || !hwId) {
    return { ok: false, error: "No Patchwork-class discount installed." };
  }
  const idx = state.runner.hand.indexOf(trashGripCardId);
  if (idx < 0) {
    return { ok: false, error: "Patchwork trash target not in grip." };
  }
  state.runner.hand.splice(idx, 1);
  const trashed = state.cards[trashGripCardId]!;
  state.runner.discard.push(trashGripCardId);
  trashed.zone = "runner:heap";
  trashed.faceup = true;
  state.turn.patchworkDiscountUsedThisTurn = true;
  log(
    state,
    `${state.cards[hwId]!.title} — trash ${trashed.title} from grip for −${amount}¢.`,
  );
  return { ok: true, discount: amount };
}

export function playOperation(state: GameState, cardId: string): ApplyResult {
  if (state.activeSide !== "corp") {
    return fail("Only Corp plays operations.", [CR.playOperation]);
  }
  const card = state.cards[cardId];
  if (!card || card.type !== "operation") {
    return fail("Not an operation.", [CR.playOperation]);
  }
  state.turn.operationPlayedFromNonHq = false;
  const handIdx = state.corp.hand.indexOf(cardId);
  if (handIdx < 0) return fail("Operation not in HQ.", [CR.playOperation]);
  if (card.playRequiresTagged && !runnerIsTagged(state)) {
    return fail("Play requires the Runner to be tagged.", [CR.playOperation]);
  }
  if (
    typeof card.playRequiresMinTags === "number" &&
    effectiveRunnerTags(state) < card.playRequiresMinTags
  ) {
    return fail(
      `Play requires the Runner to have at least ${card.playRequiresMinTags} tags.`,
      [CR.playOperation],
    );
  }
  if (
    card.playRequiresSuccessfulRunLastTurn &&
    !state.turn.successfulRunLastTurn
  ) {
    return fail("Play requires a successful run last turn.", [CR.playOperation]);
  }
  if (
    card.playRequiresNoSuccessfulRunLastTurn &&
    state.turn.successfulRunLastTurn
  ) {
    return fail(
      "Play requires the Runner made no successful run last turn.",
      [CR.playOperation],
    );
  }
  if (
    card.playRequiresUnsuccessfulRunLastTurn &&
    !state.turn.unsuccessfulRunLastTurn
  ) {
    return fail("Play requires an unsuccessful run last turn.", [
      CR.playOperation,
    ]);
  }
  if (
    card.playRequiresRunnerAccessedCardLastTurn &&
    !state.turn.accessedACardLastTurn
  ) {
    return fail(
      "Play requires the Runner accessed a card last turn.",
      [CR.playOperation],
    );
  }
  if (
    card.playRequiresRunnerMadeRunLastTurn &&
    !state.turn.runnerMadeRunLastTurn
  ) {
    return fail("Play requires the Runner made a run last turn.", [
      CR.playOperation,
    ]);
  }
  if (
    card.playRequiresRunnerInstalledResourceLastTurn &&
    !state.turn.runnerInstalledResourceLastTurn
  ) {
    return fail(
      "Play requires the Runner to have installed a resource during their last turn.",
      [CR.playOperation],
    );
  }
  if (
    typeof card.playRequiresRunnerAgendaPointsGte === "number" &&
    agendaPointsFor(state, "runner") < card.playRequiresRunnerAgendaPointsGte
  ) {
    return fail(
      `Play requires the Runner to have at least ${card.playRequiresRunnerAgendaPointsGte} agenda points.`,
      [CR.playOperation],
    );
  }
  if (card.playRequiresAgendaInRunnerScoreArea) {
    const hasAgenda = state.runner.score.some(
      (id) => state.cards[id]?.type === "agenda",
    );
    if (!hasAgenda) {
      return fail(
        "Play requires an agenda in the Runner's score area.",
        [CR.playOperation],
      );
    }
  }
  if (
    card.playRequiresNoSuccessfulHqRunLastTurn &&
    state.turn.successfulHqRunLastTurn
  ) {
    return fail(
      "Play requires no successful HQ run during the Runner's last turn.",
      [CR.playOperation],
    );
  }
  if (typeof card.playRequiresThreat === "number") {
    const threatPts = Math.max(
      agendaPointsFor(state, "corp"),
      agendaPointsFor(state, "runner"),
    );
    if (threatPts < card.playRequiresThreat) {
      return fail(
        `Play requires Threat ${card.playRequiresThreat} (have ${threatPts}).`,
        [CR.playOperation],
      );
    }
  }
  if (
    card.playRequiresAgendaStolenLastTurn &&
    (state.turn.agendaPointsStolenLastTurn ?? 0) <= 0
  ) {
    return fail(
      "Play requires the Runner to have stolen an agenda last turn.",
      [CR.playOperation],
    );
  }
  if (
    card.playRequiresRunnerStoleOrTrashedCorpCardLastTurn &&
    !state.turn.runnerStoleOrTrashedCorpCardLastTurn
  ) {
    return fail(
      "Play requires the Runner to have stolen or trashed a Corp card last turn.",
      [CR.playOperation],
    );
  }
  if (
    card.playRequiresRunnerTrashedCorpCardLastTurn &&
    !state.turn.runnerTrashedCorpCardLastTurn
  ) {
    return fail(
      "Play requires the Runner to have trashed a Corp card last turn.",
      [CR.playOperation],
    );
  }
  if (card.playRequiresRunnerHasInstalledHardwareOrNonVirtualResource) {
    const okTarget = state.runner.rig.some((id) => {
      const c = state.cards[id];
      if (!c) return false;
      if (c.type === "hardware") return true;
      if (c.type === "resource" && !(c.subtypes ?? []).includes("virtual")) {
        return true;
      }
      return false;
    });
    if (!okTarget) {
      return fail(
        "Play requires the Runner to have installed hardware or a non-virtual resource.",
        [CR.playOperation],
      );
    }
  }
  if (card.playRequiresRunnerHasInstalledCard) {
    if (state.runner.rig.length === 0) {
      return fail("Play requires the Runner to have at least 1 installed card.", [
        CR.playOperation,
      ]);
    }
  }
  if (card.playRequiresCorpHasInstalledCard) {
    let hasInstalled = false;
    for (const server of Object.values(state.servers)) {
      if (server.root.length > 0 || server.ice.length > 0) {
        hasInstalled = true;
        break;
      }
    }
    if (!hasInstalled) {
      return fail(
        "Play requires the Corp to have at least 1 installed card.",
        [CR.playOperation],
      );
    }
  }
  if (card.playRequiresScoredAgendaNotInstalledThisTurn) {
    const scored = state.turn.scoredCardIdsThisTurn ?? [];
    const installed = state.turn.installedThisTurn ?? [];
    if (!scored.some((id) => !installed.includes(id))) {
      return fail(
        "Play requires scoring an agenda this turn that was not installed this turn.",
        [CR.playOperation],
      );
    }
  }
  if (card.playRequiresScoredAgendaThisTurn) {
    const scored = state.turn.scoredCardIdsThisTurn ?? [];
    if (scored.length === 0) {
      return fail("Play requires scoring an agenda this turn.", [
        CR.playOperation,
      ]);
    }
  }
  if (
    (card.playRequiresNoActiveLockdown ||
      (card.subtypes ?? []).includes("lockdown")) &&
    hasActiveLockdown(state)
  ) {
    return fail("Cannot play while a lockdown is active.", [
      CR.playOperation,
      CR.lockdownOperation,
    ]);
  }
  const rawExtra =
    typeof card.playAdditionalClicks === "number"
      ? card.playAdditionalClicks
      : card.playAdditionalClick
        ? 1
        : 0;
  const discount =
    rawExtra > 0
      ? Math.min(rawExtra, firstDoubleOperationClickDiscountAvailable(state))
      : 0;
  const extraClick = rawExtra - discount;
  const clicksNeeded = 1 + extraClick;
  if (state.corp.clicks < clicksNeeded) {
    return fail(
      rawExtra > 0
        ? "Operation requires additional click(s)."
        : "Insufficient clicks.",
      [CR.playOperation],
    );
  }
  const cost =
    (card.playCost ?? 0) + operationAndEventPlayCostIncreaseTotal(state);
  if (state.corp.credits < cost) {
    return fail("Insufficient credits to play operation.", [CR.playOperation]);
  }
  if (card.playCostXMaxRunnerTags && state.runner.tags <= 0) {
    return fail("Psychographics requires the Runner to be tagged.", [
      CR.playOperation,
    ]);
  }
  const bad = spendClick(state);
  if (bad) return bad;
  if (extraClick > 0) {
    state.corp.clicks -= extraClick;
  }
  if (discount > 0) {
    state.turn.doubleOpClickDiscountUsedThisTurn = true;
    log(
      state,
      `First double operation click discount −${discount} (Synchrocyclotron-class).`,
    );
  }
  withCostCheckpoint(state, "play_operation", () => {
    state.corp.credits -= cost;
  });
  state.corp.hand.splice(handIdx, 1);
  const linger =
    Boolean(card.lingerUntilCorpNextTurnBegins) ||
    (card.subtypes ?? []).includes("lockdown");
  if (card.lingerAsCurrent) {
    placeCurrentAfterPlay(state, cardId, "corp");
  } else if (linger) {
    card.zone = "corp:play-area";
    card.faceup = true;
    log(
      state,
      `${card.title} remains in play until Corp's next turn begins (CR ${CR.playNotTrashedUntil.number}).`,
    );
  } else if (card.rfgInsteadOfTrashing) {
    card.zone = "removed-from-game";
    card.faceup = true;
    if (!state.removedFromGame) state.removedFromGame = [];
    if (!state.removedFromGame.includes(cardId)) {
      state.removedFromGame.push(cardId);
    }
    log(state, `${card.title} is removed from the game instead of trashing.`);
  } else {
    state.corp.discard.push(cardId);
    card.zone = "corp:archives";
    card.faceup = true;
    noteCorpCardAddedToArchives(state);
    fireGrayBlackOpsTrashedHooks(state, cardId);
  }
  if (card.playAdditionalCost) {
    const r = evalEffect(
      { state, sourceId: cardId },
      card.playAdditionalCost,
    );
    if (!r.ok) return fail(r.error, r.cites);
    log(
      state,
      `Additional cost paid for ${card.title} (CR ${CR.playOperation.number}).`,
    );
  }
  if (card.subliminalMessaging) {
    const isFirstSubliminal = !state.turn.subliminalPlayedThisTurn;
    state.turn.subliminalPlayedThisTurn = true;
    log(
      state,
      `Corp plays ${card.title} for ${cost}¢ (CR ${CR.playOperation.number}).`,
    );
    if ((card.subtypes ?? []).includes("transaction")) {
      const idCard = state.cards[state.corp.identityId];
      const bonus = idCard?.gainCreditOnTransactionPlayed ?? 0;
      if (bonus > 0) {
        state.corp.credits += bonus;
        log(
          state,
          `${idCard!.title} — gain ${bonus}¢ (transaction played).`,
        );
      }
    }
    if (card.onPlay) {
      const effect = isFirstSubliminal
        ? card.onPlay
        : {
            op: "do" as const,
            action: {
              kind: "gain_credits" as const,
              side: "corp" as const,
              amount: 1,
            },
          };
      const r = evalEffect({ state, sourceId: cardId }, effect);
      if (!r.ok) return fail(r.error, r.cites);
    }
    noteCorpActionType(state, "play_operation");
    fireCorpIdentityFlippedFirstOperationPlay(state);
    afterBasicAction(state);
    return ok(state);
  }
  log(
    state,
    `Corp plays ${card.title} for ${cost}¢ (CR ${CR.playOperation.number}).`,
  );
  if ((card.subtypes ?? []).includes("mandate")) {
    state.turn.mandatesPlayedThisTurn =
      (state.turn.mandatesPlayedThisTurn ?? 0) + 1;
  }
  if ((card.subtypes ?? []).includes("transaction")) {
    const idCard = state.cards[state.corp.identityId];
    const bonus = idCard?.gainCreditOnTransactionPlayed ?? 0;
    if (bonus > 0) {
      state.corp.credits += bonus;
      log(
        state,
        `${idCard!.title} — gain ${bonus}¢ (transaction played).`,
      );
    }
  }
  if (card.onPlay) {
    const r = evalEffect({ state, sourceId: cardId }, card.onPlay);
    if (!r.ok) return fail(r.error, r.cites);
  }
  fireSiAfterCorpRezOrPlay(state, cardId);
  if (card.endsActionPhase) {
    state.corp.clicks = 0;
    log(
      state,
      `${card.title} is terminal — end the action phase (CR ${CR.playOperation.number}).`,
    );
  }
  if (state.pendingChoice) {
    state.deferAfterBasicAction = true;
    return ok(state);
  }
  noteCorpActionType(state, "play_operation");
  fireCorpIdentityFlippedFirstOperationPlay(state);
  fireOnAfterOperationOrExpendable(state);
  if (state.pendingChoice) {
    state.deferAfterBasicAction = true;
    return ok(state);
  }
  afterBasicAction(state);
  return ok(state);
}

export function playEvent(
  state: GameState,
  cardId: string,
  serverId?: ServerId,
  trashGripForDiscountCardId?: string,
): ApplyResult {
  if (state.activeSide !== "runner") {
    return fail("Only Runner plays events.", [CR.playEvent]);
  }
  const card = state.cards[cardId];
  if (!card || card.type !== "event") {
    return fail("Not an event.", [CR.playEvent]);
  }
  const handIdx = state.runner.hand.indexOf(cardId);
  const blingHostId = handIdx < 0 ? hostedPlayableAsGrip(state, cardId) : null;
  if (handIdx < 0 && !blingHostId) return fail("Event not in grip.", [CR.playEvent]);
  if (
    isCurrentCard(card) &&
    runnerCannotPlayCurrentEvents(state)
  ) {
    return fail("Cannot play current events while The News Now Hour is active.", [
      CR.playEvent,
    ]);
  }
  if (
    card.playRequiresSuccessfulRunThisTurn &&
    !state.turn.successfulRunThisTurn
  ) {
    return fail("Play requires a successful run this turn.", [CR.playEvent]);
  }
  if (
    card.playRequiresSuccessfulHqRunThisTurn &&
    !state.turn.successfulHqRunThisTurn
  ) {
    return fail("Play requires a successful HQ run this turn.", [CR.playEvent]);
  }
  if (
    card.playRequiresSuccessfulCentralRunThisTurn &&
    !(
      state.turn.successfulHqRunThisTurn ||
      state.turn.successfulRdRunThisTurn ||
      state.turn.successfulArchivesRunThisTurn
    )
  ) {
    return fail(
      "Play requires a successful central run this turn.",
      [CR.playEvent],
    );
  }
  if (
    card.playRequiresSuccessfulAllCentralsThisTurn &&
    !(
      state.turn.successfulHqRunThisTurn &&
      state.turn.successfulRdRunThisTurn &&
      state.turn.successfulArchivesRunThisTurn
    )
  ) {
    return fail(
      "Play requires successful runs on HQ, R&D, and Archives this turn.",
      [CR.playEvent],
    );
  }
  if (
    card.playRequiresCorpScoredNoAgendasLastTurn &&
    state.turn.corpScoredAgendaLastTurn
  ) {
    return fail(
      "Play requires the Corp scored no agendas during their last turn.",
      [CR.playEvent],
    );
  }
  if (card.playRequiresTagged && !runnerIsTagged(state)) {
    return fail("Play requires the Runner to be tagged.", [CR.playEvent]);
  }
  if (
    card.playRequiresCorpBadPublicityGte &&
    (state.corp.badPublicity ?? 0) < card.playRequiresCorpBadPublicityGte
  ) {
    return fail("Play requires the Corp to have bad publicity.", [CR.playEvent]);
  }
  if (
    card.playRequiresInstalledResource &&
    !state.runner.rig.some((id) => state.cards[id]?.type === "resource")
  ) {
    return fail("Play requires an installed resource.", [CR.playEvent]);
  }
  if (
    card.playRequiresInstalledProgram &&
    !state.runner.rig.some((id) => state.cards[id]?.type === "program")
  ) {
    return fail("Play requires an installed program.", [CR.playEvent]);
  }
  if (
    card.playRequiresInstalledProgramOrHardware &&
    !state.runner.rig.some((id) => {
      const t = state.cards[id]?.type;
      return t === "program" || t === "hardware";
    })
  ) {
    return fail("Play requires an installed program or hardware.", [
      CR.playEvent,
    ]);
  }
  if (
    typeof card.playRequiresOtherGripCardsGte === "number" &&
    state.runner.hand.filter((id) => id !== cardId).length <
      card.playRequiresOtherGripCardsGte
  ) {
    return fail(
      `Play requires trashing ${card.playRequiresOtherGripCardsGte} other cards from grip.`,
      [CR.playEvent],
    );
  }
  if (
    typeof card.playRequiresOtherCardsInHq === "number" &&
    state.corp.hand.filter((id) => id !== cardId).length <
      card.playRequiresOtherCardsInHq
  ) {
    return fail(
      `Play requires at least ${card.playRequiresOtherCardsInHq} other cards in HQ.`,
      [CR.playOperation],
    );
  }
  if (card.playRequiresUntagged && runnerIsTagged(state)) {
    return fail("Play requires the Runner to be untagged.", [CR.playEvent]);
  }
  if (
    card.playRequiresSuccessfulRunLastTurn &&
    !state.turn.successfulRunLastTurn
  ) {
    return fail("Play requires a successful run last turn.", [CR.playEvent]);
  }
  if (
    card.playRequiresNoSuccessfulRunLastTurn &&
    state.turn.successfulRunLastTurn
  ) {
    return fail(
      "Play requires the Runner made no successful run last turn.",
      [CR.playEvent],
    );
  }
  if (
    card.playRequiresUnsuccessfulRunLastTurn &&
    !state.turn.unsuccessfulRunLastTurn
  ) {
    return fail("Play requires an unsuccessful run last turn.", [
      CR.playEvent,
    ]);
  }
  if (
    card.playRequiresFirstClick &&
    (state.turn.runnerClicksSpentThisTurn ?? 0) > 0
  ) {
    return fail("Play only as your first [click].", [CR.playEvent]);
  }
  if (typeof card.playRequiresThreat === "number") {
    const threatPts = Math.max(
      agendaPointsFor(state, "corp"),
      agendaPointsFor(state, "runner"),
    );
    if (threatPts < card.playRequiresThreat) {
      return fail(
        `Play requires Threat ${card.playRequiresThreat} (have ${threatPts}).`,
        [CR.playEvent],
      );
    }
  }
  if (
    card.playRequiresAgendaStolenThisTurn &&
    (state.turn.agendaPointsStolenThisTurn ?? 0) <= 0
  ) {
    return fail(
      "Play requires the Runner to have stolen an agenda this turn.",
      [CR.playEvent],
    );
  }
  if (
    card.playRequiresVirusCounterPlacedOnProgramThisTurn &&
    (state.turn.programsWithVirusPlacedThisTurn?.length ?? 0) === 0
  ) {
    return fail(
      "Play requires placing a virus counter on a program this turn.",
      [CR.playEvent],
    );
  }
  let extraClick =
    typeof card.playAdditionalClicks === "number"
      ? card.playAdditionalClicks
      : card.playAdditionalClick
        ? 1
        : 0;
  if (
    extraClick > 0 &&
    (card.subtypes ?? []).includes("double") &&
    !state.turn.starlightDoubleEventAdditionalCostIgnored
  ) {
    for (const rid of state.runner.rig) {
      const host = state.cards[rid];
      if (!host?.ignoreAdditionalCostFirstDoubleEventEachTurn) continue;
      extraClick = 0;
      state.turn.starlightDoubleEventAdditionalCostIgnored = true;
      log(state, `${host.title} — ignore additional cost on double event.`);
      break;
    }
  }
  const clicksNeeded = 1 + extraClick;
  if (state.runner.clicks < clicksNeeded) {
    return fail(
      extraClick > 0
        ? "Event requires additional click(s)."
        : "Insufficient clicks.",
      [CR.playEvent],
    );
  }
  if (trashGripForDiscountCardId) {
    const pw = applyPatchworkDiscount(
      state,
      trashGripForDiscountCardId,
      cardId,
    );
    if (!pw.ok) return fail(pw.error, [CR.playEvent]);
    state.turn.patchworkPendingDiscountThisAction = pw.discount;
  }
  const cost = effectiveEventPlayCost(state, card.playCost, card);
  if (runnerCreditsFor(state, "play_event") < cost) {
    state.turn.patchworkPendingDiscountThisAction = 0;
    return fail("Insufficient credits to play event.", [
      CR.playEvent,
      CR.costCalculation,
      CR.eventPlayCost,
    ]);
  }
  const bad = spendClick(state);
  if (bad) {
    state.turn.patchworkPendingDiscountThisAction = 0;
    return bad;
  }
  if (extraClick > 0) {
    state.runner.clicks -= extraClick;
  }
  withCostCheckpoint(state, "play_event", () => {
    spendRunnerCreditsFor(state, cost, "play_event");
  });
  state.turn.patchworkPendingDiscountThisAction = 0;
  // Leave hand/hosted then move to heap (fires onTrashFromGripOrStack — Steelskin).
  // Recompute hand index — Patchwork may have spliced grip.
  const handIdxAfter = state.runner.hand.indexOf(cardId);
  if (handIdxAfter >= 0) {
    state.runner.hand.splice(handIdxAfter, 1);
  } else if (blingHostId) {
    const host = state.cards[blingHostId]!;
    host.hostedCardIds = (host.hostedCardIds ?? []).filter((id) => id !== cardId);
    card.hostId = undefined;
  }
  if (card.lingerAsCurrent) {
    placeCurrentAfterPlay(state, cardId, "runner");
  } else {
    card.zone = "runner:grip";
    moveRunnerCardToHeap(state, cardId);
  }
  if ((card.powerCountersOnPlay ?? 0) > 0) {
    card.powerCounters = card.powerCountersOnPlay;
  }
  if (card.playAdditionalCost) {
    const r = evalEffect(
      { state, sourceId: cardId },
      card.playAdditionalCost,
    );
    if (!r.ok) return fail(r.error, r.cites);
    log(
      state,
      `Additional cost paid for ${card.title} (CR ${CR.playEvent.number}).`,
    );
  }
  log(
    state,
    `Runner plays ${card.title} for ${cost}¢ (CR ${CR.playEvent.number}${
      cost !== (card.playCost ?? 0)
        ? `; cost calc ${CR.costCalculation.number}`
        : ""
    }).`,
  );
  if ((card.subtypes ?? []).includes("run")) {
    const idCard = state.cards[state.runner.identityId];
    const bonus = idCard?.gainCreditOnFirstRunEvent ?? 0;
    if (bonus > 0 && state.turn.runEventsPlayedThisTurn === 0) {
      state.runner.credits += bonus;
      log(
        state,
        `${idCard!.title} — gain ${bonus}¢ (first run event this turn).`,
      );
    }
    if (state.turn.runEventsPlayedThisTurn === 0) {
      for (const rid of state.runner.rig) {
        const rigCard = state.cards[rid];
        if (!rigCard?.gainClickOnFirstRunEventThisTurn) continue;
        state.runner.clicks += 1;
        log(
          state,
          `${rigCard.title} — gain [click] (first run event this turn).`,
        );
      }
    }
    state.turn.runEventsPlayedThisTurn += 1;
    // Debbie-class: place hosted credits on installed cards.
    for (const id of state.runner.rig) {
      const rigCard = state.cards[id];
      const n = rigCard?.hostedCreditsOnRunEventPlay;
      if (!n) continue;
      rigCard.hostedCredits = (rigCard.hostedCredits ?? 0) + n;
      log(
        state,
        `${rigCard.title} — place ${n}¢ (run event played) → ${rigCard.hostedCredits}.`,
      );
    }
  }
  // Rolling Brownout: first Runner event each turn → Corp gains credits.
  if (state.turn.eventsPlayedThisTurn === 0) {
    for (const cid of Object.values(state.cards)) {
      if (cid.zone !== "corp:play-area") continue;
      const n = cid.corpGainsCreditsOnFirstRunnerEventEachTurn ?? 0;
      if (n <= 0) continue;
      state.corp.credits += n;
      log(
        state,
        `${cid.title} — gain ${n}¢ (first Runner event this turn) → ${state.corp.credits}¢.`,
      );
    }
  }
  // Touchstone-class: first event each turn places hosted credits.
  if (state.turn.eventsPlayedThisTurn === 0) {
    for (const id of state.runner.rig) {
      const rigCard = state.cards[id];
      const n = rigCard?.hostedCreditsOnFirstEventPlayOncePerTurn;
      if (!n) continue;
      rigCard.hostedCredits = (rigCard.hostedCredits ?? 0) + n;
      log(
        state,
        `${rigCard.title} — place ${n}¢ (first event this turn) → ${rigCard.hostedCredits}.`,
      );
    }
  }
  state.turn.eventsPlayedThisTurn += 1;
  if (card.runEvent) {
    if (!serverId) {
      if (!card.runEventOptional) {
        return fail("Run event requires a target server.", [CR.playEvent]);
      }
      // Optional run declined: resolve onPlay only (Reprise).
      if (card.onPlay) {
        const r = evalEffect({ state, sourceId: cardId }, card.onPlay);
        if (!r.ok) return fail(r.error, r.cites);
      }
      if (card.endsActionPhase) {
        state.runner.clicks = 0;
        log(
          state,
          `${card.title} is terminal — end the action phase (CR ${CR.playEvent.number}).`,
        );
      }
      if (state.pendingChoice) {
        state.deferAfterBasicAction = true;
        return ok(state);
      }
      afterBasicAction(state);
      return ok(state);
    }
    if (!isServerAllowedForSpec(state, card.runEvent, serverId)) {
      return fail("Illegal run target for this event.", [CR.playEvent]);
    }
    if (card.onPlay) {
      const r = evalEffect({ state, sourceId: cardId }, card.onPlay);
      if (!r.ok) return fail(r.error, r.cites);
      if (state.pendingChoice) {
        state.pendingRunEventStart = { sourceId: cardId, serverId };
        return ok(state);
      }
    }
    if (card.endsActionPhase) {
      state.runner.clicks = 0;
      log(
        state,
        `${card.title} is terminal — end the action phase (CR ${CR.playEvent.number}).`,
      );
    }
    const mods = modifiersFromStartsRun(state, card.runEvent, cardId);
    // Concerto: hosted credits on the played event become run eventCredits.
    const hosted = card.hostedCredits ?? 0;
    if (hosted > 0) {
      mods.eventCredits = (mods.eventCredits ?? 0) + hosted;
      card.hostedCredits = 0;
    }
    const walked = startRun(state, serverId, mods);
    if (!walked.ok) {
      state.run = null;
      return walked;
    }
    finishRunReturnToAction(walked.state);
    return walked;
  }
  if (card.onPlay) {
    const r = evalEffect({ state, sourceId: cardId }, card.onPlay);
    if (!r.ok) return fail(r.error, r.cites);
  }
  if (card.endsActionPhase) {
    state.runner.clicks = 0;
    log(
      state,
      `${card.title} is terminal — end the action phase (CR ${CR.playEvent.number}).`,
    );
  }
  if (card.remainderOfTurnOnInstallPrintedCostGte) {
    if (!state.turn.remainderOfTurnOnInstallPrintedCostGte) {
      state.turn.remainderOfTurnOnInstallPrintedCostGte = [];
    }
    state.turn.remainderOfTurnOnInstallPrintedCostGte.push({
      min: card.remainderOfTurnOnInstallPrintedCostGte.min,
      effect: structuredClone(card.remainderOfTurnOnInstallPrintedCostGte.effect),
      sourceId: cardId,
    });
    log(
      state,
      `${card.title} — for the remainder of this turn, on install with printed cost ≥ ${card.remainderOfTurnOnInstallPrintedCostGte.min}¢, draw 1 or gain 1¢.`,
    );
  }
  if (state.pendingStartRunOnMark) {
    const mark = state.markServerId;
    const runSrc = state.pendingStartRunOnMark.sourceId;
    state.pendingStartRunOnMark = null;
    if (mark && state.servers[mark]) {
      const walked = startRun(state, mark, { runSourceId: runSrc });
      if (!walked.ok) return walked;
      finishRunReturnToAction(walked.state);
      return walked;
    }
  }
  if (state.pendingChoice) {
    state.deferAfterBasicAction = true;
    return ok(state);
  }
  afterBasicAction(state);
  return ok(state);
}

