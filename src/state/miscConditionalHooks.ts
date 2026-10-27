/**
 * Remaining card-field conditionals outside run-timing / lifecycle
 * helpers — marked onto the pending bag (CR 9.6.2).
 */
import type { GameState, Side, StoredConditionalEffectKey } from "./types.js";
import {
  fireCardConditional,
  fireStoredConditionals,
  type StoredConditionalMark,
} from "./storedTriggers.js";

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

export function fireOnFirstRevealEachTurn(
  state: GameState,
  cardId: string,
): boolean {
  return fire(
    state,
    cardId,
    "onFirstRevealEachTurn",
    "on-first-reveal-each-turn",
    "first reveal this turn",
  );
}

export function fireOnFirstTagThisTurn(
  state: GameState,
  cardId: string,
): boolean {
  return fire(
    state,
    cardId,
    "onFirstTagThisTurn",
    "on-first-tag-this-turn",
    "first tag this turn",
  );
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

export function fireOnAgendaScoredOrStolen(
  state: GameState,
  sourceIds: string[],
): boolean {
  const items: StoredConditionalMark[] = [];
  for (const id of sourceIds) {
    const card = state.cards[id];
    if (!card?.onAgendaScoredOrStolen) continue;
    items.push({
      abilityKey: "on-agenda-scored-or-stolen",
      sourceId: id,
      controller: card.side === "corp" ? "corp" : "runner",
      mandatory: true,
      effectKey: "onAgendaScoredOrStolen",
      logLine: `${card.title} becomes pending — agenda scored or stolen.`,
    });
  }
  return fireStoredConditionals(state, items);
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
  return fireStoredConditionals(state, items);
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
