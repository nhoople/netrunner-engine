/**
 * Playing an operation or an event, including the Patchwork discount.
 */
import { log } from "../state/createGame.js";
import { abilitiesSuppressed } from "../state/abilities.js";
import {
  evalEffect,
  fireGrayBlackOpsTrashedHooks,
  fireOnAfterOperationOrExpendable,
} from "../effects/eval.js";
import { fireOnPlay } from "../state/cardLifecycleHooks.js";
import { fireCorpIdentityFlippedFirstOperationPlay } from "../state/identityFlipHooks.js";
import { onRunnerEventPlayed } from "../state/cardDeclarations.js";
import {
  fireSiAfterCorpRezOrPlay,
  fireSiAfterPaidAbilityClicks,
} from "../effects/mumbadSiPrimitives.js";
import { occurCheckpoint, withCostCheckpoint } from "../legality/checkpoints.js";
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
import { forfeitSpecificAgenda } from "./rez.js";
import { hasActiveLockdown } from "../state/lockdowns.js";
import { effectiveRunnerTags, runnerIsTagged } from "../state/tags.js";
import { noteCorpActionType } from "../state/corpActionHooks.js";
import {
  moveRunnerCardToHeap,
  noteCorpCardAddedToArchives,
} from "../state/trashHooks.js";
import { agendaPointsFor } from "../state/scoring.js";
import {
  enterLingeringPlayArea,
  leaveLingeringPlayAreaBag,
} from "../state/zones.js";
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

/** Patchwork-class: installed unblanked play/install discount amount. */
export function patchworkDiscountSource(
  state: GameState,
): { id: string; amount: number } | null {
  for (const id of state.runner.installed) {
    if (abilitiesSuppressed(state, id)) continue;
    const n = state.cards[id]?.playOrInstallDiscountByTrashingGripOncePerTurn;
    if (n) return { id, amount: n };
  }
  return null;
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
  const pw = patchworkDiscountSource(state);
  const amount = pw?.amount ?? 0;
  const hwId = pw?.id;
  if (!amount || !hwId) {
    return { ok: false, error: "No Patchwork-class discount installed." };
  }
  const idx = state.runner.hand.indexOf(trashGripCardId);
  if (idx < 0) {
    return { ok: false, error: "Patchwork trash target not in grip." };
  }
  state.runner.hand.splice(idx, 1);
  const trashed = state.cards[trashGripCardId]!;
  state.runner.discardPile.push(trashGripCardId);
  trashed.zone = "runner:heap";
  trashed.faceup = true;
  state.turn.patchworkDiscountUsedThisTurn = true;
  log(
    state,
    `${state.cards[hwId]!.title} — trash ${trashed.title} from grip for −${amount}¢ (CR ${CR.modifiableValueCost.number}).`,
  );
  return { ok: true, discount: amount };
}

/** CR 8.6.7e / 9.11.1d: checkpoint after the card is played, before its play abilities. */
function notePlayCheckpoint(state: GameState, openedBy: string): void {
  occurCheckpoint(
    state,
    "play",
    "Play checkpoint",
    [CR.playCheckpoint, CR.playPause],
    openedBy,
  );
}

/** CR 8.6.7f. The card's play abilities resolve after the play checkpoint. */
function noteResolvePlayAbilities(state: GameState, cardId: string): void {
  const card = state.cards[cardId];
  if (!card) return;
  log(
    state,
    `Resolve play abilities of ${card.title} (CR ${CR.playAbilities.number}).`,
  );
}

/** CR 8.6.7a. The played operation enters the play area before its play cost. */
function placeOperationInPlayArea(state: GameState, cardId: string): void {
  const card = state.cards[cardId];
  if (!card) return;
  const handIdx = state.corp.hand.indexOf(cardId);
  if (handIdx >= 0) state.corp.hand.splice(handIdx, 1);
  enterLingeringPlayArea(state, cardId, "corp");
  log(
    state,
    `${card.title} placed faceup in the play area, not installed (CR ${CR.playPlace.number}).`,
  );
}

/** CR 8.6.7c. The played card becomes active after the cost checkpoint. */
function notePlayedCardBecomesActive(state: GameState, cardId: string): void {
  const card = state.cards[cardId];
  if (!card) return;
  log(
    state,
    `${card.title} becomes active, not installed (CR ${CR.playActive.number}).`,
  );
}

/** CR 8.6.7d. Report when no played condition is waiting on this operation. */
function noteQuietPlayedOperationConditions(state: GameState, cardId: string): void {
  const card = state.cards[cardId];
  if (!card) return;
  if ((card.subtypes ?? []).includes("transaction")) {
    const bonus =
      state.cards[state.corp.identityId]?.gainCreditOnTransactionPlayed ?? 0;
    if (bonus > 0) return;
  }
  log(
    state,
    `Played conditions checked (CR ${CR.playPlayedCondition.number}); none met.`,
  );
}

/** CR 8.6.7d. Report when no played condition is waiting on this event. */
function noteQuietPlayedEventConditions(state: GameState, cardId: string): void {
  const card = state.cards[cardId];
  if (!card || !eventPlayedConditionsAreQuiet(state, card)) return;
  log(
    state,
    `Played conditions checked (CR ${CR.playPlayedCondition.number}); none met.`,
  );
}

function eventPlayedConditionsAreQuiet(
  state: GameState,
  card: NonNullable<GameState["cards"][string]>,
): boolean {
  if ((card.subtypes ?? []).includes("run")) {
    const idCard = state.cards[state.runner.identityId];
    if (
      (idCard?.gainCreditOnFirstRunEvent ?? 0) > 0 &&
      state.turn.runEventsPlayedThisTurn === 0 &&
      !abilitiesSuppressed(state, state.runner.identityId)
    ) {
      return false;
    }
    if (state.turn.runEventsPlayedThisTurn === 0) {
      for (const rid of state.runner.installed) {
        if (abilitiesSuppressed(state, rid)) continue;
        if (state.cards[rid]?.gainClickOnFirstRunEventThisTurn) return false;
      }
    }
    for (const id of state.runner.installed) {
      if (abilitiesSuppressed(state, id)) continue;
      if (state.cards[id]?.hostedCreditsOnRunEventPlay) return false;
    }
  }
  if (state.turn.eventsPlayedThisTurn === 0) {
    for (const other of Object.values(state.cards)) {
      if (other.zone !== "corp:play-area") continue;
      if (abilitiesSuppressed(state, other.id)) continue;
      if ((other.corpGainsCreditsOnFirstRunnerEventEachTurn ?? 0) > 0) return false;
    }
    for (const id of state.runner.installed) {
      if (abilitiesSuppressed(state, id)) continue;
      if (state.cards[id]?.hostedCreditsOnFirstEventPlayOncePerTurn) return false;
    }
  }
  return true;
}

/** CR 8.6.7a. The played event enters the play area before its play cost. */
function placeEventInPlayArea(
  state: GameState,
  cardId: string,
  blingHostId: string | null,
): void {
  const card = state.cards[cardId];
  if (!card) return;
  const handIdx = state.runner.hand.indexOf(cardId);
  if (handIdx >= 0) {
    state.runner.hand.splice(handIdx, 1);
  } else if (blingHostId) {
    const host = state.cards[blingHostId];
    if (host) {
      host.hostedCardIds = (host.hostedCardIds ?? []).filter((id) => id !== cardId);
    }
    card.hostId = undefined;
  }
  enterLingeringPlayArea(state, cardId, "runner");
  log(
    state,
    `${card.title} placed faceup in the play area, not installed (CR ${CR.playPlace.number}).`,
  );
}

/** CR 8.6.7g. A played operation that does not stay in play is trashed. */
function trashPlayedOperation(state: GameState, cardId: string): void {
  const card = state.cards[cardId];
  if (!card || card.zone !== "corp:play-area") return;
  const linger =
    Boolean(card.lingerUntilCorpNextTurnBegins) ||
    (card.subtypes ?? []).includes("lockdown");
  if (linger) {
    log(
      state,
      `${card.title} is not trashed; it remains in play until Corp's next turn begins (CR ${CR.playNotTrashedUntil.number}).`,
    );
    return;
  }
  if (card.lingerAsCurrent || card.rfgInsteadOfTrashing) return;
  leaveLingeringPlayAreaBag(state, cardId);
  state.corp.discardPile.push(cardId);
  card.zone = "corp:archives";
  card.faceup = true;
  noteCorpCardAddedToArchives(state);
  fireGrayBlackOpsTrashedHooks(state, cardId);
  log(state, `${card.title} trashed (CR ${CR.trashPlayedCard.number}).`);
}

/** CR 8.6.7h. Report when no after-resolve condition is waiting on this play. */
function noteQuietAfterOperationResolve(state: GameState, cardId: string): void {
  if (!operationAfterResolveIsQuiet(state, cardId)) return;
  log(
    state,
    `After-resolve conditions checked (CR ${CR.afterResolveCondition.number}); none met.`,
  );
}

/** CR 8.6.7i. The play procedure has finished. */
export function notePlayEffectComplete(state: GameState): void {
  log(
    state,
    `Play effect complete (CR ${CR.playComplete.number}).`,
  );
}

/** CR 8.6.7h. Report when no after-resolve condition is waiting on this event. */
function noteQuietAfterEventResolve(state: GameState): void {
  log(
    state,
    `After-resolve conditions checked (CR ${CR.afterResolveCondition.number}); none met.`,
  );
}

function operationAfterResolveIsQuiet(state: GameState, cardId: string): boolean {
  const played = state.cards[cardId];
  const idCard = state.cards[state.corp.identityId];
  if (idCard?.onAfterOperationOrExpendable) return false;
  if (!played) return true;
  const idFaction = idCard?.faction;
  for (const server of Object.values(state.servers)) {
    for (const rid of server.root) {
      const exchange = state.cards[rid];
      if (!exchange?.rezzed) continue;
      if (typeof exchange.onRezOrPlayOutOfFactionGainCredits !== "number") {
        continue;
      }
      const cardFaction = played.faction;
      const isSelf = cardId === rid;
      const isOutOfFaction =
        Boolean(idFaction) &&
        Boolean(cardFaction) &&
        cardFaction !== idFaction;
      if (isSelf || isOutOfFaction) return false;
    }
  }
  return true;
}

/** CR 8.6.7g. A played event that does not stay in play is trashed. */
function trashPlayedEvent(state: GameState, cardId: string): void {
  const card = state.cards[cardId];
  if (!card || card.lingerAsCurrent) return;
  if (card.hostId || card.zone.startsWith("hosted:")) {
    log(
      state,
      `${card.title} is not trashed; it is hosted (CR ${CR.playNoTrashHosted.number}).`,
    );
    return;
  }
  if (card.zone !== "runner:play-area") {
    log(
      state,
      `${card.title} is not trashed; it has left the play area (CR ${CR.playNoTrashLeftPlayArea.number}).`,
    );
    return;
  }
  moveRunnerCardToHeap(state, cardId);
  log(state, `${card.title} trashed (CR ${CR.trashPlayedCard.number}).`);
}

/** Finish a played event whose trash step waited on a choice. */
export function settleDeferredPlayedEvent(state: GameState): void {
  const cardId = state.pendingPlayedEventTrashId;
  if (!cardId || state.pendingChoice) return;
  state.pendingPlayedEventTrashId = null;
  const card = state.cards[cardId];
  trashPlayedEvent(state, cardId);
  noteQuietAfterEventResolve(state);
  if (card?.endsActionPhase) {
    state.runner.clicks = 0;
    log(
      state,
      `${card.title} is terminal — end the action phase (CR ${CR.playEvent.number}).`,
    );
  }
  if (card?.remainderOfTurnOnInstallPrintedCostGte) {
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
  if (state.pendingChoice) {
    state.pendingPlayedEventTrashId = cardId;
    return;
  }
  notePlayEffectComplete(state);
}

/** End the action phase after a terminal operation's play ability finishes (CR 9.7.1). */
export function settleDeferredTerminalOperation(state: GameState): void {
  const cardId = state.pendingTerminalOperationId;
  if (!cardId || state.pendingChoice) return;
  state.pendingTerminalOperationId = null;
  const card = state.cards[cardId];
  if (!card?.endsActionPhase) return;
  state.corp.clicks = 0;
  log(
    state,
    `${card.title} is terminal — end the action phase (CR ${CR.playAbility.number}).`,
  );
}

export function playOperation(
  state: GameState,
  cardId: string,
  opts?: { fromAbility?: boolean },
): ApplyResult {
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
    const hasAgenda = state.runner.scoreArea.some(
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
    const okTarget = state.runner.installed.some((id) => {
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
    if (state.runner.installed.length === 0) {
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
  const fromAbility = opts?.fromAbility === true;
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
  const basicClick = fromAbility ? 0 : 1;
  const clicksNeeded = basicClick + extraClick;
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
  if (card.playAdditionalCostForfeitAgenda) {
    const agendas = state.corp.scoreArea.filter(
      (id) => !state.cards[id]?.cannotForfeit,
    );
    if (agendas.length === 0) {
      return fail("Play requires forfeiting an agenda.", [CR.playOperation]);
    }
  }
  if (!fromAbility) {
    const bad = spendClick(state);
    if (bad) return bad;
  }
  if (extraClick > 0) {
    state.corp.clicks -= extraClick;
  }
  fireSiAfterPaidAbilityClicks(state, clicksNeeded);
  if (discount > 0) {
    state.turn.doubleOpClickDiscountUsedThisTurn = true;
    log(
      state,
      `First double operation click discount −${discount} (Synchrocyclotron-class).`,
    );
  }
  if (fromAbility) {
    log(
      state,
      `${card.title} is played separately (CR ${CR.playingOneAtATime.number}).`,
    );
  }
  placeOperationInPlayArea(state, cardId);
  if (card.playCostX) {
    const increase = operationAndEventPlayCostIncreaseTotal(state);
    const maxX = state.corp.credits - increase;
    if (maxX < 0) {
      return fail("Insufficient credits to play operation.", [CR.playOperation]);
    }
    if (maxX === 0) {
      return continuePlayedOperation(state, cardId, increase, 0);
    }
    state.pendingPlayCostXCardId = cardId;
    state.pendingChoice = {
      sourceId: cardId,
      chooser: "corp",
      options: Array.from({ length: maxX + 1 }, (_, x) => ({
        id: `play-cost-x:${x}`,
        label: `X = ${x}`,
        effect: {
          op: "do" as const,
          action: {
            kind: "gain_credits" as const,
            side: "corp" as const,
            amount: 0,
          },
        },
      })),
    };
    return ok(state);
  }
  if (card.playAdditionalCostForfeitAgenda) {
    const agendas = state.corp.scoreArea.filter(
      (id) => !state.cards[id]?.cannotForfeit,
    );
    if (agendas.length > 1) {
      state.pendingChoice = {
        sourceId: cardId,
        chooser: "corp",
        options: agendas.map((id) => ({
          id: `forfeit-agenda:${id}`,
          label: `Forfeit ${state.cards[id]!.title}`,
          effect: {
            op: "do" as const,
            action: {
              kind: "gain_credits" as const,
              side: "corp" as const,
              amount: 0,
            },
          },
        })),
      };
      log(state, `${card.title} — choose an agenda to forfeit.`);
      return ok(state);
    }
    forfeitSpecificAgenda(state, agendas[0]!);
  }
  return continuePlayedOperation(state, cardId, cost);
}

/** Finish an operation after its play cost, including a chosen X (CR 8.6.2a). */
export function continuePlayedOperation(
  state: GameState,
  cardId: string,
  paidCredits: number,
  chosenX?: number,
): ApplyResult {
  const card = state.cards[cardId];
  if (!card) return fail("Not an operation.", [CR.playOperation]);
  if (chosenX !== undefined) {
    state.turn.lastPlayCostX = chosenX;
    log(state, `X chosen as ${chosenX} (CR ${CR.playCostX.number}).`);
  }
  withCostCheckpoint(state, "play_operation", () => {
    state.corp.credits -= paidCredits;
    log(
      state,
      `Play cost of ${paidCredits}¢ paid (CR ${CR.playCostStep.number}).`,
    );
  });
  notePlayedCardBecomesActive(state, cardId);
  state.turn.operationPaidWindowOpen = true;
  noteQuietPlayedOperationConditions(state, cardId);
  if (card.lingerAsCurrent) {
    placeCurrentAfterPlay(state, cardId, "corp");
  } else if (card.rfgInsteadOfTrashing) {
    card.zone = "removed-from-game";
    card.faceup = true;
    if (!state.removedFromGame) state.removedFromGame = [];
    if (!state.removedFromGame.includes(cardId)) {
      state.removedFromGame.push(cardId);
    }
    log(state, `${card.title} is removed from the game instead of trashing.`);
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
      `Corp plays ${card.title} for ${paidCredits}¢ (CR ${CR.playOperation.number}).`,
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
    notePlayCheckpoint(state, "play_operation");
    noteResolvePlayAbilities(state, cardId);
    if (card.onPlay) {
      if (isFirstSubliminal) {
        fireOnPlay(state, cardId);
      } else {
        const r = evalEffect(
          { state, sourceId: cardId },
          {
            op: "do",
            action: {
              kind: "gain_credits",
              side: "corp",
              amount: 1,
            },
          },
        );
        if (!r.ok) return fail(r.error, r.cites);
      }
    }
    trashPlayedOperation(state, cardId);
    noteQuietAfterOperationResolve(state, cardId);
    noteCorpActionType(state, "play_operation");
    fireCorpIdentityFlippedFirstOperationPlay(state);
    notePlayEffectComplete(state);
    afterBasicAction(state);
    return ok(state);
  }
  log(
    state,
    `Corp plays ${card.title} for ${paidCredits}¢ (CR ${CR.playOperation.number}).`,
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
  notePlayCheckpoint(state, "play_operation");
  noteResolvePlayAbilities(state, cardId);
  fireOnPlay(state, cardId);
  trashPlayedOperation(state, cardId);
  noteQuietAfterOperationResolve(state, cardId);
  fireSiAfterCorpRezOrPlay(state, cardId);
  if (state.pendingChoice && card.endsActionPhase) {
    state.pendingTerminalOperationId = cardId;
    state.deferAfterBasicAction = true;
    return ok(state);
  }
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
  notePlayEffectComplete(state);
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
    card.playOnlyIfRunnerStoleAgendaLastTurn &&
    (state.turn.agendaPointsStolenLastTurn ?? 0) <= 0
  ) {
    return fail("Play requires the Runner stole an agenda last turn.", [CR.playEvent]);
  }
  if (card.playRequiresInstalledSubtype) {
    const need = card.playRequiresInstalledSubtype.toLowerCase();
    const has = state.runner.installed.some((id) =>
      (state.cards[id]?.subtypes ?? []).some((sub) => sub.toLowerCase() === need),
    );
    if (!has) {
      return fail(`Play requires an installed ${card.playRequiresInstalledSubtype}.`, [
        CR.playEvent,
      ]);
    }
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
    !state.runner.installed.some((id) => state.cards[id]?.type === "resource")
  ) {
    return fail("Play requires an installed resource.", [CR.playEvent]);
  }
  if (
    card.playRequiresInstalledProgram &&
    !state.runner.installed.some((id) => state.cards[id]?.type === "program")
  ) {
    return fail("Play requires an installed program.", [CR.playEvent]);
  }
  if (
    card.playRequiresInstalledProgramOrHardware &&
    !state.runner.installed.some((id) => {
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
    for (const rid of state.runner.installed) {
      if (abilitiesSuppressed(state, rid)) continue;
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
  if (card.briberyPlayCostX && state.turn.briberyCardId !== cardId) {
    const maxX = state.runner.credits;
    state.pendingChoice = {
      sourceId: cardId,
      chooser: "runner",
      options: Array.from({ length: maxX + 1 }, (_, x) => ({
        id: `bribery-x:${x}`,
        label: `X = ${x}`,
        effect: { op: "do" as const, action: { kind: "gain_credits" as const, side: "runner" as const, amount: 0 } },
      })),
    };
    return ok(state);
  }
  state.turn.playingEventId = cardId;
  state.turn.clicksWhenEventPlayBegan = state.runner.clicks;
  const printedCost = card.briberyPlayCostX ? (state.turn.briberyX ?? 0) : card.playCost;
  const cost = effectiveEventPlayCost(state, printedCost, card);
  if (runnerCreditsFor(state, "play_event") < cost) {
    state.turn.patchworkPendingDiscountThisAction = 0;
    return fail("Insufficient credits to play event.", [
      CR.playEvent,
      CR.costCalculation,
      CR.eventPlayCost,
    ]);
  }
  if (state.turn.cometFreeEvent) {
    state.turn.cometFreeEvent = false;
  } else {
    const bad = spendClick(state);
    if (bad) {
      state.turn.patchworkPendingDiscountThisAction = 0;
      return bad;
    }
  }
  if (extraClick > 0) {
    state.runner.clicks -= extraClick;
  }
  placeEventInPlayArea(state, cardId, blingHostId);
  withCostCheckpoint(state, "play_event", () => {
    spendRunnerCreditsFor(state, cost, "play_event");
    log(
      state,
      `Play cost of ${cost}¢ paid (CR ${CR.playCostStep.number}).`,
    );
  });
  state.turn.patchworkPendingDiscountThisAction = 0;
  notePlayedCardBecomesActive(state, cardId);
  onRunnerEventPlayed(state, cardId);
  noteQuietPlayedEventConditions(state, cardId);
  if (card.lingerAsCurrent) {
    placeCurrentAfterPlay(state, cardId, "runner");
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
    if (
      bonus > 0 &&
      state.turn.runEventsPlayedThisTurn === 0 &&
      !abilitiesSuppressed(state, state.runner.identityId)
    ) {
      state.runner.credits += bonus;
      log(
        state,
        `${idCard!.title} — gain ${bonus}¢ (first run event this turn).`,
      );
    }
    if (state.turn.runEventsPlayedThisTurn === 0) {
      for (const rid of state.runner.installed) {
        if (abilitiesSuppressed(state, rid)) continue;
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
    for (const id of state.runner.installed) {
      if (abilitiesSuppressed(state, id)) continue;
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
      if (abilitiesSuppressed(state, cid.id)) continue;
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
    for (const id of state.runner.installed) {
      if (abilitiesSuppressed(state, id)) continue;
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
      notePlayCheckpoint(state, "play_event");
      fireOnPlay(state, cardId);
      trashPlayedEvent(state, cardId);
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
    notePlayCheckpoint(state, "play_event");
    if (card.onPlay) {
      fireOnPlay(state, cardId);
      state.turn.clicksWhenEventPlayBegan = undefined;
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
    state.playedRunEventId = cardId;
    log(
      state,
      `${card.title} remains in the play area for this run (CR ${CR.playingTimingStructure.number}).`,
    );
    const walked = startRun(state, serverId, mods);
    if (!walked.ok) {
      state.run = null;
      return walked;
    }
    finishRunReturnToAction(walked.state);
    return walked;
  }
  notePlayCheckpoint(state, "play_event");
  noteResolvePlayAbilities(state, cardId);
  if (card.onPlay) {
    fireOnPlay(state, cardId);
    state.turn.clicksWhenEventPlayBegan = undefined;
  }
  if (state.pendingChoice) {
    state.pendingPlayedEventTrashId = cardId;
    state.deferAfterBasicAction = true;
    return ok(state);
  }
  trashPlayedEvent(state, cardId);
  noteQuietAfterEventResolve(state);
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
  notePlayEffectComplete(state);
  afterBasicAction(state);
  return ok(state);
}

