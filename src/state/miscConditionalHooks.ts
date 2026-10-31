/**
 * Remaining card-field conditionals outside run-timing / lifecycle
 * helpers — marked onto the pending bag (CR 9.6.2).
 */
import type { GameState, Side, StoredConditionalEffectKey } from "./types.js";
import { abilitiesSuppressed } from "./abilities.js";
import {
  fireCardConditional,
  type StoredConditionalMark,
} from "./storedTriggers.js";
import {
  noteStoredConditional,
  noteStoredConditionals,
} from "./storedConditionalHooks.js";
import { checkpointAfterInstruction } from "../legality/checkpoints.js";

function fire(
  state: GameState,
  sourceId: string,
  effectKey: StoredConditionalEffectKey,
  abilityKey: string,
  logSuffix: string,
  controller?: Side,
): boolean {
  const card = state.cards[sourceId];
  if (!card) return false;
  return fireCardConditional(
    state,
    sourceId,
    effectKey,
    abilityKey,
    `${card.title} becomes pending — ${logSuffix}.`,
    controller,
  );
}

export function fireOnInstallFromNonHq(
  state: GameState,
  cardId: string,
): boolean {
  return fire(
    state,
    cardId,
    "onInstallFromNonHq",
    "on-install-from-non-hq",
    "installed from outside HQ",
    "corp",
  );
}

export function fireOnInstallProgramFromHeap(
  state: GameState,
  identityId: string,
): boolean {
  return fire(
    state,
    identityId,
    "onInstallProgramFromHeap",
    "on-install-program-from-heap",
    "program installed from heap",
  );
}

export function fireOnInstallWithoutSpendingCredits(
  state: GameState,
  cardId: string,
): boolean {
  return fire(
    state,
    cardId,
    "onInstallWithoutSpendingCredits",
    "on-install-without-spending-credits",
    "install without spending credits",
  );
}

export function fireOnFullyBreakOncePerTurn(
  state: GameState,
  cardId: string,
): boolean {
  return fire(
    state,
    cardId,
    "onFullyBreakOncePerTurn",
    "on-fully-break-once-per-turn",
    "ice fully broken (once per turn)",
  );
}

export function fireOnFullyBreakProtectingIce(
  state: GameState,
  cardId: string,
): boolean {
  return fire(
    state,
    cardId,
    "onFullyBreakProtectingIce",
    "on-fully-break-protecting-ice",
    "protecting ice fully broken",
    "corp",
  );
}

export function fireOnHostFullyBrokenThisEncounter(
  state: GameState,
  cardId: string,
): boolean {
  return fire(
    state,
    cardId,
    "onHostFullyBrokenThisEncounter",
    "on-host-fully-broken-this-encounter",
    "host ice fully broken this encounter",
  );
}

export function fireOnFirstIceRezEachTurn(
  state: GameState,
  cardId: string,
): boolean {
  const card = state.cards[cardId];
  return fire(
    state,
    cardId,
    "onFirstIceRezEachTurn",
    "on-first-ice-rez-each-turn",
    "first ice rezzed this turn",
    card?.side === "corp" ? "corp" : "runner",
  );
}

export function fireOnFirstRemoteInstallThisTurn(
  state: GameState,
  cardId: string,
): boolean {
  return fire(
    state,
    cardId,
    "onFirstRemoteInstallThisTurn",
    "on-first-remote-install-this-turn",
    "first remote install this turn",
    "corp",
  );
}

/**
 * Hyoubu Institute: first reveal this turn. Records the condition for the
 * next 10.3.1a scanner pass (phase 3). Does not mark pending here.
 * `cardId` is accepted for call-site compatibility; the scanner reads the
 * Corp identity.
 */
export function fireOnFirstRevealEachTurn(
  state: GameState,
  cardId: string,
): boolean {
  void cardId;
  noteFirstRevealThisTurn(state);
  return false;
}

/** Record that the first reveal of the turn happened (phase 3 MetPending). */
export function noteFirstRevealThisTurn(state: GameState): void {
  if (state.turn.firstRevealCreditUsedThisTurn) return;
  if (state.turn.firstRevealMetPending) return;
  const idCard = state.cards[state.corp.identityId];
  if (!idCard?.onFirstRevealEachTurn) return;
  if (abilitiesSuppressed(state, idCard.id)) return;
  state.turn.firstRevealMetPending = true;
}

/**
 * NBN: Reality Plus — first tag(s) given this turn. Records the condition for
 * the next 10.3.1a scanner pass (phase 3). Does not mark pending here.
 * `cardId` is accepted for call-site compatibility; the scanner reads the
 * Corp identity.
 */
export function fireOnFirstTagThisTurn(
  state: GameState,
  cardId: string,
): boolean {
  void cardId;
  noteFirstTagThisTurn(state);
  return false;
}

/** Record that the first tag(s) of the turn were given (phase 3 MetPending). */
export function noteFirstTagThisTurn(state: GameState): void {
  if (state.turn.firstTagThisTurnUsedThisTurn) return;
  if (state.turn.firstTagThisTurnMetPending) return;
  const idCard = state.cards[state.corp.identityId];
  if (!idCard?.onFirstTagThisTurn) return;
  if (abilitiesSuppressed(state, idCard.id)) return;
  state.turn.firstTagThisTurnMetPending = true;
}

export function fireOnGrayOrBlackOpsTrashedAfterResolve(
  state: GameState,
  cardId: string,
): boolean {
  return fire(
    state,
    cardId,
    "onGrayOrBlackOpsTrashedAfterResolve",
    "on-gray-or-black-ops-trashed-after-resolve",
    "gray/black ops trashed after resolve",
  );
}

export function fireOnAfterOperationOrExpendable(
  state: GameState,
  cardId: string,
): boolean {
  return fire(
    state,
    cardId,
    "onAfterOperationOrExpendable",
    "on-after-operation-or-expendable",
    "operation or expendable resolved",
    "corp",
  );
}

export function fireOnCreditsGainedFromAgendaOrOperationAbility(
  state: GameState,
  cardId: string,
): boolean {
  return fire(
    state,
    cardId,
    "onCreditsGainedFromAgendaOrOperationAbility",
    "on-credits-gained-from-agenda-or-operation-ability",
    "credits gained from agenda or operation ability",
    "corp",
  );
}

export function fireOnAccessFaceupInstalledAgenda(
  state: GameState,
  cardId: string,
): boolean {
  return fire(
    state,
    cardId,
    "onAccessFaceupInstalledAgenda",
    "on-access-faceup-installed-agenda",
    "faceup installed agenda accessed",
    "corp",
  );
}

export function fireOnCorpBasicClickForCreditOrDraw(
  state: GameState,
  cardId: string,
): boolean {
  return fire(
    state,
    cardId,
    "onCorpBasicClickForCreditOrDraw",
    "on-corp-basic-click-for-credit-or-draw",
    "Corp basic click for credit or draw",
  );
}

/** Note onAgendaScoredOrStolen for 10.3.1a (phase 3). Returns true if any noted. */
export function fireOnAgendaScoredOrStolen(
  state: GameState,
  sourceIds: string[],
): boolean {
  let noted = false;
  for (const id of sourceIds) {
    const card = state.cards[id];
    if (!card?.onAgendaScoredOrStolen) continue;
    noteStoredConditional(state, {
      cardId: id,
      abilityKey: "on-agenda-scored-or-stolen",
      effectKey: "onAgendaScoredOrStolen",
      controller: card.side === "corp" ? "corp" : "runner",
      mandatory: true,
      logLine: `${card.title} becomes pending — agenda scored or stolen.`,
    });
    noted = true;
  }
  return noted;
}

export function fireOnAgendaScoredFromThisServer(
  state: GameState,
  cardId: string,
): boolean {
  return fire(
    state,
    cardId,
    "onAgendaScoredFromThisServer",
    "on-agenda-scored-from-this-server",
    "agenda scored from this server",
    "corp",
  );
}

export function fireOnAgendaAccessedOrScored(
  state: GameState,
  cardId: string,
): boolean {
  return fire(
    state,
    cardId,
    "onAgendaAccessedOrScored",
    "on-agenda-accessed-or-scored",
    "agenda accessed or scored",
    "corp",
  );
}

export function fireOnDiscardPhaseEnd(
  state: GameState,
  sourceIds: string[],
): boolean {
  const items: StoredConditionalMark[] = [];
  for (const id of sourceIds) {
    const card = state.cards[id];
    if (!card?.onDiscardPhaseEnd) continue;
    items.push({
      abilityKey: "on-discard-phase-end",
      sourceId: id,
      controller: card.side === "corp" ? "corp" : "runner",
      mandatory: true,
      effectKey: "onDiscardPhaseEnd",
      logLine: `${card.title} becomes pending — discard phase ends.`,
    });
  }
  noteStoredConditionals(state, items);
  if ((state.turn.storedConditionalPending ?? []).length === 0) return false;
  checkpointAfterInstruction(state, "phase.discardEnd");
  return Boolean(
    state.pendingChoice ||
      state.pendingTags ||
      state.pendingDamage ||
      state.psi ||
      state.trace ||
      state.done,
  );
}

export function fireOnRunnerDiscardOverMaxHand(
  state: GameState,
  cardId: string,
): boolean {
  return fire(
    state,
    cardId,
    "onRunnerDiscardOverMaxHand",
    "on-runner-discard-over-max-hand",
    "Runner discarded over max hand size",
  );
}

export function fireOnRunnerDiscardPhaseEndFlipped(
  state: GameState,
  cardId: string,
): boolean {
  const card = state.cards[cardId];
  if (!card?.identityFlippedHooks?.onRunnerDiscardPhaseEnd) return false;
  return fireCardConditional(
    state,
    cardId,
    "identityFlippedHooks.onRunnerDiscardPhaseEnd",
    "on-runner-discard-phase-end-flipped",
    `${card.title} becomes pending — Runner discard phase ends (flipped).`,
    "corp",
  );
}

export function fireOnRezzedCardTrashed(
  state: GameState,
  cardId: string,
): boolean {
  return fire(
    state,
    cardId,
    "onRezzedCardTrashed",
    "on-rezzed-card-trashed",
    "rezzed card trashed",
    "corp",
  );
}

export function fireOnRunnerTrashFromThisServerRootOrProtecting(
  state: GameState,
  cardId: string,
): boolean {
  return fire(
    state,
    cardId,
    "onRunnerTrashFromThisServerRootOrProtecting",
    "on-runner-trash-from-this-server-root-or-protecting",
    "Runner trashed from this server root or protecting ice",
    "corp",
  );
}

export function fireOnRunDeclaredOnThisServerIfTagged(
  state: GameState,
  cardId: string,
): boolean {
  return fire(
    state,
    cardId,
    "onRunDeclaredOnThisServerIfTagged",
    "on-run-declared-on-this-server-if-tagged",
    "run declared on this server while tagged",
    "corp",
  );
}

export function fireOnSpendCreditsOutsidePoolDuringRunOncePerTurn(
  state: GameState,
  cardId: string,
): boolean {
  return fire(
    state,
    cardId,
    "onSpendCreditsOutsidePoolDuringRunOncePerTurn",
    "on-spend-credits-outside-pool-during-run-once-per-turn",
    "spent credits outside the pool during a run",
  );
}

export function fireOnSuccessfulTraceDuringRun(
  state: GameState,
  cardId: string,
): boolean {
  return fire(
    state,
    cardId,
    "onSuccessfulTraceDuringRun",
    "on-successful-trace-during-run",
    "successful trace during the run",
  );
}

export function fireOnWouldDrawOncePerTurn(
  state: GameState,
  cardId: string,
): boolean {
  return fire(
    state,
    cardId,
    "onWouldDrawOncePerTurn",
    "on-would-draw-once-per-turn",
    "would draw (once per turn)",
  );
}

export function fireOnPowerCountersEmpty(
  state: GameState,
  cardId: string,
): boolean {
  return fire(
    state,
    cardId,
    "onPowerCountersEmpty",
    "on-power-counters-empty",
    "power counters empty",
  );
}

export function fireAfterMandatoryDraw(
  state: GameState,
  cardId: string,
): boolean {
  return fire(
    state,
    cardId,
    "afterMandatoryDraw",
    "after-mandatory-draw",
    "after mandatory draw",
    "corp",
  );
}

export function fireOnBeforeFirstTurn(
  state: GameState,
  cardId: string,
): boolean {
  return fire(
    state,
    cardId,
    "onBeforeFirstTurn",
    "on-before-first-turn",
    "before first turn",
    "corp",
  );
}

export function fireOnFirstHardwareUseDuringRunEachTurn(
  state: GameState,
  cardId: string,
): boolean {
  return fire(
    state,
    cardId,
    "onFirstHardwareUseDuringRunEachTurn",
    "on-first-hardware-use-during-run-each-turn",
    "first hardware use during a run this turn",
  );
}

export function fireOnFirstResourcePaidAbilityEachTurn(
  state: GameState,
  cardId: string,
): boolean {
  return fire(
    state,
    cardId,
    "onFirstResourcePaidAbilityEachTurn",
    "on-first-resource-paid-ability-each-turn",
    "first resource paid ability this turn",
  );
}

export function fireOnFlipToBackIfRunMatchesFace(
  state: GameState,
  cardId: string,
): boolean {
  const card = state.cards[cardId];
  if (!card?.identityFlippedHooks?.onFlipToBackIfRunMatchesFace) return false;
  return fireCardConditional(
    state,
    cardId,
    "identityFlippedHooks.onFlipToBackIfRunMatchesFace",
    "on-flip-to-back-if-run-matches-face",
    `${card.title} becomes pending — flipped to back while run matches face.`,
    "corp",
  );
}

export function fireOnCorpAbilityCausesRunnerSpendOrLoseCreditsDuringRun(
  state: GameState,
  cardId: string,
): boolean {
  return fire(
    state,
    cardId,
    "onCorpAbilityCausesRunnerSpendOrLoseCreditsDuringRun",
    "on-corp-ability-causes-runner-spend-or-lose-credits-during-run",
    "Corp ability caused Runner to spend or lose credits during a run",
    "corp",
  );
}

export function fireOnArchivesFacedownTurnedFaceupGte(
  state: GameState,
  cardId: string,
): boolean {
  return fire(
    state,
    cardId,
    "onArchivesFacedownTurnedFaceupGte",
    "on-archives-facedown-turned-faceup-gte",
    "Archives facedown cards turned faceup",
  );
}
