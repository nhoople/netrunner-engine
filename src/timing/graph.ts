import type {
  Action,
  GameState,
  TimingCursor,
  TurnPhase,
} from "../state/types.js";
import { abilitiesSuppressed } from "../state/abilities.js";
import { runnerAbilityCarrierIds } from "../state/fenris.js";
import { refillRecurringCredits, canPayCost, stealthHostedCreditsAvailable, runnerAvailableCredits } from "../state/costs.js";
import { evalEffect, fireOnBypassTriggers, fireHostRezStateTriggers } from "../effects/eval.js";
import { syncSubroutinesFromRecords } from "../effects/abilityRecord.js";
import { trashCorpCardToArchives } from "../effects/corpTrash.js";
import type { Effect } from "../effects/ir.js";
import {
  armNestedBreachIfPending,
  beginBreachAccess,
  refreshRdDeckCandidate,
} from "../state/access.js";
import { syncNextSubtypeEtrSubs } from "../state/powerCounters.js";
import { syncCorpHandSizeSubroutines } from "../state/handSizeSubroutines.js";
import { getCardDef } from "../cards/load.js";
import {
  collectAdvancementGainedSubs,
  collectBlockchainArchivesSubs,
  collectBrainstormGripSubs,
  collectFatumaGainedSubs,
  collectHostedConditionSubsBeforePrinted,
  collectNextOpalSubs,
  collectSubBoostEtrSubs,
  collectTourGuideEtrSubs,
  collectWinchesterHqSubs,
  applyContinuousGainedSubs,
} from "../state/continuousSubs.js";
import { resolveIceSubtypes } from "../state/continuousEffects.js";
import { openPendingChoose } from "../state/pendingChoice.js";
import { syncAllTourGuideSubs } from "../effects/sansanUotPrimitives.js";
import {
  beginCorpTurnFlags,
  beginRunnerTurnFlags,
} from "../state/turn.js";
import { agendaPointsFor } from "../state/scoring.js";
import { noteVirusProgramInstalled } from "../state/virusInstall.js";
import { noteProgramOrHardwareInstalled } from "../state/programHardwareInstall.js";
import { noteValSuccessfulRunTrigger } from "../effects/sansanValHooks.js";
import {
  noteDaredevilFirstRun,
  noteFirstArchivesRunBegin,
  noteFirstRdRunBegin,
  noteFirstRunBegin,
} from "../state/runBeginHooks.js";
import {
  noteFirstEncounterEachRun,
  noteFirstPassIce,
  noteSisyphusFirstPass,
} from "../state/firstEncounterPassHooks.js";
import {
  noteIceOnPass,
  notePassHost,
  notePassRezzedIce,
  notePassRezzedIceProtectingServer,
  notePassUnrezzedIce,
} from "../state/passIceHooks.js";
import { noteFirstUnsuccessfulRun } from "../state/unsuccessfulRunHooks.js";
import {
  noteFirstSuccessfulCentralRun,
  noteFirstSuccessfulHqOrRdRun,
  noteFirstSuccessfulHqRun,
  noteFirstSuccessfulMarkRun,
} from "../state/firstSuccessfulRunHooks.js";
import { checkpointAfterInstruction } from "../legality/checkpoints.js";
import { log } from "../state/createGame.js";
import {
  addBreakerStrengthBoostThisEncounter,
  addIceStrengthBoostThisEncounter,
} from "../state/lingeringEffects.js";
import { serversMatchingSpec } from "../state/runStart.js";
import { CR } from "./labels.js";
import {
  maybeOfferSubroutineOrder,
  takeNextSubroutineIndex,
} from "./subroutineOrder.js";
import {
  accountSiphonReplacesBreach,
  hasCompetingBreachReplacement,
  openBreachReplacementChoice,
} from "./breachReplacement.js";
import {
  chosenIceBypassOffered,
  resolvePendingOnEncounter,
  securityNexusTraceOffered,
  runnerHasWhenEncounteredInterrupt,
} from "../state/onEncounter.js";
import {
  noteCorpActionPhaseEnd,
  noteRunnerActionPhaseEnd,
} from "../state/phaseEndHooks.js";
import { resolveStoredConditionalPendings } from "../state/storedTriggers.js";
import { noteInlineConditional } from "../state/inlineConditionalHooks.js";
import {
  noteCompileFirstEncounter,
  noteEncounterAnyIceOncePerTurn,
} from "../state/encounterAbilityHooks.js";
import {
  noteAccessedCardAbilities,
  noteFinishAccessRdOncePerTurn,
} from "../state/accessAbilityHooks.js";
import { noteSuccessfulRunServerAbilities } from "../state/successfulRunServerHooks.js";
import { noteUnsuccessfulRunServerAbilities } from "../state/unsuccessfulRunServerHooks.js";
import {
  noteEncounterEndIfNotFullyBroken,
  noteEncounterEndIfPrintedSubroutineBroken,
  noteEncounterEndIfRezzed,
  noteEncounterEndIfRezzedThisTurn,
} from "../state/encounterEndHooks.js";
import {
  noteEncounterRezzedAfterApproach,
  noteHostEncounter,
} from "../state/hostEncounterHooks.js";
import {
  noteApproachServer,
  notePassAllIceProtectingServer,
} from "../state/approachServerHooks.js";
import {
  noteFirstSuccessfulRunOnRdEnds,
  noteOnApproachIce,
} from "../state/approachIceHooks.js";
import { noteSuccessfulRunOnRd } from "../state/successfulRunOnRdHooks.js";
import {
  noteSuccessfulRunEnd,
  noteSuccessfulRunEndOncePerTurn,
} from "../state/successfulRunEndHooks.js";
import { noteSuccessfulRunOtherServer } from "../state/otherServerSuccessHooks.js";
import { noteOnSuccessfulRun } from "../state/successfulRunHooks.js";
import { noteOnRunBegin } from "../state/runBeginEffectHooks.js";
import {
  noteOnCorpTurnEnd,
  noteOnScoreTurnEnd,
} from "../state/corpTurnEndHooks.js";
import { noteOnRunnerTurnEnd } from "../state/runnerTurnEndHooks.js";
import {
  noteCorpOnTurnBegin,
  noteCorpOnTurnBeginIfRunnerTagged,
  noteCorpTenninTurnBegin,
  noteOnCorpTurnBegin,
  noteOnCorpTurnBeginIfRunnerUntagged,
} from "../state/corpTurnBeginHooks.js";
import {
  noteOnRunnerTurnBegin,
  noteRunnerIdentityOnTurnBegin,
  noteRunnerRigTurnBegin,
  noteRunnerScoreOnTurnBegin,
} from "../state/runnerTurnBeginHooks.js";
import { noteOnBeforeFirstTurn } from "../state/beforeFirstTurnHooks.js";
import { breachCreditGain, corpStartsWithBadPublicity, onRunnerTurnEnds } from "../state/staticFlags.js";
import {
  noteApproachIce,
  noteEncounterIce,
  onAccessFinishedWithoutStealOrTrash,
  onAccessed,
  onPassedAllIce,
  onRunnerTurnBegan,
  onSuccessfulRunEnded,
  startIdentitySetup,
} from "../state/cardDeclarations.js";
import {
  fireCorpIdentityFlippedSuccessfulHqOrRdRun,
} from "../state/identityFlipHooks.js";
import { noteOutsidePoolSpendTriggers } from "../state/outsidePoolSpend.js";
import {
  activeLockdownIds,
  trashActiveLockdownsAtCorpTurnBegin,
} from "../state/lockdowns.js";
import {
  activeCorpCurrentIds,
  activeRunnerCurrentIds,
} from "../state/currents.js";
import { lingeringPlayAreaIds } from "../state/zones.js";
import { noteRunnerClickLose } from "../state/clickHooks.js";
import { removeCardFromCurrentZone } from "../state/scoring.js";
import { moveRunnerCardToHeap } from "../state/trashHooks.js";
import { recomputeRunnerMaxHandSize } from "../state/handSize.js";
import {
  cancelPendingIfSourceInactive,
  closeReactionWindow,
  completePendingAbility,
  createPendingAbilityInstance,
  markPendingAbilityResolving,
  openReactionWindow,
  pendingAbilitiesWithStatus,
  pruneSettledPendingAbilities,
} from "../state/pendingAbilities.js";

const TLDR_COPY_SUFFIX = "-tldr-copy";

/** Each subroutine gains a copy immediately after it (CR 9.8.2a). */
function grantTldrSubroutineCopies(state: GameState, iceId: string): void {
  if (!state.turn.dadDuplicateSubsOnNextIceEncounter) return;
  state.turn.dadDuplicateSubsOnNextIceEncounter = false;
  const ice = state.cards[iceId];
  const subs = ice?.subroutines ?? [];
  if (!ice || subs.length === 0) return;
  ice.subroutines = subs.flatMap((sub) => [
    sub,
    { ...structuredClone(sub), id: `${sub.id}${TLDR_COPY_SUFFIX}` },
  ]);
  log(
    state,
    `${ice.title} gains a second copy of each subroutine (CR ${CR.subroutinesDuplicated.number}).`,
  );
}

function clearTldrSubroutineCopies(state: GameState): void {
  state.turn.dadDuplicateSubsOnNextIceEncounter = false;
  for (const card of Object.values(state.cards)) {
    if (!card.subroutines?.some((sub) => sub.id.endsWith(TLDR_COPY_SUFFIX))) {
      continue;
    }
    card.subroutines = card.subroutines.filter(
      (sub) => !sub.id.endsWith(TLDR_COPY_SUFFIX),
    );
  }
}

/**
 * Sub Boost: host gains ETR after printed (collector). Barrier is a continuous
 * subtype grant (host_grant_barrier) — do not mutate ice.subtypes.
 */
function syncHostedSubBoost(state: GameState, iceId: string): void {
  const ice = state.cards[iceId];
  if (!ice) return;
  const gained = collectSubBoostEtrSubs(state, iceId);
  const keepIds = new Set(gained.map((g) => g.subId));
  ice.subroutines = (ice.subroutines ?? []).filter((sub) => {
    if (!sub.id.startsWith("sub-boost-etr-")) return true;
    return keepIds.has(sub.id);
  });
  for (const g of gained) {
    if (ice.subroutines.some((sub) => sub.id === g.subId)) continue;
    ice.subroutines.push({
      id: g.subId,
      text: g.text,
      effect: g.effect,
    });
    log(
      state,
      `${ice.title} gains "End the run." after its other subroutines (${state.cards[g.sourceId]?.title ?? g.sourceId}).`,
    );
  }
  const encounter = state.run?.encounter;
  if (encounter?.iceId !== iceId) return;
  const count = ice.subroutines.length;
  while (encounter.broken.length < count) encounter.broken.push(false);
  if (encounter.broken.length > count) {
    encounter.broken = encounter.broken.slice(0, count);
  }
}

/** Warden Fatuma: bioroid ice gains a lose-click subroutine before its others (CR 9.8.3a). */
function syncWardenBeforeSubroutines(state: GameState, iceId: string): void {
  const ice = state.cards[iceId];
  const encounter = state.run?.encounter;
  if (!ice || encounter?.iceId !== iceId) return;
  const gained = collectFatumaGainedSubs(state, iceId);
  const keepIds = new Set(gained.map((g) => g.subId));
  const subs = [...(ice.subroutines ?? [])];
  const broken = [...encounter.broken];
  for (let i = subs.length - 1; i >= 0; i--) {
    const sub = subs[i]!;
    if (!sub.id.startsWith("warden-lose-click-")) continue;
    if (keepIds.has(sub.id)) continue;
    subs.splice(i, 1);
    broken.splice(i, 1);
  }
  for (const g of [...gained].reverse()) {
    if (subs.some((sub) => sub.id === g.subId)) continue;
    subs.unshift({
      id: g.subId,
      text: g.text,
      effect: g.effect,
    });
    broken.unshift(false);
    const source = state.cards[g.sourceId];
    log(
      state,
      `${source?.title ?? g.sourceId} — ${ice.title} gains "The Runner loses [click]." before its other subroutines (CR ${CR.subroutineOriginExternalBefore.number}).`,
    );
  }
  ice.subroutines = subs;
  encounter.broken = broken;
}

function turnBeginPaused(state: GameState): boolean {
  return Boolean(
    state.pendingChoice ||
      state.pendingDamage ||
      state.pendingTags ||
      state.pendingTrashProgram ||
      state.pendingSabotage ||
      state.done,
  );
}

/** The run-end instance that stayed pending resolves once (CR 9.12.5d). */
export function resolveDeferredPersistentAmaze(state: GameState): void {
  const bag = pendingAbilitiesWithStatus(state, "pending").filter(
    (p) => p.payload?.kind === "amaze_give_tags",
  );
  if (bag.length === 0) return;

  const frame = openReactionWindow(
    state,
    bag.map((p) => p.id),
    null,
  );
  for (const inst of bag) {
    const title = state.cards[inst.sourceId]?.title ?? inst.sourceId;
    log(
      state,
      `${title}'s pending instance resolves (CR ${CR.persistentAbility.number}).`,
    );
    markPendingAbilityResolving(state, inst.id);
    const amount =
      inst.payload?.kind === "amaze_give_tags" ? inst.payload.amount : 0;
    evalEffect(
      { state, sourceId: inst.sourceId },
      { op: "do", action: { kind: "give_tags", amount } },
    );
    completePendingAbility(state, inst.id, "done");
    if (state.pendingChoice || state.pendingTags || state.done) break;
  }
  closeReactionWindow(state, frame.id);
  pruneSettledPendingAbilities(state);
}

/**
 * Resume still-pending Runner turn-begin instances left on the bag when an
 * earlier one opened an interrupt (CR 9.6.5d). Newly-marked checkpoint scoop
 * (CR 10.3.2) keeps nested checkpoints from stealing these leftovers.
 */
export function resumeRunnerTurnBeginAbilities(state: GameState): void {
  if (turnBeginPaused(state)) return;
  const rest = pendingRunnerTurnBeginIds(state);
  if (rest.length === 0) return;
  resolveStoredConditionalPendings(state, rest);
  noteOpenTurnBeginWaiting(state);
}

function isRunnerTurnBeginPendingKey(abilityKey: string): boolean {
  return (
    abilityKey === "on-turn-begin" ||
    abilityKey === "on-turn-begin-if-corp-no-bp"
  );
}

function pendingRunnerTurnBeginIds(state: GameState): string[] {
  return pendingAbilitiesWithStatus(state, "pending")
    .filter(
      (p) =>
        isRunnerTurnBeginPendingKey(p.abilityKey) &&
        (p.payload?.kind === "stored_conditional" ||
          p.payload?.kind === "inline_conditional"),
    )
    .map((p) => p.id);
}

/** Log when one turn-begin ability is open and later ones remain pending. */
function noteOpenTurnBeginWaiting(state: GameState): void {
  if (!turnBeginPaused(state)) return;
  const waiting = pendingRunnerTurnBeginIds(state).length;
  if (waiting === 0) return;
  const openId = state.pendingChoice?.sourceId;
  const title = openId ? state.cards[openId]?.title : undefined;
  if (!title) return;
  const noun = waiting === 1 ? "ability waits" : "abilities wait";
  state.log.push(
    `${title}'s turn-begin ability is open; ${waiting} later turn-begin ${noun} (CR ${CR.conditionCheckedWhenResolving.number}).`,
  );
}

function iceBypassBlockedByServerUpgrade(
  state: import("../state/types.js").GameState,
  iceId: string,
): boolean {
  const ice = state.cards[iceId];
  if (ice?.cannotBeBypassed && !abilitiesSuppressed(state, iceId)) {
    return true;
  }
  for (const server of Object.values(state.servers)) {
    if (!server.ice.includes(iceId)) continue;
    return [...server.root, ...server.ice].some((id) => {
      if (abilitiesSuppressed(state, id)) return false;
      const card = state.cards[id];
      return Boolean(card?.rezzed && card.iceCannotBeBypassedThisServer);
    });
  }
  return false;
}


/** Derez ice with derezAtAnyTurnEnd; clear Lycian gained subtypes. */
function sweepDerezAtAnyTurnEnd(s: GameState): void {
  for (const server of Object.values(s.servers)) {
    for (const id of [...server.ice]) {
      const card = s.cards[id];
      if (!card?.rezzed || !card.derezAtAnyTurnEnd) continue;
      if (card.lycianGainedSubtypes?.length) {
        const gained = new Set(card.lycianGainedSubtypes);
        card.subtypes = (card.subtypes ?? []).filter((x) => !gained.has(x));
        card.lycianGainedSubtypes = undefined;
      }
      card.rezzed = false;
      card.faceup = false;
      fireHostRezStateTriggers(s, id, "derez");
      log(s, `Derez ${card.title} (derez at turn end).`);
    }
  }
}

/** Player-facing step kinds for the v0 graph. */
export type StepKind =
  | "auto"
  | "pass"
  | "action"
  | "discard"
  | "access"
  | "branch";

/** PAW stepKeys closed under CR 6.8.2a at Run Ends. */
const pawStepKeysForRunEnds = new Set([
  "run.approachPaw",
  "run.encounterPaw",
  "run.approachServerPaw",
  "run.jackOutWindow",
  "corp.actionPaw",
  "corp.drawPaw",
  "corp.discardPaw",
  "runner.actionPaw",
  "runner.startPaw",
  "runner.discardPaw",
  "run.initiatePaw",
  "run.passIcePaw",
  "run.afterMovePaw",
]);

/** Phase-begin reaction placeholders closed under CR 6.8.2b at Run Ends. */
const reactionStepKeysForRunEnds = new Set([
  "run.encounterBeginReaction",
  "run.approachBeginReaction",
  "run.approachServerBeginReaction",
]);

export interface TimingStepDef {
  key: string;
  structure: TimingCursor["structure"];
  /** Stable appendix / deep-link id from timing-structures.json */
  stepId: string;
  stepNumber: string;
  label: string;
  kind: StepKind;
  /** Derived turn phase while parked on this step (null during nested run). */
  turnPhase: TurnPhase | null;
  /** Extra action types legal here (pass/discard/access implied by kind). */
  allows?: ReadonlyArray<Action["type"]>;
  next: string | ((state: GameState) => string);
  onResolve?: (state: GameState) => void;
}

export function cursorFrom(step: TimingStepDef): TimingCursor {
  return {
    structure: step.structure,
    stepId: step.stepId,
    stepNumber: step.stepNumber,
    label: step.label,
  };
}

function corp(
  key: string,
  stepId: string,
  stepNumber: string,
  label: string,
  kind: StepKind,
  turnPhase: TurnPhase | null,
  next: TimingStepDef["next"],
  extra: Partial<TimingStepDef> = {},
): TimingStepDef {
  return {
    key,
    structure: "corp_turn",
    stepId,
    stepNumber,
    label,
    kind,
    turnPhase,
    next,
    ...extra,
  };
}

function runner(
  key: string,
  stepId: string,
  stepNumber: string,
  label: string,
  kind: StepKind,
  turnPhase: TurnPhase | null,
  next: TimingStepDef["next"],
  extra: Partial<TimingStepDef> = {},
): TimingStepDef {
  return {
    key,
    structure: "runner_turn",
    stepId,
    stepNumber,
    label,
    kind,
    turnPhase,
    next,
    ...extra,
  };
}

function run(
  key: string,
  stepId: string,
  stepNumber: string,
  label: string,
  kind: StepKind,
  next: TimingStepDef["next"],
  extra: Partial<TimingStepDef> = {},
): TimingStepDef {
  return {
    key,
    structure: "run",
    stepId,
    stepNumber,
    label,
    kind,
    turnPhase: null,
    next,
    ...extra,
  };
}

function breach(
  key: string,
  stepId: string,
  stepNumber: string,
  label: string,
  kind: StepKind,
  next: TimingStepDef["next"],
  extra: Partial<TimingStepDef> = {},
): TimingStepDef {
  return {
    key,
    structure: "breach",
    stepId,
    stepNumber,
    label,
    kind,
    turnPhase: null,
    next,
    ...extra,
  };
}

/**
 * Opening / setup steps (CR 1.6.6–1.6.7a). Not appendix timing structures;
 * stepIds are rule ids from the CR index. `activeSide` stays corp until the
 * first Corp turn begins.
 */
function opening(
  key: string,
  stepId: string,
  stepNumber: string,
  label: string,
  kind: StepKind,
  next: TimingStepDef["next"],
  extra: Partial<TimingStepDef> = {},
): TimingStepDef {
  return {
    key,
    structure: "corp_turn",
    stepId,
    stepNumber,
    label,
    kind,
    turnPhase: null,
    next,
    ...extra,
  };
}

/**
 * Explicit timing step graph for Corp turn, Runner turn, run, and breach.
 * Appendix ids match vendor/cr-data/timing-structures.json (CR v26.03).
 * Opening mulligan steps cite rule ids from the CR index (1.6.6a / 1.6.7a).
 *
 * PAW nodes accept hardcoded paid abilities (pump / fortify) via use_paid_ability.
 */
function offerDelayedRunEndOrder(s: GameState): boolean {
  const runState = s.run;
  if (!runState || runState.delayedRunEndOrderResolved) return false;
  const trashIds = (runState.breakersThatBroke ?? []).filter((id) => {
    const card = s.cards[id];
    return Boolean(card?.trashAfterBreakingThisRun) && s.runner.installed.includes(id);
  });
  const onRunEnd = runState.onRunEndEffect;
  const compileId = runState.winCompileInstalledProgramId;
  const compilePending =
    onRunEnd?.op === "do" &&
    onRunEnd.action.kind === "win_compile_bottom_of_stack" &&
    Boolean(compileId && s.runner.installed.includes(compileId));
  if (trashIds.length === 0 || !compilePending || !compileId) return false;
  const eventId = runState.runSourceId;
  const eventTitle = eventId
    ? (s.cards[eventId]?.title ?? "Compile")
    : "Compile";
  const trashTitles = trashIds
    .map((id) => s.cards[id]?.title ?? id)
    .join(", ");
  log(
    s,
    `${eventTitle} and ${trashTitles} become pending (CR ${CR.abilityIndependent.number}).`,
  );
  const zones: Record<string, string> = {};
  for (const id of [...trashIds, compileId]) {
    const zone = s.cards[id]?.zone;
    if (zone) zones[id] = zone;
  }
  runState.delayedRunEndSourceZone = zones;
  const trashLabel = trashIds.length === 1 ? trashTitles : "the trash abilities";
  return openPendingChoose(s, {
    sourceId: eventId ?? trashIds[0]!,
    chooser: "runner",
    options: [
      {
        id: "delayed-run-end:compile-first",
        label: `Resolve ${eventTitle} first`,
        effect: {
          op: "do",
          action: { kind: "gain_credits", side: "runner", amount: 0 },
        },
      },
      {
        id: "delayed-run-end:trash-first",
        label: `Resolve ${trashLabel} first`,
        effect: {
          op: "do",
          action: { kind: "gain_credits", side: "runner", amount: 0 },
        },
      },
    ],
  });
}

export const STEPS: Record<string, TimingStepDef> = {
  // --- Opening (CR 1.6.6a mulligan; then 1.6.7a placeholder; then Corp turn) ---
  "opening.corpMulligan": opening(
    "opening.corpMulligan",
    "rule_mulligan",
    "1.6.6a",
    "Corp may take a mulligan.",
    "action",
    "opening.runnerMulligan",
    {
      allows: ["keep_starting_hand", "mulligan"],
    },
  ),
  "opening.runnerMulligan": opening(
    "opening.runnerMulligan",
    "rule_mulligan",
    "1.6.6a",
    "Runner may take a mulligan.",
    "action",
    "opening.beforeFirstTurn",
    {
      allows: ["keep_starting_hand", "mulligan"],
    },
  ),
  /**
   * CR 1.6.7a — a Corp identity ability "before taking your first turn"
   * resolves here, after mulligans and before the first Corp turn.
   */
  "opening.beforeFirstTurn": opening(
    "opening.beforeFirstTurn",
    "rule_before_first_turn",
    "1.6.7a",
    "Before taking your first turn.",
    "auto",
    "corp.gainClicks",
    {
      onResolve: (s) => {
        corpStartsWithBadPublicity(s);
        startIdentitySetup(s);
        const identity = s.cards[s.corp.identityId];
        if (
          !identity?.onBeforeFirstTurn ||
          abilitiesSuppressed(s, identity.id)
        ) {
          log(
            s,
            `No identity ability resolves before the Corp's first turn (CR ${CR.beforeFirstTurn.number}).`,
          );
          return;
        }
        log(
          s,
          `${identity.title} resolves before the Corp's first turn (CR ${CR.beforeFirstTurn.number}).`,
        );
        noteOnBeforeFirstTurn(s, identity.id);
        if ((s.turn.beforeFirstTurnPending ?? []).length > 0) {
          checkpointAfterInstruction(s, "opening.beforeFirstTurn");
        }
      },
    },
  ),

  // --- Corp turn (appendix 11.2) ---
  "corp.gainClicks": corp(
    "corp.gainClicks",
    "sec_appendix_timing_structure_corps_turn_1_a",
    "11.2_1_a",
    "The Corp gains allotted clicks.",
    "pass",
    "corp_draw",
    "corp.drawPaw",
    {
      onResolve: (s) => {
        beginCorpTurnFlags(s);
        let allotted = 3;
        for (const card of Object.values(s.cards)) {
          if (!card.rezzed) continue;
          if (card.side !== "corp") continue;
          if (abilitiesSuppressed(s, card.id)) continue;
          allotted += card.allottedClicksBonus ?? 0;
        }
        // Akshara Sareen: Corp +N while Runner connection installed.
        for (const id of s.runner.installed) {
          if (abilitiesSuppressed(s, id)) continue;
          allotted += s.cards[id]?.corpAllottedClicksBonusWhileInstalled ?? 0;
        }
        const pending = s.corpAllottedClicksDeltaNextTurn ?? 0;
        if (pending !== 0) {
          allotted += pending;
          s.corpAllottedClicksDeltaNextTurn = 0;
        }
        allotted = Math.max(0, allotted);
        s.corp.clicks = allotted;
        s.log.push(
          `Corp gains ${allotted} clicks (CR 1.11.2a / appendix 11.2_1_a).`,
        );
      },
    },
  ),
  "corp.drawPaw": corp(
    "corp.drawPaw",
    "sec_appendix_timing_structure_corps_turn_1_b",
    "11.2_1_b",
    "Paid ability window: (P) (R) (S).",
    "pass",
    "corp_draw",
    "corp.recurring",
  ),
  "corp.recurring": corp(
    "corp.recurring",
    "sec_appendix_timing_structure_corps_turn_1_c",
    "11.2_1_c",
    "The Corp's recurring credits refill.",
    "auto",
    "corp_draw",
    "corp.turnBegins",
    {
      onResolve: (s) => {
        refillRecurringCredits(s, "corp");
      },
    },
  ),
  "corp.turnBegins": corp(
    "corp.turnBegins",
    "sec_appendix_timing_structure_corps_turn_1_d",
    "11.2_1_d",
    "The Corp's turn begins.",
    "auto",
    "corp_draw",
    "corp.mandatoryDraw",
    {
      onResolve: (s) => {
        s.log.push(`Corp turn begins (appendix 11.2_1_d).`);
        noteCorpTenninTurnBegin(s);
        if (s.corpCannotAdvanceCardsNextTurn) {
          s.turn.cannotAdvanceCards = true;
          s.corpCannotAdvanceCardsNextTurn = false;
          s.log.push(
            `The Price of Freedom — Corp cannot advance cards this turn.`,
          );
        }
        if (s.bfCannotScoreUntilNextCorpTurn?.length) {
          s.bfCannotScoreUntilNextCorpTurn = [];
          s.log.push(`PAD Factory — cannot-score until next turn clears.`);
        }
        // Valley Grid: clear hand-size penalty until beginning of Corp turn.
        if ((s.runner.valleyGridHandSizePenalty ?? 0) > 0) {
          s.runner.valleyGridHandSizePenalty = 0;
          recomputeRunnerMaxHandSize(s);
          s.log.push(`Valley Grid — hand size penalty clears.`);
        }
        // Jinteki Biotech: choose face before first Corp turn if unset.
        {
          const idCard = s.cards[s.corp.identityId];
          if (
            idCard?.chooseIdentityFaceBeforeFirstTurn &&
            !idCard.chosenIdentityFaceId &&
            (idCard.identityFaceOptions?.length ?? 0) > 0
          ) {
            openPendingChoose(s, {
              sourceId: idCard.id,
              chooser: "corp",
              options: idCard.identityFaceOptions!.map((face) => ({
                id: `jb-face:${face.id}`,
                label: face.label,
                effect: {
                  op: "do" as const,
                  action: {
                    kind: "choose_jinteki_biotech_face" as const,
                    faceId: face.id,
                  },
                },
              })),
            });
          }
        }
        // Lockdowns: trash at turn begin before pending conditionals (CR 3.5.1c).
        trashActiveLockdownsAtCorpTurnBegin(s);
        // Subliminal Messaging: if Runner made no runs last turn, return from Archives.
        if (!s.turn.runnerMadeRunLastTurn) {
          for (const id of [...s.corp.discardPile]) {
            const card = s.cards[id];
            if (!card.subliminalMessaging) continue;
            s.corp.discardPile = s.corp.discardPile.filter((x) => x !== id);
            s.corp.hand.push(id);
            card.zone = "corp:hq";
            card.faceup = false;
            s.log.push(
              `${card.title} — return from Archives (Runner made no runs last turn).`,
            );
          }
        }
        // Corp turn-begin conditionals — note for 10.3.1a.
        for (const card of Object.values(s.cards)) {
          if (card.side !== "corp" || !card.rezzed || !card.onTurnBegin) continue;
          noteCorpOnTurnBegin(
            s,
            card.id,
            `${card.title} becomes pending — Corp turn begin.`,
          );
        }
        for (const id of s.corp.scoreArea) {
          const card = s.cards[id];
          if (!card?.onTurnBegin) continue;
          noteCorpOnTurnBegin(
            s,
            id,
            `${card.title} becomes pending — Corp turn begin.`,
          );
        }
        // SSL Endorsement-class: agendas in Runner score whose onTurnBegin
        // remains active on the Corp's turn.
        for (const id of s.runner.scoreArea) {
          const card = s.cards[id];
          if (!card?.onTurnBegin || !card.onTurnBeginFromRunnerScoreOnCorpTurn) {
            continue;
          }
          noteCorpOnTurnBegin(
            s,
            id,
            `${card.title} becomes pending — Corp turn begin (from Runner score).`,
          );
        }
        for (const id of s.corp.scoreArea) {
          noteCorpOnTurnBeginIfRunnerTagged(s, id);
        }
        for (const id of s.runner.installed) {
          noteOnCorpTurnBeginIfRunnerUntagged(s, id);
        }
        for (const id of s.runner.installed) {
          noteOnCorpTurnBegin(s, id);
        }
        if ((s.turn.corpTurnBeginPending ?? []).length > 0) {
          checkpointAfterInstruction(s, "corp.turnBegins");
        }
      },
    },
  ),
  "corp.mandatoryDraw": corp(
    "corp.mandatoryDraw",
    "sec_appendix_timing_structure_corps_turn_1_e",
    "11.2_1_e",
    "The Corp draws 1 card.",
    "pass",
    "corp_draw",
    "corp.actionPaw",
  ),
  "corp.actionPaw": corp(
    "corp.actionPaw",
    "sec_appendix_timing_structure_corps_turn_2_a",
    "11.2_2_a",
    "Paid ability window: (P) (R) (S).",
    "pass",
    "corp_action",
    "corp.checkClicks",
  ),
  "corp.checkClicks": corp(
    "corp.checkClicks",
    "sec_appendix_timing_structure_corps_turn_2_b",
    "11.2_2_b",
    "Does the Corp have unspent clicks?",
    "branch",
    "corp_action",
    (s) =>
      s.corp.clicks > 0 ? "corp.takeAction" : "corp.actionPhaseEnd",
  ),
  "corp.takeAction": corp(
    "corp.takeAction",
    "sec_appendix_timing_structure_corps_turn_2_b_ii",
    "11.2_2_b_ii",
    "If yes, the Corp takes an action.",
    "action",
    "corp_action",
    "corp.actionPaw",
    {
      allows: [
        "basic_gain_credit",
        "basic_draw",
        "basic_install",
        "play_operation",
        "advance",
        "basic_trash_resource",
        "basic_purge_virus",
      ],
    },
  ),
  "corp.actionPhaseEnd": corp(
    "corp.actionPhaseEnd",
    "sec_appendix_timing_structure_corps_turn_2_d",
    "11.2_2_d",
    "The Corp's action phase ends.",
    "pass",
    "corp_action",
    "corp.discard",
    {
      onResolve: (s) => {
        noteCorpActionPhaseEnd(s);
        if ((s.turn.corpActionPhaseEndPending ?? []).length > 0) {
          checkpointAfterInstruction(s, "corp.actionPhaseEnd");
        }
      },
    },
  ),
  "corp.discard": corp(
    "corp.discard",
    "sec_appendix_timing_structure_corps_turn_3_a",
    "11.2_3_a",
    "The Corp discards cards.",
    "discard",
    "corp_discard",
    "corp.discardPaw",
    { allows: ["discard_to_hand_size"] },
  ),
  "corp.discardPaw": corp(
    "corp.discardPaw",
    "sec_appendix_timing_structure_corps_turn_3_b",
    "11.2_3_b",
    "Paid ability window: (P) (R).",
    "pass",
    "corp_discard",
    "corp.loseClicks",
  ),
  "corp.loseClicks": corp(
    "corp.loseClicks",
    "sec_appendix_timing_structure_corps_turn_3_c",
    "11.2_3_c",
    "The Corp loses unspent {click}.",
    "auto",
    "corp_discard",
    "corp.turnEnds",
    {
      onResolve: (s) => {
        s.corp.clicks = 0;
      },
    },
  ),
  "corp.turnEnds": corp(
    "corp.turnEnds",
    "sec_appendix_timing_structure_corps_turn_3_d",
    "11.2_3_d",
    "The Corp's turn ends.",
    "auto",
    "corp_discard",
    "corp.turnComplete",
    {
      onResolve: (s) => {
        // Jinteki: Restoring Humanity — facedown Archives → gain 1¢
        const idCard = s.cards[s.corp.identityId];
        if (idCard?.defId === "jinteki-restoring-humanity") {
          const facedown = s.corp.discardPile.some((id) => !s.cards[id].faceup);
          if (facedown) {
            s.corp.credits += 1;
            log(s, `Jinteki: Restoring Humanity — gain 1¢ (facedown Archives).`);
          }
        }
        // Klevetnik, the mark, and temporary subtypes expire at the next
        // checkpoint (CR 9.10.1 / 10.3.1b / 10.11.4).
        s.turn.turnDurationsPassed = "corp";
        // onScoreTurnEnd / onCorpTurnEnd — note for 10.3.1a.
        for (const id of s.corp.scoreArea) {
          noteOnScoreTurnEnd(s, id);
        }
        for (const card of Object.values(s.cards)) {
          if (!card.onCorpTurnEnd || !card.rezzed) continue;
          if (!card.zone.endsWith(":root")) continue;
          noteOnCorpTurnEnd(s, card.id);
        }
        // Scored agendas (Jumon): onCorpTurnEnd while in Corp score area.
        for (const id of s.corp.scoreArea) {
          noteOnCorpTurnEnd(s, id);
        }
        if (
          (s.turn.corpTurnEndPendingIds ?? []).length > 0 ||
          (s.turn.scoreTurnEndPendingIds ?? []).length > 0
        ) {
          checkpointAfterInstruction(s, "corp.turnEnds");
        }
        // Sensor Net Activation: derez bioroids rezzed via agenda counter.
        const sensorPendingCorp = [...(s.turn.sensorNetPendingDerezIds ?? [])];
        s.turn.sensorNetPendingDerezIds = [];
        for (const id of sensorPendingCorp) {
          const c = s.cards[id];
          if (!c?.rezzed) continue;
          c.rezzed = false;
          s.log.push(`Sensor Net Activation — derez ${c.title} at turn end.`);
        }
        sweepDerezAtAnyTurnEnd(s);
      },
    },
  ),
  "corp.turnComplete": corp(
    "corp.turnComplete",
    "sec_appendix_timing_structure_corps_turn_3_e",
    "11.2_3_e",
    "The Corp's turn is complete, and the game moves to the Runner's turn.",
    "pass",
    "corp_discard",
    "runner.gainClicks",
    {
      onResolve: (s) => {
        s.activeSide = "runner";
        s.log.push("Runner turn begins.");
      },
    },
  ),

  // --- Runner turn (appendix 11.3) ---
  "runner.gainClicks": runner(
    "runner.gainClicks",
    "sec_appendix_timing_structure_runners_turn_1_a",
    "11.3_1_a",
    "The Runner gains allotted clicks.",
    "pass",
    "runner_action",
    "runner.startPaw",
    {
      onResolve: (s) => {
        beginRunnerTurnFlags(s);
        let allotted = 4;
        const clickSources = [
          ...s.runner.installed,
          s.runner.identityId,
          s.corp.identityId,
        ];
        for (const id of clickSources) {
          if (abilitiesSuppressed(s, id)) continue;
          allotted +=
            (s.cards[id]?.allottedClicksBonus ?? 0) +
            (s.cards[id]?.runnerAllottedClicksBonus ?? 0);
        }
        const pending = s.runnerAllottedClicksDeltaNextTurn ?? 0;
        if (pending !== 0) {
          allotted += pending;
          s.runnerAllottedClicksDeltaNextTurn = 0;
        }
        allotted = Math.max(0, allotted);
        s.runner.clicks = allotted;
        s.log.push(
          `Runner gains ${allotted} clicks (CR 1.11.2b / appendix 11.3_1_a). No draw phase (CR 5.3.3).`,
        );
      },
    },
  ),
  "runner.startPaw": runner(
    "runner.startPaw",
    "sec_appendix_timing_structure_runners_turn_1_b",
    "11.3_1_b",
    "Paid ability window: (P) (R).",
    "pass",
    "runner_action",
    "runner.recurring",
  ),
  "runner.recurring": runner(
    "runner.recurring",
    "sec_appendix_timing_structure_runners_turn_1_c",
    "11.3_1_c",
    "The Runner's recurring credits refill.",
    "auto",
    "runner_action",
    "runner.turnBegins",
    {
      onResolve: (s) => {
        refillRecurringCredits(s, "runner");
      },
    },
  ),
  "runner.turnBegins": runner(
    "runner.turnBegins",
    "sec_appendix_timing_structure_runners_turn_1_d",
    "11.3_1_d",
    "The Runner's turn begins.",
    "auto",
    "runner_action",
    "runner.actionPaw",
    {
      onResolve: (s) => {
        onRunnerTurnBegan(s);
        s.log.push(`Runner turn begins (appendix 11.3_1_d).`);
        s.turn.leveragePreventRunnerDamage = false;
        s.turn.tlmDedicatedNeuralNetUsedThisTurn = false;
        s.turn.starlightDoubleEventAdditionalCostIgnored = false;
        // Security Testing: the Runner may choose a server. The choice lasts
        // only until this turn ends (CR 9.10.3b).
        // Patron: choose a server.
        for (const id of s.runner.installed) {
          const card = s.cards[id];
          if (card.securityTesting && !s.pendingChoice) {
            card.namedServerId = undefined;
            openPendingChoose(s, {
              sourceId: id,
              chooser: "runner",
              options: [
                {
                  id: "st-decline",
                  label: "Do not choose a server",
                  effect: {
                    op: "do",
                    action: { kind: "gain_credits", side: "runner", amount: 0 },
                  },
                },
                ...Object.values(s.servers).map((server) => ({
                  id: `st-server:${server.id}`,
                  label: `Choose ${server.id}`,
                  effect: {
                    op: "do" as const,
                    action: {
                      kind: "gain_credits" as const,
                      side: "runner" as const,
                      amount: 0,
                    },
                  },
                })),
              ],
              logLine: `${card.title} — you may choose a server (CR 9.10.3b).`,
            });
          }
          if (typeof card.patronChooseServerDrawInsteadOfBreach === "number") {
            noteInlineConditional(s, {
              cardId: id,
              abilityKey: "patron-choose-server",
              controller: "runner",
              mandatory: true,
              effect: { op: "do", action: { kind: "choose_patron_server" } },
              logLine: `${card.title} becomes pending — turn begin (choose server).`,
            });
          }
        }
        // Runner turn-begin conditionals — note for 10.3.1a.
        noteRunnerIdentityOnTurnBegin(s, s.runner.identityId);
        for (const id of s.runner.installed) {
          noteRunnerRigTurnBegin(s, id);
        }
        // Out of the Ashes: heap may RFG self to make a run.
        for (const id of [...s.runner.discardPile]) {
          const card = s.cards[id];
          if (!card?.heapOnTurnBeginMayRfgSelfToMakeRun) continue;
          noteInlineConditional(s, {
            cardId: id,
            abilityKey: "heap-on-turn-begin-may-rfg-self-to-make-run",
            controller: "runner",
            mandatory: true,
            effect: {
              op: "choose",
              chooser: "runner",
              options: [
                {
                  id: "accept",
                  label: `Remove ${card.title} from the game to make a run`,
                  effect: {
                    op: "do",
                    action: { kind: "tlm_out_of_ashes_rfg_and_run" },
                  },
                },
                {
                  id: "decline",
                  label: "Decline",
                  effect: {
                    op: "do",
                    action: { kind: "gain_credits", side: "runner", amount: 0 },
                  },
                },
              ],
            },
            logLine: `${card.title} becomes pending — Runner turn begin (may RFG self to make a run).`,
            independentOfSource: true,
          });
        }
        for (const server of Object.values(s.servers)) {
          for (const id of server.root) {
            const card = s.cards[id];
            if (!card?.rezzed || !card.onRunnerTurnBegin) continue;
            noteOnRunnerTurnBegin(s, id);
          }
        }
        for (const id of s.corp.scoreArea) {
          noteOnRunnerTurnBegin(s, id);
        }
        // Door to Door-class: currents in corp lingering play-area.
        for (const cid of lingeringPlayAreaIds(s, "corp")) {
          noteOnRunnerTurnBegin(s, cid);
        }
        // Project Vacheron et al.: agendas in Runner score with onTurnBegin.
        for (const id of s.runner.scoreArea) {
          noteRunnerScoreOnTurnBegin(s, id);
        }
        if (
          (s.turn.runnerTurnBeginPending ?? []).length > 0 ||
          (s.turn.inlineConditionalPending ?? []).length > 0
        ) {
          checkpointAfterInstruction(s, "runner.turnBegins");
          noteOpenTurnBeginWaiting(s);
        }
      },
    },
  ),
  "runner.actionPaw": runner(
    "runner.actionPaw",
    "sec_appendix_timing_structure_runners_turn_1_e",
    "11.3_1_e",
    "Paid ability window: (P) (R).",
    "pass",
    "runner_action",
    "runner.checkClicks",
  ),
  "runner.checkClicks": runner(
    "runner.checkClicks",
    "sec_appendix_timing_structure_runners_turn_1_f",
    "11.3_1_f",
    "Does the Runner have unspent clicks?",
    "branch",
    "runner_action",
    (s) =>
      s.runner.clicks > 0 ? "runner.takeAction" : "runner.actionPhaseEnd",
  ),
  "runner.takeAction": runner(
    "runner.takeAction",
    "sec_appendix_timing_structure_runners_turn_1_f_ii",
    "11.3_1_f_ii",
    "If yes, the Runner takes an action.",
    "action",
    "runner_action",
    "runner.actionPaw",
    {
      allows: [
        "basic_gain_credit",
        "basic_draw",
        "basic_install",
        "basic_run",
        "basic_remove_tag",
        "play_event",
        "use_identity_ability",
      ],
    },
  ),
  "runner.actionPhaseEnd": runner(
    "runner.actionPhaseEnd",
    "sec_appendix_timing_structure_runners_turn_1_h",
    "11.3_1_h",
    "The Runner's action phase ends.",
    "pass",
    "runner_action",
    "runner.discard",
    {
      onResolve: (s) => {
        noteRunnerActionPhaseEnd(s);
        if ((s.turn.runnerActionPhaseEndPending ?? []).length > 0) {
          checkpointAfterInstruction(s, "runner.actionPhaseEnd");
        }
      },
    },
  ),
  "runner.discard": runner(
    "runner.discard",
    "sec_appendix_timing_structure_runners_turn_2_a",
    "11.3_2_a",
    "The Runner discards cards.",
    "discard",
    "runner_discard",
    "runner.discardPaw",
    {
      allows: ["discard_to_hand_size"],
      onResolve: (s) => {
        // Chameleon: return to grip at discard phase.
        for (const id of [...s.runner.installed]) {
          const card = s.cards[id];
          if (!card.returnToGripAtDiscardPhase) continue;
          s.runner.installed = s.runner.installed.filter((x) => x !== id);
          s.runner.hand.push(id);
          card.zone = "runner:grip";
          s.log.push(`${card.title} — return to grip (discard phase).`);
        }
        // Kabonesa Wu: RFG tracked installs still installed at turn end.
        const kabonesaTracked = s.turn.dtwnKabonesaTrackedInstallIds ?? [];
        for (const id of kabonesaTracked) {
          if (!s.runner.installed.includes(id)) continue;
          const card = s.cards[id];
          s.runner.installed = s.runner.installed.filter((x) => x !== id);
          for (const hid of [...s.runner.installed]) {
            const h = s.cards[hid];
            if (h?.hostId === id) h.hostId = undefined;
          }
          if (card) {
            card.hostId = undefined;
            card.zone = "removed-from-game";
            card.faceup = true;
          }
          if (!s.removedFromGame) s.removedFromGame = [];
          if (!s.removedFromGame.includes(id)) s.removedFromGame.push(id);
          s.log.push(
            `Kabonesa Wu — remove ${card?.title ?? id} from the game.`,
          );
        }
        s.turn.dtwnKabonesaTrackedInstallIds = [];
      },
    },
  ),
  "runner.discardPaw": runner(
    "runner.discardPaw",
    "sec_appendix_timing_structure_runners_turn_2_b",
    "11.3_2_b",
    "Paid ability window: (P) (R).",
    "pass",
    "runner_discard",
    "runner.loseClicks",
  ),
  "runner.loseClicks": runner(
    "runner.loseClicks",
    "sec_appendix_timing_structure_runners_turn_2_c",
    "11.3_2_c",
    "The Runner loses unspent {click}.",
    "auto",
    "runner_discard",
    "runner.turnEnds",
    {
      onResolve: (s) => {
        s.runner.clicks = 0;
      },
    },
  ),
  "runner.turnEnds": runner(
    "runner.turnEnds",
    "sec_appendix_timing_structure_runners_turn_2_d",
    "11.3_2_d",
    "The Runner's turn ends.",
    "auto",
    "runner_discard",
    "runner.turnComplete",
    {
      onResolve: (s) => {
        onRunnerTurnEnds(s);
        // A lingering effect that returns a program to the stack at the end of the turn
        // (Test Run). It no longer depends on the event that created it (CR 8.6.4).
        for (const id of [...s.runner.installed]) {
          const card = s.cards[id];
          if (!card?.bounceToStackAtTurnEnd) continue;
          s.runner.installed = s.runner.installed.filter((x) => x !== id);
          s.runner.deck.unshift(id);
          card.zone = "runner:stack";
          card.bounceToStackAtTurnEnd = false;
          card.faceup = false;
          s.log.push(
            `${card.title} returns to the stack at the end of the turn.`,
          );
          if (card.rfgOnUninstall) {
            s.runner.deck = s.runner.deck.filter((x) => x !== id);
            card.zone = "removed-from-game";
            card.faceup = true;
            if (!s.removedFromGame.includes(id)) s.removedFromGame.push(id);
            s.log.push(
              `${card.title}'s ability remains active and removes it from the game (CR ${CR.abilityRemainsActive.number}).`,
            );
          }
        }
        // onRunnerTurnEnd (identity, rig, heap) — note for 10.3.1a.
        noteOnRunnerTurnEnd(s, s.runner.identityId);
        for (const id of [...s.runner.installed]) {
          noteOnRunnerTurnEnd(s, id);
        }
        // Crowdfunding-class: heap cards with onRunnerTurnEnd.
        for (const id of [...s.runner.discardPile]) {
          noteOnRunnerTurnEnd(s, id);
        }
        if ((s.turn.runnerTurnEndPendingIds ?? []).length > 0) {
          checkpointAfterInstruction(s, "runner.turnEnds");
        }
        // Algernon-class: trash if click-gain was taken and no successful run.
        for (const id of [...s.runner.installed]) {
          const card = s.cards[id];
          if (!card?.trashAtTurnEndUnlessSuccessfulRun) continue;
          card.trashAtTurnEndUnlessSuccessfulRun = false;
          if (s.turn.successfulRunThisTurn) continue;
          noteInlineConditional(s, {
            cardId: id,
            abilityKey: "trash-at-turn-end-unless-successful-run",
            controller: "runner",
            mandatory: true,
            effect: { op: "do", action: { kind: "trash_self" } },
            logLine: `${card.title} becomes pending — turn end (trash unless successful run).`,
          });
        }
        // London Library: trash all programs hosted when Runner turn ends.
        for (const id of [...s.runner.installed]) {
          const host = s.cards[id];
          if (!host?.trashHostedProgramsOnTurnEnd) continue;
          for (const hid of [...(host.hostedCardIds ?? [])]) {
            const hosted = s.cards[hid];
            if (!hosted || hosted.type !== "program") continue;
            host.hostedCardIds = (host.hostedCardIds ?? []).filter(
              (x) => x !== hid,
            );
            hosted.hostId = undefined;
            moveRunnerCardToHeap(s, hid);
            s.log.push(
              `${host.title} — trash hosted ${hosted.title} at turn end.`,
            );
          }
        }

        // Bug-Out Bag: if grip empty at turn end, draw per power then trash.
        for (const rid of [...s.runner.installed]) {
          const card = s.cards[rid];
          if (!card?.onTurnEndIfGripEmptyDrawPerPowerThenTrash) continue;
          if (s.runner.hand.length > 0) continue;
          noteInlineConditional(s, {
            cardId: rid,
            abilityKey: "bug-out-bag-draw-per-power-then-trash",
            controller: "runner",
            mandatory: true,
            effect: { op: "do", action: { kind: "draw_per_power_then_trash" } },
            logLine: `${card.title} becomes pending — turn end with empty grip (draw then trash).`,
          });
        }

        // Joshua B.-class: take 1 tag at turn end. The delayed ability
        // outlives the source card and expires once it resolves (CR 9.6.13c).
        const delayedTags = s.turn.delayedTurnEndTags;
        s.turn.delayedTurnEndTags = [];
        for (const pending of delayedTags) {
          s.log.push(
            `${pending.title}'s delayed ability resolves; take 1 tag (CR ${CR.delayedAbilityOnce.number}).`,
          );
          noteInlineConditional(s, {
            cardId: pending.sourceId,
            abilityKey: "delayed-turn-end-tag",
            controller: "runner",
            mandatory: true,
            effect: { op: "do", action: { kind: "give_tags", amount: 1 } },
            logLine: `${pending.title} becomes pending — delayed turn-end tag resolves.`,
            // CR 9.6.13c — delayed ability outlives the source card.
            independentOfSource: true,
          });
        }
        // Lightning Laboratory: delayed derez at end of the turn the ability was used
        // (runs are on the Runner turn → runner.turnEnds).
        const pending = s.turn.lightningPendingDerez;
        if (pending) {
          s.turn.lightningPendingDerez = null;
          const src =
            s.corp.scoreArea.find((id) => {
              const c = s.cards[id];
              return Boolean(
                c?.onCorpTurnEndDerezUpToIceProtectingLightningServer,
              );
            }) ?? s.corp.identityId;
          noteInlineConditional(s, {
            cardId: src,
            abilityKey: "lightning-lab-end-of-turn-derez",
            controller: "corp",
            mandatory: true,
            effect: {
              op: "do",
              action: {
                kind: "derez_up_to_ice_protecting_server",
                serverId: pending.serverId,
                maxIce: pending.maxIce,
              },
            },
            logLine: `${s.cards[src]?.title ?? "Lightning Laboratory"} becomes pending — turn end (derez ice).`,
          });
        }
        if ((s.turn.inlineConditionalPending ?? []).length > 0) {
          checkpointAfterInstruction(s, "runner.turnEnds");
        }
        // Sensor Net Activation: derez bioroids rezzed via agenda counter.
        const sensorPending = [...(s.turn.sensorNetPendingDerezIds ?? [])];
        s.turn.sensorNetPendingDerezIds = [];
        for (const id of sensorPending) {
          const c = s.cards[id];
          if (!c?.rezzed) continue;
          c.rezzed = false;
          s.log.push(`Sensor Net Activation — derez ${c.title} at turn end.`);
        }
        sweepDerezAtAnyTurnEnd(s);
        // Mark, temporary subtypes, and this turn's strength last until the
        // next checkpoint (CR 9.10.1 / 10.3.1b / 10.11.4).
        s.turn.turnDurationsPassed = "runner";
      },
    },
  ),
  "runner.turnComplete": runner(
    "runner.turnComplete",
    "sec_appendix_timing_structure_runners_turn_2_e",
    "11.3_2_e",
    "The Runner's turn is complete, and the game moves to the Corp's turn.",
    "pass",
    "runner_discard",
    (s) => {
      if ((s.pendingExtraRunnerTurns ?? 0) > 0) {
        return "runner.gainClicks";
      }
      return "corp.gainClicks";
    },
    {
      onResolve: (s) => {
        if ((s.pendingExtraRunnerTurns ?? 0) > 0) {
          s.pendingExtraRunnerTurns -= 1;
          s.activeSide = "runner";
          s.log.push(
            `Encore — additional Runner turn begins (${s.pendingExtraRunnerTurns} remaining queued).`,
          );
          return;
        }
        s.turnNumber += 1;
        s.activeSide = "corp";
        if (s.config.stopAfterFirstCycle && !s.winner) {
          s.done = true;
          s.log.push(
            `Vertical slice complete — returning to Corp would be turn ${s.turnNumber}`,
          );
        } else {
          s.log.push(`Corp turn ${s.turnNumber} begins.`);
        }
      },
    },
  ),

  // --- Run (appendix 11.4) — walked automatically in v0 for empty / unrezzed ice ---
  "run.announce": run(
    "run.announce",
    "sec_appendix_timing_structure_of_a_run_1_a",
    "11.4_1_a",
    "The Runner announces the attacked server.",
    "auto",
    "run.fillBpFund",
  ),
  "run.fillBpFund": run(
    "run.fillBpFund",
    "sec_appendix_timing_structure_of_a_run_1_b",
    "11.4_1_b",
    "The Runner fills their bad publicity fund.",
    "auto",
    "run.begin",
    {
      onResolve: (s) => {
        const n = s.corp.badPublicity ?? 0;
        s.badPublicityFund = n;
        if (n > 0) {
          s.log.push(
            `Fill bad publicity fund with ${n}¢ (CR 10.6.3a / appendix 11.4_1_b).`,
          );
        }
      },
    },
  ),
  "run.begin": run(
    "run.begin",
    "sec_appendix_timing_structure_of_a_run_1_c",
    "11.4_1_c",
    "The run begins.",
    "auto",
    "run.initiatePaw",
    {
      onResolve: (s) => {
        // onRunBegin (rig + lockdowns) — note for 10.3.1a with first-* below.
        for (const id of s.runner.installed) {
          noteOnRunBegin(s, id);
        }
        // Active lockdowns in corp:play-area (SYNC Rerouting).
        for (const id of activeLockdownIds(s)) {
          noteOnRunBegin(s, id);
        }
        // First-* run begin this turn — queue for 10.3.1a (phase 3).
        if (s.run?.attackedServerId === "rd") {
          noteFirstRdRunBegin(s);
        }
        noteFirstRunBegin(s);
        if (s.run?.attackedServerId === "archives") {
          noteFirstArchivesRunBegin(s);
        }
        // Daredevil: first run on server with ≥N ice — queue for 10.3.1a.
        noteDaredevilFirstRun(s);
        checkpointAfterInstruction(s, "run.begin");
        // Window of Opportunity: derez 1 protecting ice when run begins.
        if (s.run?.derezProtectingIceOnRunBegin) {
          s.run.derezProtectingIceOnRunBegin = false;
          const src = s.run.runSourceId;
          if (src) {
            noteInlineConditional(s, {
              cardId: src,
              abilityKey: "window-derez-protecting-ice-on-run-begin",
              controller: "runner",
              mandatory: true,
              effect: {
                op: "do",
                action: { kind: "may_derez_protecting_attacked_ice" },
              },
              logLine: `${s.cards[src]?.title ?? "Window of Opportunity"} becomes pending — run begin (may derez protecting ice).`,
            });
            checkpointAfterInstruction(s, "run.begin");
          }
        }
        // Lightning Laboratory: may spend agenda counter to rez up to N ice.
        if (!s.pendingChoice) {
          for (const id of s.corp.scoreArea) {
            const card = s.cards[id];
            const hook =
              card?.onRunBeginMaySpendAgendaCounterRezUpToIceProtectingAttacked;
            if (!hook || (card.agendaCounters ?? 0) < 1) continue;
            openPendingChoose(s, {
              sourceId: id,
              chooser: "corp",
              options: [
                {
                  id: "decline-lightning",
                  label: "Decline",
                  effect: {
                    op: "do",
                    action: { kind: "gain_credits", side: "corp", amount: 0 },
                  },
                },
                {
                  id: "lightning-spend",
                  label: `Remove 1 agenda counter: rez up to ${hook.maxIce} ice ignoring costs`,
                  effect: {
                    op: "do",
                    action: {
                      kind: "spend_lightning_counter_rez_up_to_protecting_attacked",
                      maxIce: hook.maxIce,
                    },
                  },
                },
              ],
              logLine: `${card.title} — may remove 1 agenda counter to rez up to ${hook.maxIce} ice.`,
            });
            break;
          }
        }
      },
    },
  ),
  "run.initiatePaw": run(
    "run.initiatePaw",
    "sec_appendix_timing_structure_of_a_run_1_e",
    "11.4_1_e",
    "Paid ability window: (P) (R).",
    "pass",
    "run.checkIce",
    { allows: ["use_paid_ability", "rez_asset", "pass_window"] },
  ),
  "run.checkIce": run(
    "run.checkIce",
    "sec_appendix_timing_structure_of_a_run_1_f",
    "11.4_1_f",
    "Does the Runner have a position corresponding to a piece of ice?",
    "branch",
    (s) => {
      const runState = s.run!;
      let server = s.servers[runState.attackedServerId];
      const pastIce =
        runState.position === null ||
        runState.position >= server.ice.length;
      if (
        pastIce &&
        runState.redirectApproachArchivesToHq &&
        runState.attackedServerId === "archives" &&
        !runState.archivesApproachRedirectUsed
      ) {
        runState.archivesApproachRedirectUsed = true;
        runState.attackedServerId = "hq";
        runState.position = 0;
        server = s.servers.hq;
        s.log.push(
          "Maintenance Access — change attacked server to HQ and approach HQ ice.",
        );
      }
      return runState.position !== null &&
        runState.position < server.ice.length
        ? "run.approachIce"
        : "run.approachServer";
    },
    {
      onResolve: (s) => {
        const runState = s.run!;
        if (s.pendingChoice) return;
        const server = s.servers[runState.attackedServerId];
        const pastIce =
          runState.position === null ||
          runState.position >= server.ice.length;
        const cost =
          runState.mayRedirectApproachArchivesToHqOrRdPayingStealthCredits;
        if (
          !pastIce ||
          runState.attackedServerId !== "archives" ||
          cost == null ||
          runState.archivesApproachRedirectUsed
        ) {
          return;
        }
        runState.archivesApproachRedirectUsed = true;
        const canPay =
          stealthHostedCreditsAvailable(s) >= cost &&
          canPayCost(
            s,
            "runner",
            { credits: cost, creditsFromStealthOnly: true },
          );
        const options: Array<{
          id: string;
          label: string;
          effect: import("../effects/ir.js").Effect;
        }> = [];
        if (canPay) {
          for (const sid of ["hq", "rd"] as const) {
            options.push({
              id: `baker-redirect:${sid}`,
              label: `Pay ${cost}¢ from stealth: approach ${sid.toUpperCase()}`,
              effect: {
                op: "seq",
                effects: [
                  {
                    op: "do",
                    action: { kind: "spend_stealth_credits", amount: cost },
                  },
                  {
                    op: "do",
                    action: {
                      kind: "redirect_approach_to_server",
                      serverId: sid,
                    },
                  },
                ],
              },
            });
          }
        }
        options.push({
          id: "decline",
          label: "Decline — approach Archives",
          effect: {
            op: "do",
            action: {
              kind: "gain_credits",
              side: "runner",
              amount: 0,
            },
          },
        });
        openPendingChoose(s, {
          sourceId: runState.runSourceId ?? s.runner.identityId,
          chooser: "runner",
          options,
          logLine: `Baker — may pay ${cost}¢ from stealth to approach HQ or R&D.`,
        });
      },
    },
  ),
  "run.approachIce": run(
    "run.approachIce",
    "sec_appendix_timing_structure_of_a_run_2_a",
    "11.4_2_a",
    "The Runner approaches ice.",
    "auto",
    "run.approachPaw",
    {
      onResolve: (s) => {
        const runState = s.run!;
        const iceId =
          runState.forceEncounterIceId ??
          s.servers[runState.attackedServerId].ice[runState.position!];
        const ice = s.cards[iceId];
        runState.phase = "approach_ice";
        s.log.push(
          `Approach ice ${ice.title} at position ${runState.position} (appendix 11.4_2_a / CR 6.4.1).`,
        );
        noteApproachIce(s, iceId);
        const server = s.servers[runState.attackedServerId];
        // Midori / Mitra Aman-class: rezzed root onApproachIce — note for 10.3.1a.
        // Note even when a later Snitch choice may open; the checkpoint marks,
        // and the reaction window waits on any open choice (CR 10.3.2).
        for (const id of server.root) {
          const card = s.cards[id];
          if (!card?.rezzed || !card.onApproachIce) continue;
          if (abilitiesSuppressed(s, id)) continue;
          if (card.onApproachIceOncePerRun) {
            const fired = s.run?.approachIceTriggersFiredIds ?? [];
            if (fired.includes(id)) continue;
          }
          noteOnApproachIce(s, id);
          if (card.onApproachIceOncePerRun && s.run) {
            s.run.approachIceTriggersFiredIds = [
              ...(s.run.approachIceTriggersFiredIds ?? []),
              id,
            ];
          }
        }
        checkpointAfterInstruction(s, "run.approachIce");
        // Snitch: once per run, approaching unrezzed ice → may expose then jack out.
        if (
          !s.pendingChoice &&
          ice &&
          !ice.rezzed &&
          !runState.snitchUsedThisRun
        ) {
          for (const id of s.runner.installed) {
            const snitch = s.cards[id];
            if (!snitch?.mayExposeApproachedUnrezzedIceOncePerRunThenMayJackOut) {
              continue;
            }
            runState.snitchUsedThisRun = true;
            openPendingChoose(s, {
              sourceId: id,
              chooser: "runner",
              options: [
                {
                  id: "snitch-expose",
                  label: `Expose ${ice.title}, then may jack out`,
                  effect: {
                    op: "seq",
                    effects: [
                      {
                        op: "do",
                        action: {
                          kind: "expose",
                          pick: "choose",
                          cardId: iceId,
                        },
                      },
                      { op: "do", action: { kind: "offer_jack_out" } },
                    ],
                  },
                },
                {
                  id: "decline",
                  label: "Decline",
                  effect: {
                    op: "do",
                    action: {
                      kind: "gain_credits",
                      side: "runner",
                      amount: 0,
                    },
                  },
                },
              ],
              logLine: `${snitch.title} — may expose approached ${ice.title}, then may jack out.`,
            });
            break;
          }
        }
      },
    },
  ),
  "run.approachPaw": run(
    "run.approachPaw",
    "sec_appendix_timing_structure_of_a_run_2_b",
    "11.4_2_b",
    "Paid ability window: (P) (R) and ice can be rezzed.",
    "pass",
    "run.iceRezzed",
    { allows: ["rez_ice", "rez_asset", "use_paid_ability", "pass_window"] },
  ),
  "run.iceRezzed": run(
    "run.iceRezzed",
    "sec_appendix_timing_structure_of_a_run_2_c",
    "11.4_2_c",
    "Is the approached ice rezzed?",
    "branch",
    (s) => {
      const runState = s.run!;
      const iceId =
        runState.forceEncounterIceId ??
        s.servers[runState.attackedServerId].ice[runState.position!];
      if (s.cards[iceId].rezzed) {
        return "run.encounter";
      }
      s.log.push(
        `Ice unrezzed — skip encounter (appendix 11.4_2_c_ii).`,
      );
      return "run.movement";
    },
  ),
  "run.encounter": run(
    "run.encounter",
    "sec_appendix_timing_structure_of_a_run_3_a",
    "11.4_3_a",
    "The Runner encounters ice.",
    "auto",
    (s) => {
      const iceId = s.run?.encounter?.iceId;
      if (iceId && (s.run?.bypassedIceIds ?? []).includes(iceId)) {
        return "run.movement";
      }
      return "run.encounterPaw";
    },
    {
      onResolve: (s) => {
        const runState = s.run!;
        const iceId =
          runState.forceEncounterIceId ??
          s.servers[runState.attackedServerId].ice[runState.position!];
        if (runState.forceEncounterIceId) {
          runState.forceEncounterIceId = undefined;
        }
        const ice = s.cards[iceId];
        // Inazuma: jack-out ban lifts when this encounter begins.
        if (runState.clearCannotJackOutOnNextEncounterBegin) {
          runState.clearCannotJackOutOnNextEncounterBegin = false;
          runState.cannotJackOut = false;
          s.log.push(
            `Inazuma — jack out allowed again (next ice encounter began).`,
          );
        }
        const applyInazumaBreakLock = Boolean(runState.inazumaLockNextEncounter);
        if (applyInazumaBreakLock) {
          runState.inazumaLockNextEncounter = false;
        }
        runState.iceEncounteredCount = (runState.iceEncounteredCount ?? 0) + 1;
        runState.lastEncounteredIceId = iceId;
        if (
          runState.mayJackOutOnFirstIceEncounter &&
          !runState.reconJackOutOffered &&
          runState.iceEncounteredCount === 1
        ) {
          runState.reconJackOutOffered = true;
          const reconSrc = runState.runSourceId ?? iceId;
          noteInlineConditional(s, {
            cardId: reconSrc,
            abilityKey: "recon-may-jack-out-on-first-ice",
            controller: "runner",
            mandatory: true,
            effect: { op: "do", action: { kind: "offer_jack_out" } },
            logLine: `${s.cards[reconSrc]?.title ?? "Recon"} becomes pending — first ice encounter (may jack out).`,
          });
        }
        // Nero Severn: once per turn when encountering a sentry, may jack out.
        {
          const idCard = s.cards[s.runner.identityId];
          const iceSubs = ice.subtypes ?? [];
          if (
            idCard?.mayJackOutOnEncounterSentryOncePerTurn &&
            !s.turn.dagNeroSentryJackOutUsedThisTurn &&
            iceSubs.includes("sentry")
          ) {
            s.turn.dagNeroSentryJackOutUsedThisTurn = true;
            noteInlineConditional(s, {
              cardId: idCard.id,
              abilityKey: "nero-may-jack-out-on-encounter-sentry",
              controller: "runner",
              mandatory: true,
              effect: { op: "do", action: { kind: "offer_jack_out" } },
              logLine: `${idCard.title} becomes pending — encounter sentry (may jack out).`,
            });
          }
        }
        // Paperclip: when encountering a barrier, may install self from heap.
        if ((ice.subtypes ?? []).includes("barrier")) {
          for (const heapId of [...s.runner.discardPile]) {
            const c = s.cards[heapId];
            if (!c?.mayInstallSelfFromHeapOnEncounterBarrier) continue;
            noteInlineConditional(s, {
              cardId: heapId,
              abilityKey: "paperclip-heap-install-on-encounter-barrier",
              controller: "runner",
              mandatory: true,
              effect: {
                op: "choose",
                chooser: "runner",
                options: [
                  {
                    id: "install",
                    label: `Install ${c.title} from heap`,
                    effect: {
                      op: "do",
                      action: {
                        kind: "install_heap_card",
                        cardId: heapId,
                        discount: 0,
                      },
                    },
                  },
                  {
                    id: "decline",
                    label: "Decline",
                    effect: {
                      op: "do",
                      action: {
                        kind: "gain_credits",
                        side: "runner",
                        amount: 0,
                      },
                    },
                  },
                ],
              },
              logLine: `${c.title} becomes pending — encounter (may install from heap).`,
              // Heap may-install fires from an inactive zone (CR 9.6.10 exception).
              independentOfSource: true,
            });
            break;
          }
        }
        // Black Orchestra: when encountering a code gate, may install self from heap.
        if ((ice.subtypes ?? []).includes("code gate")) {
          for (const heapId of [...s.runner.discardPile]) {
            const c = s.cards[heapId];
            if (!c?.mayInstallSelfFromHeapOnEncounterCodeGate) continue;
            noteInlineConditional(s, {
              cardId: heapId,
              abilityKey: "black-orchestra-heap-install-on-encounter-code-gate",
              controller: "runner",
              mandatory: true,
              effect: {
                op: "choose",
                chooser: "runner",
                options: [
                  {
                    id: "install",
                    label: `Install ${c.title} from heap`,
                    effect: {
                      op: "do",
                      action: {
                        kind: "install_heap_card",
                        cardId: heapId,
                        discount: 0,
                      },
                    },
                  },
                  {
                    id: "decline",
                    label: "Decline",
                    effect: {
                      op: "do",
                      action: {
                        kind: "gain_credits",
                        side: "runner",
                        amount: 0,
                      },
                    },
                  },
                ],
              },
              logLine: `${c.title} becomes pending — encounter (may install from heap).`,
              independentOfSource: true,
            });
            break;
          }
        }
        // MKUltra: when encountering a sentry, may install self from heap.
        if ((ice.subtypes ?? []).includes("sentry")) {
          for (const heapId of [...s.runner.discardPile]) {
            const c = s.cards[heapId];
            if (!c?.mayInstallSelfFromHeapOnEncounterSentry) continue;
            noteInlineConditional(s, {
              cardId: heapId,
              abilityKey: "mkultra-heap-install-on-encounter-sentry",
              controller: "runner",
              mandatory: true,
              effect: {
                op: "choose",
                chooser: "runner",
                options: [
                  {
                    id: "install",
                    label: `Install ${c.title} from heap`,
                    effect: {
                      op: "do",
                      action: {
                        kind: "install_heap_card",
                        cardId: heapId,
                        discount: 0,
                      },
                    },
                  },
                  {
                    id: "decline",
                    label: "Decline",
                    effect: {
                      op: "do",
                      action: {
                        kind: "gain_credits",
                        side: "runner",
                        amount: 0,
                      },
                    },
                  },
                ],
              },
              logLine: `${c.title} becomes pending — encounter (may install from heap).`,
              independentOfSource: true,
            });
            break;
          }
        }
        // Şifr: once/turn may −1 hand size to set encounter ice strength to 0.
        // Lotus Field-class cannot have strength lowered (UFAQ / CR 9.12.1a).
        if (!s.turn.sifrUsedThisTurn && !ice.strengthCannotBeLowered) {
          for (const rid of s.runner.installed) {
            const c = s.cards[rid];
            if (!c?.sifrMayZeroEncounterIceStrengthOncePerTurn) continue;
            noteInlineConditional(s, {
              cardId: rid,
              abilityKey: "sifr-may-zero-encounter-ice-strength",
              controller: "runner",
              mandatory: true,
              effect: {
                op: "choose",
                chooser: "runner",
                options: [
                  {
                    id: "sifr-accept",
                    label: `Şifr: −1 hand size; set ${ice.title} strength to 0`,
                    effect: {
                      op: "do",
                      action: { kind: "sifr_zero_encounter_ice_strength" },
                    },
                  },
                  {
                    id: "decline",
                    label: "Decline",
                    effect: {
                      op: "do",
                      action: {
                        kind: "gain_credits",
                        side: "runner",
                        amount: 0,
                      },
                    },
                  },
                ],
              },
              logLine: `${c.title} becomes pending — encounter (may zero ice strength).`,
            });
            break;
          }
        }
        // Always Have a Backup Plan: bypass the last ice from the first run.
        if (
          runState.backupPlanBypassIceId &&
          runState.backupPlanBypassIceId === iceId
        ) {
          runState.backupPlanBypassIceId = undefined;
          runState.bypassFirstEncounter = true; // reuse bypass path below
        }
        if ((runState.bypassEncountersRemaining ?? 0) > 0 && !iceBypassBlockedByServerUpgrade(s, iceId)) {
          runState.bypassEncountersRemaining! -= 1;
          runState.bypassedIceIds = [...(runState.bypassedIceIds ?? []), iceId];
          s.log.push(
            `Bypass ice (${ice.title}); ${runState.bypassEncountersRemaining ?? 0} bypass(es) left.`,
          );
          runState.encounter = {
            iceId,
            broken: (ice.subroutines ?? []).map(() => true),
          };
          fireOnBypassTriggers(s, iceId);
          noteEncounterEndIfRezzed(s, iceId);
        }
        // Inside Job / S-Dobrado: bypass first encounter
        if (runState.bypassFirstEncounter && !iceBypassBlockedByServerUpgrade(s, iceId)) {
          runState.bypassFirstEncounter = false;
          runState.bypassedIceIds = [...(runState.bypassedIceIds ?? []), iceId];
          runState.encounter = null;
          s.log.push(`Bypass ${ice.title} (first encounter this run).`);
          // Skip encounter — jump to movement by clearing encounter and
          // relying on next-step; mark as if fully broken.
          runState.encounter = {
            iceId,
            broken: (ice.subroutines ?? []).map(() => true),
          };
          fireOnBypassTriggers(s, iceId);
          noteEncounterEndIfRezzed(s, iceId);
        }
        // Spear Phishing: bypass the innermost ice protecting the server.
        if (runState.bypassInnermostEncounter) {
          const protecting = s.servers[runState.attackedServerId]?.ice ?? [];
          const innermostId =
            protecting.length > 0
              ? protecting[protecting.length - 1]
              : undefined;
          if (innermostId && iceId === innermostId) {
            runState.bypassInnermostEncounter = false;
            if (!(runState.bypassedIceIds ?? []).includes(iceId)) {
              runState.bypassedIceIds = [
                ...(runState.bypassedIceIds ?? []),
                iceId,
              ];
              s.log.push(
                `Bypass ${ice.title} (innermost ice protecting ${runState.attackedServerId}).`,
              );
              runState.encounter = {
                iceId,
                broken: (ice.subroutines ?? []).map(() => true),
              };
              fireOnBypassTriggers(s, iceId);
              noteEncounterEndIfRezzed(s, iceId);
            }
          }
        }
        // Refresh printed subroutines from CR 9.3.7e records before encounter
        // dynamics (Hive / Stick and Poke / TLDR extras keep their positions).
        if ((ice.abilities ?? []).some((a) => a.class === "subroutine")) {
          syncSubroutinesFromRecords(ice);
        }
        const subs = ice.subroutines ?? [];
        runState.phase = "encounter";
        if (!runState.encounter) {
          if (ice.dynamicEtrSubroutineCountFromCorpAgendaPoints) {
            if (!ice.baseSubroutines) {
              ice.baseSubroutines = structuredClone(subs);
            }
            const printed = ice.baseSubroutines ?? subs;
            // Blanked continuous lose-subs keeps printed base (CR 9.12.1d).
            if (abilitiesSuppressed(s, iceId)) {
              ice.subroutines = structuredClone(printed);
            } else {
              const points = agendaPointsFor(s, "corp");
              const lose = Math.min(printed.length, points);
              ice.subroutines = printed.slice(0, printed.length - lose);
              if (lose > 0) {
                log(
                  s,
                  `${ice.title} loses ${lose} printed subroutine(s) from the last (CR ${CR.subroutinesLostFromLast.number}).`,
                );
              }
            }
          }
          if (ice.dynamicEtrSubroutineCountFromCorpHandSize) {
            syncCorpHandSizeSubroutines(s, iceId);
          }
          if (ice.dynamicEtrSubroutineCountFromRezzedIceSubtype) {
            syncNextSubtypeEtrSubs(s, iceId);
          }
          if (
            s.run?.iceRezzedDuringApproachId === iceId &&
            s.cards[s.runner.identityId]?.onEncounterRezzedAfterApproach
          ) {
            noteEncounterRezzedAfterApproach(s);
          }
          grantTldrSubroutineCopies(s, iceId);
          runState.encounter = {
            iceId,
            broken: (ice.subroutines ?? subs).map(() => false),
          };
          noteEncounterAnyIceOncePerTurn(s);
          if (s.run?.encounter?.iceId) noteEncounterIce(s, s.run.encounter.iceId);
          noteCompileFirstEncounter(s);
          if (
            (s.turn.encounterAbilityPending ?? []).length > 0 ||
            (s.turn.inlineConditionalPending ?? []).length > 0
          ) {
            checkpointAfterInstruction(s, "run.encounter");
          }
          if (runState.markerExtraEtrNextIce) {
            runState.markerExtraEtrNextIce = false;
            const etrEffect = {
              op: "do" as const,
              action: { kind: "end_the_run" as const },
            };
            ice.subroutines = [
              ...(ice.subroutines ?? []),
              {
                id: `${ice.defId}-marker-etr`,
                text: "End the run.",
                effect: structuredClone(etrEffect),
              },
            ];
            runState.encounter.broken.push(false);
            s.log.push(
              `${ice.title} gains "End the run." after its other subroutines (CR ${CR.subroutineOriginExternalAfter.number}).`,
            );
          }
        } else if (runState.encounter.iceId === iceId) {
          // encounter already set (bypass paths)
        }
        // Inazuma first sub: cannot break on this encounter's ice.
        if (applyInazumaBreakLock && ice && runState.encounter) {
          ice.cannotBreakWithRunnerCardAbilities = true;
          runState.encounter.forbidRunnerBreakThisEncounter = true;
          s.log.push(
            `Inazuma — Runner cannot break subroutines on ${ice.title} this encounter.`,
          );
        }
        // Diana's Hunt: may install a program from grip ignoring costs.
        if (
          runState.onEncounterMayInstallProgramFromGripIgnoringCosts &&
          s.runner.hand.some((id) => s.cards[id]?.type === "program")
        ) {
          const dianaSrc = runState.runSourceId ?? iceId;
          noteInlineConditional(s, {
            cardId: dianaSrc,
            abilityKey: "dianas-hunt-may-install-program-on-encounter",
            controller: "runner",
            mandatory: true,
            effect: {
              op: "do",
              action: {
                kind: "may_install_diana_program_from_grip_ignoring_costs",
              },
            },
            logLine: `${s.cards[dianaSrc]?.title ?? "Diana's Hunt"} becomes pending — encounter (may install program from grip).`,
          });
        }
        // Chum: apply pending next-ice strength bonus at encounter begin.
        if (runState.chumNextIce) {
          const chum = runState.chumNextIce;
          runState.chumNextIce = undefined;
          addIceStrengthBoostThisEncounter(s, {
            createdBy: iceId,
            iceId,
            amount: chum.strengthBonus,
          });
          runState.chumActiveEncounter = {
            iceId,
            netDamageIfNotFullyBroken: chum.netDamageIfNotFullyBroken,
            chumSourceId: chum.chumSourceId,
          };
          s.log.push(
            `Chum — ${ice.title} gets +${chum.strengthBonus} strength this encounter.`,
          );
        }
        // Continuous gained subs (M1 collectors) — one apply so families do not wipe each other.
        {
          const winchester = collectWinchesterHqSubs(s, iceId);
          const winchesterFresh =
            winchester.length > 0 &&
            !(runState as { winchesterHqSubsApplied?: boolean })
              .winchesterHqSubsApplied;
          const continuous = [
            ...winchester,
            ...collectBlockchainArchivesSubs(s, iceId),
            ...collectHostedConditionSubsBeforePrinted(s, iceId),
            ...collectAdvancementGainedSubs(s, iceId),
            ...collectNextOpalSubs(s, iceId),
            ...collectTourGuideEtrSubs(s, iceId),
          ];
          const needsSync =
            continuous.length > 0 ||
            Boolean(ice.gainsSubroutinesBeforePrintedPerFaceupArchives) ||
            Boolean(ice.gainsSubroutinesPerAdvancement) ||
            Boolean(ice.gainsSubroutinesPerRezzedIceWithSubtype) ||
            Boolean(ice.etrSubroutinesPerRezzedAsset) ||
            (ice.continuousGainedSubDecls ?? []).some((d) =>
              (
                [
                  "hq_protect_subs",
                  "archives_faceup_per",
                  "per_advancement",
                  "per_rezzed_subtype",
                  "etr_per_rezzed_asset",
                ] as const
              ).includes(d.kind as never),
            );
          if (needsSync) {
            const beforeLen = ice.subroutines?.length ?? 0;
            applyContinuousGainedSubs(s, iceId, continuous);
            runState.encounter = {
              iceId,
              broken: (ice.subroutines ?? []).map(() => false),
            };
            if (winchesterFresh) {
              (runState as { winchesterHqSubsApplied?: boolean }).winchesterHqSubsApplied =
                true;
              s.log.push(
                `${ice.title} — gains ${winchester.length} subroutine(s) while protecting HQ.`,
              );
            }
            const blockchain = continuous.filter((g) =>
              ice.gainsSubroutinesBeforePrintedPerFaceupArchives
                ? g.subId.startsWith(
                    `${ice.gainsSubroutinesBeforePrintedPerFaceupArchives.subroutine.id}-`,
                  ) ||
                  g.subId ===
                    ice.gainsSubroutinesBeforePrintedPerFaceupArchives.subroutine
                      .id
                : false,
            );
            if (
              ice.gainsSubroutinesBeforePrintedPerFaceupArchives &&
              (ice.subroutines?.length ?? 0) !== beforeLen
            ) {
              s.log.push(
                `${ice.title} — sync Archives-faceup gained subroutines (${blockchain.length} before printed).`,
              );
            }
            const wetworkN = collectHostedConditionSubsBeforePrinted(s, iceId).length;
            if (wetworkN > 0) {
              s.log.push(
                `${ice.title} — gains ${wetworkN} hosted condition subroutine(s) before printed.`,
              );
            }
            const opal = collectNextOpalSubs(s, iceId);
            if (opal.length > 0 && ice.gainsSubroutinesPerRezzedIceWithSubtype) {
              s.log.push(
                `${ice.title} — gains ${opal.length} subroutine(s) from rezzed ${ice.gainsSubroutinesPerRezzedIceWithSubtype.subtype}.`,
              );
            }
          }
          if (ice.etrSubroutinesPerRezzedAsset) {
            syncAllTourGuideSubs(s);
          }
        }
        // Mass-Driver: first N subs of this encounter do not resolve.
        if (
          typeof s.turn.massDriverSkipSubsNextEncounter === "number" &&
          s.turn.massDriverSkipSubsNextEncounter > 0 &&
          runState.encounter
        ) {
          const n = s.turn.massDriverSkipSubsNextEncounter;
          s.turn.massDriverSkipSubsNextEncounter = 0;
          const broken = runState.encounter.broken ?? [];
          for (let i = 0; i < Math.min(n, broken.length); i++) {
            broken[i] = true;
          }
          runState.encounter.broken = broken;
          // Mark as auto-skipped so they do not resolve.
          s.log.push(
            `Mass-Driver — first ${n} subroutine(s) of this encounter do not resolve.`,
          );
        }
        // Berserker: +1 strength per barrier subroutine for remainder of encounter.
        if (
          resolveIceSubtypes(s, iceId).some(
            (t) => t.toLowerCase() === "barrier",
          )
        ) {
          const subCount = ice.subroutines?.length ?? 0;
          for (const rid of s.runner.installed) {
            const br = s.cards[rid];
            const per = br?.strengthBonusPerSubroutineOnEncounteredBarrier;
            if (typeof per !== "number" || per <= 0 || subCount <= 0) continue;
            const boost = per * subCount;
            addBreakerStrengthBoostThisEncounter(s, {
              createdBy: rid,
              breakerId: rid,
              amount: boost,
            });
            s.log.push(
              `${br!.title} — +${boost} strength for this barrier encounter.`,
            );
          }
        }
        // Brainstorm: gains X "Do 1 core damage" subs = grip size for remainder of run.
        if (
          ice.gainsSubroutinesOnEncounterEqualGripSize &&
          !(runState as { tlmBrainstormApplied?: boolean }).tlmBrainstormApplied
        ) {
          const brainstorm = collectBrainstormGripSubs(s, iceId);
          const template = ice.gainsSubroutinesOnEncounterEqualGripSize;
          const prior = (ice.subroutines ?? []).filter(
            (sub) => !sub.id.startsWith(`${template.id}-`),
          );
          if (!ice.baseSubroutines) {
            ice.baseSubroutines = structuredClone(prior);
          }
          ice.subroutines = [
            ...structuredClone(ice.baseSubroutines),
            ...brainstorm.map((g) => ({
              id: g.subId,
              text: g.text,
              effect: g.effect,
            })),
          ];
          const kept = runState.encounter?.broken ?? [];
          runState.encounter = {
            iceId,
            broken: [
              ...kept.slice(
                0,
                (ice.subroutines?.length ?? 0) - brainstorm.length,
              ),
              ...brainstorm.map(() => false),
            ],
          };
          (runState as { tlmBrainstormApplied?: boolean }).tlmBrainstormApplied =
            true;
          s.log.push(
            `${ice.title} gains ${brainstorm.length} "Do 1 core damage." subroutine(s) after the others (CR ${CR.subroutineOriginExternalAfter.number}).`,
          );
        }
        syncWardenBeforeSubroutines(s, iceId);
        // Stick and Poke: first encounter each turn, ice gains a subroutine.
        if (
          !s.turn.stickAndPokeUsedThisTurn &&
          !(runState.bypassedIceIds ?? []).includes(iceId) &&
          !runState.encounter.stickAndPokeSynthetic
        ) {
          for (const rid of s.runner.installed) {
            if (abilitiesSuppressed(s, rid)) continue;
            const poke = s.cards[rid];
            const syn = poke?.firstEncounterGainsSubroutine;
            if (!syn) continue;
            s.turn.stickAndPokeUsedThisTurn = true;
            const synSub = {
              id: `${ice.defId}-stick-and-poke`,
              text: syn.text,
              effect: structuredClone(syn.effect),
            };
            // The gain lasts for this encounter only; drop a copy left
            // over from an earlier encounter before adding this one.
            ice.subroutines = [
              synSub,
              ...(ice.subroutines ?? []).filter(
                (sub) => sub.id !== synSub.id,
              ),
            ];
            runState.encounter = {
              iceId,
              broken: ice.subroutines.map(() => false),
              stickAndPokeSynthetic: true,
            };
            s.log.push(
              `${poke.title} — ${ice.title} gains "${syn.text}" this encounter.`,
            );
            break;
          }
        }
        // Sensei: other ice gains ETR after printed for remainder of run.
        if (
          (runState.senseiEtrSourceIds?.length ?? 0) > 0 &&
          !runState.senseiEtrSourceIds!.includes(iceId) &&
          !runState.encounter.senseiEtrSynthetic
        ) {
          const synSub = {
            id: `${ice.defId}-sensei-etr`,
            text: "End the run.",
            effect: {
              op: "do" as const,
              action: { kind: "end_the_run" as const },
            },
          };
          // The gain lasts for the remainder of the run; drop a copy
          // left over from an earlier run before adding this one.
          ice.subroutines = [
            ...(ice.subroutines ?? []).filter((sub) => sub.id !== synSub.id),
            synSub,
          ];
          runState.encounter = {
            ...runState.encounter,
            iceId,
            broken: ice.subroutines.map(() => false),
            senseiEtrSynthetic: true,
          };
          s.log.push(
            `Sensei — ${ice.title} gains "End the run." after its other subroutines.`,
          );
        }
        // S-Dobrado Threat: may spend click to bypass second encounter.
        if (
          runState.bypassSecondEncounterForClick &&
          runState.iceEncounteredCount === 2 &&
          !(runState.bypassedIceIds ?? []).includes(iceId) &&
          s.runner.clicks >= 1 &&
          !s.pendingChoice
        ) {
          openPendingChoose(s, {
            sourceId: runState.runSourceId ?? iceId,
            chooser: "runner",
            options: [
              {
                id: "bypass-click",
                label: "Spend [click]: bypass this ice",
                effect: {
                  op: "seq",
                  effects: [
                    {
                      op: "do",
                      action: {
                        kind: "lose_clicks",
                        side: "runner",
                        amount: 1,
                      },
                    },
                    {
                      op: "do",
                      action: { kind: "bypass_current_ice" },
                    },
                  ],
                },
              },
              {
                id: "decline",
                label: "Decline",
                effect: {
                  op: "do",
                  action: {
                    kind: "gain_credits",
                    side: "runner",
                    amount: 0,
                  },
                },
              },
            ],
            logLine: `Threat — may spend [click] to bypass ${ice.title} (second encounter).`,
          });
        }
        // Alarm Clock: may spend N clicks to bypass first encounter.
        if (
          (runState.bypassFirstEncounterForClicks ?? 0) > 0 &&
          runState.iceEncounteredCount === 1 &&
          !(runState.bypassedIceIds ?? []).includes(iceId) &&
          s.runner.clicks >= (runState.bypassFirstEncounterForClicks ?? 0) &&
          !s.pendingChoice
        ) {
          const n = runState.bypassFirstEncounterForClicks!;
          openPendingChoose(s, {
            sourceId: runState.runSourceId ?? iceId,
            chooser: "runner",
            options: [
              {
                id: "bypass-clicks",
                label: `Spend ${n} [click]: bypass this ice`,
                effect: {
                  op: "seq",
                  effects: [
                    {
                      op: "do",
                      action: {
                        kind: "lose_clicks",
                        side: "runner",
                        amount: n,
                      },
                    },
                    {
                      op: "do",
                      action: { kind: "bypass_current_ice" },
                    },
                  ],
                },
              },
              {
                id: "decline",
                label: "Decline",
                effect: {
                  op: "do",
                  action: {
                    kind: "gain_credits",
                    side: "runner",
                    amount: 0,
                  },
                },
              },
            ],
            logLine: `Alarm Clock — may spend ${n} [click] to bypass ${ice.title} (first encounter).`,
          });
        }
        s.log.push(
          `Encounter ${ice.title} (appendix 11.4_3_a / CR 6.5.1) with ${(ice.subroutines ?? subs).length} subroutine(s).`,
        );
        // Gantulga: first encounter each turn with ice on the named server.
        if (!s.turn.gantulgaEncounterIceId) {
          for (const rid of s.runner.installed) {
            if (abilitiesSuppressed(s, rid)) continue;
            const g = s.cards[rid];
            if (
              !(g.firstEncounterSubsBecomeNetDamage ?? 0) ||
              !g.namedServerId
            ) {
              continue;
            }
            if (g.namedServerId !== runState.attackedServerId) continue;
            if ((runState.bypassedIceIds ?? []).includes(iceId)) continue;
            s.turn.gantulgaEncounterIceId = iceId;
            s.log.push(
              `${g.title} — first encounter with ice protecting ${g.namedServerId}; subs become net damage.`,
            );
            break;
          }
        }
        // Kit: first encounter each turn, ice gains code gate
        const runnerId = s.cards[s.runner.identityId];
        if (
          runnerId?.firstEncounterGainsCodeGate &&
          !abilitiesSuppressed(s, s.runner.identityId) &&
          !s.turn.firstEncounterUsedThisTurn
        ) {
          s.turn.firstEncounterUsedThisTurn = true;
          if (!(ice.subtypes ?? []).includes("code gate")) {
            ice.subtypes = [...(ice.subtypes ?? []), "code gate"];
            s.log.push(
              `${runnerId.title} — ${ice.title} gains code gate this run.`,
            );
          }
        }
        syncHostedSubBoost(s, iceId);
        if (
          ice.onEncounter &&
          !abilitiesSuppressed(s, iceId) &&
          !(runState.bypassedIceIds ?? []).includes(iceId) &&
          !runState.skipOnEncounterOnce
        ) {
          // Defer while a bypass can end this encounter (CR 9.2.8f), or for
          // when_encountered_interrupt (AirbladeX). Otherwise fire now.
          runState.encounter!.onEncounterPending = true;
          if (
            !runnerHasWhenEncounteredInterrupt(s) &&
            !chosenIceBypassOffered(s, iceId) &&
            !securityNexusTraceOffered(s)
          ) {
            resolvePendingOnEncounter(s);
          }
        }
        // Baklan: first actual encounter each run — queue for 10.3.1a.
        if (!(runState.bypassedIceIds ?? []).includes(iceId)) {
          noteFirstEncounterEachRun(s);
        }
        // Chisel-class trojans + Eavesdrop-class conditions: onHostEncounter.
        if (
          !s.pendingChoice &&
          !(runState.bypassedIceIds ?? []).includes(iceId)
        ) {
          noteHostEncounter(s, iceId);
        }
        if (runState.skipOnEncounterOnce) {
          runState.skipOnEncounterOnce = false;
        }
        // ZATO City Grid: protecting ice gains may-trash-to-resolve-chosen-sub.
        if (
          !s.pendingChoice &&
          !(runState.bypassedIceIds ?? []).includes(iceId) &&
          (ice.subroutines ?? []).length > 0
        ) {
          const sid = runState.attackedServerId;
          const root = s.servers[sid]?.root ?? [];
          for (const rid of root) {
            const up = s.cards[rid];
            if (
              !up?.rezzed ||
              !up.iceGainsTrashToResolveChosenSubOnEncounter ||
              abilitiesSuppressed(s, rid)
            ) {
              continue;
            }
            const options: Array<{
              id: string;
              label: string;
              effect: import("../effects/ir.js").Effect;
            }> = (ice.subroutines ?? []).map((sub, i) => ({
              id: `zato:${i}`,
              label: `Trash ${ice.title} to resolve "${sub.text}"`,
              effect: {
                op: "do" as const,
                action: {
                  kind: "trash_encounter_ice_resolve_subroutine" as const,
                  subIndex: i,
                },
              },
            }));
            options.push({
              id: "decline",
              label: "Decline",
              effect: {
                op: "do",
                action: { kind: "gain_credits", side: "corp", amount: 0 },
              },
            });
            openPendingChoose(s, {
              sourceId: rid,
              chooser: "corp",
              options,
              logLine: `${up.title} — may trash ${ice.title} to resolve a subroutine.`,
            });
            break;
          }
        }
        // Femme Fatale: may pay 1¢ per sub to bypass chosen ice.
        if (!(runState.bypassedIceIds ?? []).includes(iceId)) {
          // Rigged Results: first encounter of chosen ice → auto-bypass.
          if (
            s.turn.ftmRiggedResultsBypassIceId === iceId &&
            !(runState.bypassedIceIds ?? []).includes(iceId)
          ) {
            s.turn.ftmRiggedResultsBypassIceId = undefined;
            openPendingChoose(s, {
              sourceId: iceId,
              chooser: "runner",
              options: [
                {
                  id: "rr-bypass",
                  label: `Bypass ${ice.title} (Rigged Results)`,
                  effect: {
                    op: "do",
                    action: { kind: "bypass_current_ice" },
                  },
                },
              ],
              logLine: `Rigged Results — bypass ${ice.title}.`,
            });
          } else
          for (const rid of s.runner.installed) {
            const femme = s.cards[rid];
            if (femme.chosenIceId !== iceId) continue;
            const n = (ice.subroutines ?? []).length;
            const cost = n;
            if (s.runner.credits >= cost) {
              openPendingChoose(s, {
                sourceId: rid,
                chooser: "runner",
                options: [
                  {
                    id: "bypass",
                    label: `Bypass ${ice.title} for ${cost}¢`,
                    effect: {
                      op: "seq",
                      effects: [
                        {
                          op: "do",
                          action: {
                            kind: "lose_credits",
                            side: "runner",
                            amount: cost,
                          },
                        },
                        {
                          op: "do",
                          action: { kind: "bypass_current_ice" },
                        },
                      ],
                    },
                  },
                  {
                    id: "decline",
                    label: "Decline",
                    effect: {
                      op: "do",
                      action: {
                        kind: "gain_credits",
                        side: "runner",
                        amount: 0,
                      },
                    },
                  },
                ],
                logLine: `${femme.title} — may pay ${cost}¢ to bypass ${ice.title}.`,
              });
            }
            break;
          }
        }
        if (!s.pendingChoice && securityNexusTraceOffered(s) && s.run?.encounter) {
          for (const rid of s.runner.installed) {
            const nexus = s.cards[rid];
            if (!nexus?.paidAbilities?.some((ability) => ability.id === "security-nexus-trace")) {
              continue;
            }
            openPendingChoose(s, {
              sourceId: rid,
              chooser: "runner",
              options: [
                {
                  id: "nexus-trace",
                  label: "Trace 5 — success gives a tag and ends the run",
                  effect: {
                    op: "do",
                    action: { kind: "trace_bypass_or_tag_etr" },
                  },
                },
                {
                  id: "decline",
                  label: "Decline",
                  effect: {
                    op: "do",
                    action: { kind: "gain_credits", side: "runner", amount: 0 },
                  },
                },
              ],
              logLine: `${nexus.title} — may trace at the start of this encounter (CR ${CR.runEndsCloseReactionWindow.number}).`,
            });
            break;
          }
        }
        checkpointAfterInstruction(s, "run.encounter");
      },
    },
  ),
    "run.encounterPaw": run(
    "run.encounterPaw",
    "sec_appendix_timing_structure_of_a_run_3_b",
    "11.4_3_b",
    "Paid ability window: (P) and subroutines can be broken.",
    "pass",
    "run.checkSubs",
    {
      allows: ["break_subroutine", "break_bioroid_subroutine", "use_paid_ability", "pass_window"],
      onResolve: (s) => {
        noteOutsidePoolSpendTriggers(s);
        if ((s.turn.outsidePoolSpendPending ?? []).length > 0) {
          checkpointAfterInstruction(s, "run.encounterPaw");
        }
      },
    },
  ),
  "run.checkSubs": run(
    "run.checkSubs",
    "sec_appendix_timing_structure_of_a_run_3_c",
    "11.4_3_c",
    "Are there unbroken subroutines to resolve?",
    "branch",
    (s) => {
      const enc = s.run!.encounter!;
      if (s.cards[enc.iceId]?.dynamicEtrSubroutineCountFromCorpHandSize) {
        syncCorpHandSizeSubroutines(s, enc.iceId);
      }
      const hasUnbroken = enc.broken.some((b) => !b);
      return hasUnbroken ? "run.resolveSub" : "run.movement";
    },
  ),
  "run.resolveSub": run(
    "run.resolveSub",
    "sec_appendix_timing_structure_of_a_run_3_c_i",
    "11.4_3_c_i",
    "If yes, the Corp resolves the next one.",
    "auto",
    (s) => {
      // Shiro-class: nested mid-encounter breach armed during this sub.
      if (s.run?.nestedBreachFromEncounter && s.run.phase === "breach") {
        return "breach.begin";
      }
      return s.run!.endedTheRun ? "run.closePriorityWindows" : "run.checkSubs";
    },
    {
      onResolve: (s) => {
        const runState = s.run!;
        const enc = runState.encounter!;
        const ice = s.cards[enc.iceId];
        if (!ice) return;
        if (maybeOfferSubroutineOrder(s)) return;
        const subs = ice.subroutines ?? [];
        const idx = takeNextSubroutineIndex(s);
        if (idx < 0) return;
        const sub = subs[idx];
        // Tracker: prevent the first subroutine that would resolve this run.
        if (runState.quTrackerPreventFirstSubroutine) {
          runState.quTrackerPreventFirstSubroutine = false;
          enc.broken[idx] = true;
          s.log.push(
            `Tracker — prevent subroutine "${sub.text}" from resolving.`,
          );
          return;
        }
        // Mark resolved (fired) so we do not re-fire; unbroken means not broken by runner.
        enc.broken[idx] = true;
        enc.subroutinesResolved = (enc.subroutinesResolved ?? 0) + 1;
        // Gantulga replacement: first named-server encounter → Do N net damage.
        let replaced = false;
        if (s.turn.gantulgaEncounterIceId === enc.iceId) {
          for (const rid of s.runner.installed) {
            if (abilitiesSuppressed(s, rid)) continue;
            const g = s.cards[rid];
            const n = g.firstEncounterSubsBecomeNetDamage ?? 0;
            if (n <= 0 || !g.namedServerId) continue;
            if (g.namedServerId !== runState.attackedServerId) continue;
            s.log.push(
              `Resolve subroutine "${sub.text}" as "Do ${n} net damage." from ${ice.title} (CR ${CR.replaceSubroutineResolution.number}).`,
            );
            const r = evalEffect(
              { state: s, sourceId: ice.id },
              {
                op: "do",
                action: { kind: "net_damage", amount: n },
              },
            );
            if (!r.ok) {
              s.log.push(`Gantulga net damage failed: ${r.error}`);
            }
            replaced = true;
            break;
          }
        }
        if (!replaced) {
          if (!ice.zone.endsWith(":ice")) {
            s.log.push(
              `${ice.title}'s subroutines are active (CR ${CR.encounterNotInstalled.number}).`,
            );
          }
          s.log.push(
            `Resolve subroutine "${sub.text}" (appendix 11.4_3_c_i / CR 6.5.5).`,
          );
          const threatLvl = ice.threatCannotSpendCreditsDuringSubs;
          let blockedSpend = false;
          if (threatLvl !== undefined) {
            const pts = Math.max(
              agendaPointsFor(s, "corp"),
              agendaPointsFor(s, "runner"),
            );
            if (pts >= threatLvl) {
              runState.runnerCannotSpendCredits = true;
              blockedSpend = true;
              s.log.push(
                `${ice.title} — Threat ${threatLvl}: Runner cannot spend credits while this subroutine resolves.`,
              );
            }
          }
          const r = evalEffect({ state: s, sourceId: ice.id }, sub.effect);
          if (!r.ok) {
            s.log.push(`Subroutine effect failed: ${r.error}`);
          }
          // The subroutine is still resolving during its damage interrupt, so
          // the Runner still cannot spend credits there (CR 9.1.2b).
          if (blockedSpend && !s.pendingChoice && !s.pendingDamage) {
            runState.runnerCannotSpendCredits = false;
          }
          // Shiro-class: Corp could not pay → arm nested breach; next() diverts.
          armNestedBreachIfPending(s);
        }
        // Raindrops Cut Stone: +power on run source whenever a sub resolves
        // (including ETR — counter is placed before run.ends).
        const n = runState.addPowerCounterOnSubroutineResolve ?? 0;
        const srcId = runState.runSourceId;
        if (n > 0 && srcId && s.cards[srcId]) {
          const src = s.cards[srcId]!;
          src.powerCounters = (src.powerCounters ?? 0) + n;
          s.log.push(
            `Place ${n} power counter(s) on ${src.title} → ${src.powerCounters}.`,
          );
        }
        runState.subroutineResolvedThisRun = true;
      },
    },
  ),
  "run.movement": run(
    "run.movement",
    "sec_appendix_timing_structure_of_a_run_4_a",
    "11.4_4_a",
    "If the run got here from (2) or (3), the Runner passes ice.",
    "auto",
    (s) => {
      // Decline Sisyphus offer without paying.
      if (s.run?.pendingReencounterIceId && !s.run.reencounterIceId) {
        s.run.pendingReencounterIceId = undefined;
      }
      const iceId = s.run?.reencounterIceId;
      if (iceId && s.run) {
        const server = s.servers[s.run.attackedServerId];
        const pos = server.ice.indexOf(iceId);
        if (pos >= 0) {
          s.run.position = pos;
          s.run.reencounterIceId = undefined;
          s.log.push(
            `Sisyphus — Runner encounters ${s.cards[iceId]?.title ?? iceId} again.`,
          );
          return "run.approachIce";
        }
        // Konjin / cross-server forced encounter via forceEncounterIceId.
        if (s.run.forceEncounterIceId === iceId || s.run.resumeEncounterIceId) {
          s.run.reencounterIceId = undefined;
          s.log.push(
            `Forced encounter — Runner encounters ${s.cards[iceId]?.title ?? iceId}.`,
          );
          return "run.approachIce";
        }
        s.run.reencounterIceId = undefined;
      }
      // Awakening Center-class: hosted-ice forced encounter ends — there is
      // no parent ice encounter to resume (the "parent" is an upgrade).
      // Fall through to normal run continuation (jack-out then re-approach).
      if (s.run?.resumeEncounterIceId) {
        const parentIdCheck = s.run.resumeEncounterIceId;
        const parentCheck = s.cards[parentIdCheck];
        if (parentCheck && parentCheck.type !== "ice") {
          s.run.resumeEncounterIceId = undefined;
          s.run.suspendedEncounter = undefined;
          s.log.push(
            `Forced encounter with hosted ice ends — resume run (${parentCheck.title}).`,
          );
        }
      }
      // Konjin-class: resume parent ice encounter after nested encounter ends.
      if (s.run?.resumeEncounterIceId) {
        const parentId = s.run.resumeEncounterIceId;
        const parent = s.cards[parentId];
        const stillRezzed =
          parent?.type === "ice" &&
          parent.rezzed &&
          Object.values(s.servers).some((srv) => srv.ice.includes(parentId));
        s.run.resumeEncounterIceId = undefined;
        if (stillRezzed) {
          const host = Object.values(s.servers).find((srv) =>
            srv.ice.includes(parentId),
          );
          if (host && host.id === s.run.attackedServerId) {
            s.run.position = host.ice.indexOf(parentId);
          }
          if (s.run.suspendedEncounter?.iceId === parentId) {
            s.run.encounter = s.run.suspendedEncounter;
          } else {
            const subs = parent.subroutines ?? [];
            s.run.encounter = {
              iceId: parentId,
              broken: subs.map(() => false),
            };
          }
          s.run.suspendedEncounter = undefined;
          s.run.skipOnEncounterOnce = true;
          s.log.push(
            `Resume encounter with ${parent.title} after nested encounter.`,
          );
          return "run.encounterPaw";
        }
        s.run.suspendedEncounter = undefined;
        s.log.push(
          `Cannot resume encounter — ${parent?.title ?? parentId} no longer rezzed.`,
        );
      }
      // Ganked!-class: after forced mid-access encounter, resume access.
      if (s.run?.resumeAccessAfterReencounter && s.run.accessingCardId) {
        s.run.resumeAccessAfterReencounter = false;
        s.log.push(
          `Resume access after forced encounter (Ganked!-class).`,
        );
        return "access.midAccess";
      }
      return "run.passIcePaw";
    },
    {
      onResolve: (s) => {
        const runState = s.run!;
        const pos = runState.position;
        if (pos !== null) {
          const iceId = s.servers[runState.attackedServerId].ice[pos];
          if (iceId) {
            const iceAtPosition = s.cards[iceId];
            const brokenNow = runState.encounter?.broken ?? [];
            // Mirāju replaces passing this ice with a move (CR 6.1.3e).
            const passReplaced =
              Boolean(iceAtPosition?.onEncounterEndIfPrintedSubroutineBroken) &&
              Boolean(iceAtPosition?.rezzed) &&
              runState.encounter?.iceId === iceId &&
              brokenNow.some(Boolean);
            runState.passReplacedByEncounterEnd = passReplaced;
            if (passReplaced) {
              s.log.push(
                `${iceAtPosition?.title ?? "Ice"} is not passed — the encounter-end replacement moved the Runner (CR ${CR.runPhaseAfter.number}).`,
              );
            }
            if (!passReplaced) {
            // Count every pass (rezzed, unrezzed, or bypassed → movement).
            runState.passedIceIds = [
              ...(runState.passedIceIds ?? []),
              iceId,
            ];
            }
            // The Gauntlet: track fully broken ice protecting HQ this run.
            if (
              runState.attackedServerId === "hq" &&
              (Boolean(runState.encounter?.fullyBrokenByRunner) ||
                ((runState.encounter?.broken?.length ?? 0) > 0 &&
                  (runState.encounter?.broken ?? []).every(Boolean)))
            ) {
              runState.inFullyBrokenHqProtectingIceIds = [
                ...(runState.inFullyBrokenHqProtectingIceIds ?? []),
                iceId,
              ];
            }
            // Khan: first pass ice each turn — queue for 10.3.1a.
            noteFirstPassIce(s);
            const ice = s.cards[iceId];
            if (!ice.rezzed) {
              s.turn.currentRunPassedUnrezzedIceIds = [
                ...(s.turn.currentRunPassedUnrezzedIceIds ?? []),
                iceId,
              ];
              runState.lastPassedUnrezzedIceId = iceId;
              notePassUnrezzedIce(s);
            } else if (ice.rezzed && !passReplaced) {
              runState.lastPassedRezzedIceId = iceId;
              notePassRezzedIce(s);
              // Mass-Driver: fully break → next encounter first N subs do not resolve.
              if (runState.encounter?.fullyBrokenByRunner) {
                for (const rid of [...s.runner.installed]) {
                  const br = s.cards[rid];
                  const n = br?.fullyBreakNextEncounterFirstNSubsDoNotResolve;
                  if (typeof n === "number" && n > 0) {
                    s.turn.massDriverSkipSubsNextEncounter = n;
                    s.log.push(
                      `${br!.title} — first ${n} sub(s) of next encounter this run do not resolve.`,
                    );
                  }
                }
              }
              // Inversificator: first time each turn after fully breaking, may swap.
              if (
                !runState.passReplacedByEncounterEnd &&
                !s.turn.inversificatorSwapUsedThisTurn &&
                !s.pendingChoice &&
                runState.encounter?.fullyBrokenByRunner &&
                runState.encounter.iceId === iceId
              ) {
                for (const rid of [...s.runner.installed]) {
                  const br = s.cards[rid];
                  if (!br?.inversificatorSwapIceAfterFullyBrokeOncePerTurn) {
                    continue;
                  }
                  if (abilitiesSuppressed(s, rid)) continue;
                  s.turn.inversificatorSwapUsedThisTurn = true;
                  noteInlineConditional(s, {
                    cardId: rid,
                    abilityKey: "inversificator-may-swap-passed-ice",
                    controller: "runner",
                    mandatory: true,
                    effect: {
                      op: "do",
                      action: {
                        kind: "may_swap_passed_ice",
                        iceId,
                      },
                    },
                    logLine: `${br.title} becomes pending — fully broke ice (may swap).`,
                  });
                  break;
                }
              }
            }
            if (
              (ice.subtypes ?? []).includes("bioroid") &&
              ice.rezzed
            ) {
              // HB Architects: first pass of rezzed bioroid each turn.
              const idCard = s.cards[s.corp.identityId];
              if (
                idCard?.rezBioroidDiscountOnFirstPass &&
                !s.turn.bioroidPassedThisTurn
              ) {
                s.turn.bioroidPassedThisTurn = true;
                s.turn.pendingBioroidRezDiscount =
                  idCard.rezBioroidDiscountOnFirstPass;
                s.log.push(
                  `${idCard.title} — may rez a bioroid paying ${idCard.rezBioroidDiscountOnFirstPass}¢ less.`,
                );
              }
            }
            // Phoneutria-class onPass / Pichação onPassHost — queue for 10.3.1a.
            if (
              ice.rezzed &&
              !(runState.bypassedIceIds ?? []).includes(iceId)
            ) {
              if (ice.onPass && !abilitiesSuppressed(s, iceId)) {
                noteIceOnPass(s, iceId);
              }
              notePassHost(s, iceId);
            }
            // Cloud Eater: encounter end if rezzed this turn — queue for 10.3.1a.
            if (
              ice.onEncounterEndIfRezzedThisTurn &&
              (s.turn.rezzedThisTurnIds ?? []).includes(iceId) &&
              !(runState.bypassedIceIds ?? []).includes(iceId)
            ) {
              noteEncounterEndIfRezzedThisTurn(s, iceId);
            }
            // Knowledge Seeker: whenever an encounter with this ice ends.
            noteEncounterEndIfRezzed(s, iceId);
            // Anansi: encounter ends without full break → net damage.
            if (
              ice.onEncounterEndIfNotFullyBroken &&
              ice.rezzed &&
              !runState.encounter?.fullyBrokenByRunner
            ) {
              noteEncounterEndIfNotFullyBroken(s, iceId);
            }
            // Mirāju: if Runner broke printed subroutine, redirect to Archives.
            if (
              ice.onEncounterEndIfPrintedSubroutineBroken &&
              ice.rezzed &&
              runState.encounter
            ) {
              const printedCount = (ice.baseSubroutines ?? ice.subroutines ?? []).length;
              // Printed subs are the trailing baseSubroutines if Loki-style
              // copies were prepended; for Mirāju base = printed.
              const broken = runState.encounter.broken ?? [];
              const printedBroken = broken
                .slice(Math.max(0, broken.length - printedCount))
                .some(Boolean);
              // Simpler: any broken sub counts as printed for Mirāju (single printed sub).
              const anyBroken = broken.some(Boolean);
              if (printedBroken || anyBroken) {
                noteEncounterEndIfPrintedSubroutineBroken(s, iceId);
              }
            }
            // Weyland Builder of Nations: first advanced-ice encounter end → 1 meat.
            if (
              !s.turn.bmFirstAdvancedIceEncounterEndMeatUsed &&
              (ice.advancementCounters ?? 0) > 0
            ) {
              const idCard = s.cards[s.corp.identityId];
              if (idCard?.firstAdvancedIceEncounterEndMeatDamageEachTurn) {
                s.turn.bmFirstAdvancedIceEncounterEndMeatUsed = true;
                noteInlineConditional(s, {
                  cardId: idCard.id,
                  abilityKey: "first-advanced-ice-encounter-end-meat",
                  controller: "corp",
                  mandatory: true,
                  effect: { op: "do", action: { kind: "meat_damage", amount: 1 } },
                  logLine: `${idCard.title} becomes pending — first advanced ice encounter ends (meat damage).`,
                });
              }
            }
            // Chum: if that boosted encounter ended without fully breaking → net.
            if (
              runState.chumActiveEncounter &&
              runState.chumActiveEncounter.iceId === iceId
            ) {
              const chumEnc = runState.chumActiveEncounter;
              runState.chumActiveEncounter = undefined;
              const fully =
                Boolean(runState.encounter?.fullyBrokenByRunner) ||
                ((runState.encounter?.broken?.length ?? 0) > 0 &&
                  (runState.encounter?.broken ?? []).every(Boolean));
              if (!fully && chumEnc.netDamageIfNotFullyBroken > 0) {
                const amount = chumEnc.netDamageIfNotFullyBroken;
                createPendingAbilityInstance(s, {
                  abilityKey: "chum:net-on-run-end",
                  sourceId: chumEnc.chumSourceId,
                  controller: "corp",
                  mandatory: true,
                  payload: { kind: "chum_net_damage", amount },
                });
                s.log.push(
                  `Chum — ${amount} net damage becomes pending for the Run Ends Phase (CR ${CR.runEndsCondition.number}).`,
                );
              }
            }
            // Chief Slee: place power per unbroken sub when any encounter ends.
            {
              const unbroken = (runState.encounter?.broken ?? []).filter(
                (b) => !b,
              ).length;
              if (unbroken > 0) {
                for (const server of Object.values(s.servers)) {
                  for (const rid of server.root) {
                    const asset = s.cards[rid];
                    if (
                      !asset?.rezzed ||
                      !asset.placePowerPerUnbrokenSubOnAnyEncounterEnd
                    ) {
                      continue;
                    }
                    asset.powerCounters =
                      (asset.powerCounters ?? 0) + unbroken;
                    s.log.push(
                      `${asset.title} — place ${unbroken} power (unbroken subs on ${ice.title}) → ${asset.powerCounters}.`,
                    );
                  }
                }
              }
            }
            // Mason Bellamy: broke ≥1 sub → Runner loses [click].
            const brokeAny = (runState.encounter?.broken ?? []).some(Boolean);
            if (brokeAny) {
              const server = s.servers[runState.attackedServerId];
              for (const rid of server?.root ?? []) {
                const up = s.cards[rid];
                if (!up?.rezzed || !up.loseClickOnProtectingIceEncounterEndIfBroke) {
                  continue;
                }
                if (s.runner.clicks > 0) {
                  s.runner.clicks -= 1;
                  s.turn.runnerClicksSpentThisTurn += 1;
                  noteRunnerClickLose(s);
                }
                s.log.push(
                  `${up.title} — Runner loses [click] (broke a subroutine on ${ice.title}).`,
                );
              }
            }
            // Crypsis: if this breaker broke a sub, remove 1 virus or trash.
            // Tycoon: Corp gains credits if this breaker broke a sub.
            // Brahman: add installed non-virus program to stack top.
            const brokeBreakers =
              runState.encounter?.breakersThatBrokeThisEncounter ?? [];
            for (const bid of brokeBreakers) {
              const br = s.cards[bid];
              if (!br) continue;
              if (typeof br.corpGainsCreditsOnEncounterEndIfBroke === "number") {
                const n = br.corpGainsCreditsOnEncounterEndIfBroke;
                s.corp.credits += n;
                s.log.push(
                  `${br.title} — Corp gains ${n}¢ (broke a subroutine).`,
                );
              }
              if (br.addInstalledNonVirusProgramToStackTopOnEncounterEndIfBroke) {
                noteInlineConditional(s, {
                  cardId: bid,
                  abilityKey: "brahman-add-nonvirus-to-stack-top-on-encounter-end",
                  controller: "runner",
                  mandatory: true,
                  effect: {
                    op: "do",
                    action: { kind: "add_nonvirus_program_to_stack_top" },
                  },
                  logLine: `${br.title} becomes pending — encounter end after break (add non-virus to stack).`,
                });
              }
              if (!br.removeVirusOrTrashOnEncounterEndIfBroke) continue;
              if ((br.virusCounters ?? 0) >= 1) {
                br.virusCounters = (br.virusCounters ?? 0) - 1;
                s.log.push(
                  `${br.title} — remove 1 virus counter (broke a subroutine).`,
                );
              } else {
                removeCardFromCurrentZone(s, bid);
                s.runner.discardPile.push(bid);
                br.zone = "runner:heap";
                br.faceup = true;
                s.log.push(
                  `${br.title} — trash (broke a subroutine; no virus counters).`,
                );
              }
            }
            // Oversight AI: all host subs broken → trash host ice.
            const allBroken =
              (runState.encounter?.broken ?? []).length > 0 &&
              (runState.encounter?.broken ?? []).every(Boolean);
            if (allBroken) {
              // Fractal Threat Matrix: trash top N of stack.
              const server = s.servers[runState.attackedServerId];
              if (server) {
                for (const rid of server.root) {
                  const up = s.cards[rid];
                  const n = up?.rezzed
                    ? up.trashTopOfStackWhenAllSubsBrokenOnProtectingIce
                    : undefined;
                  if (!n) continue;
                  for (let i = 0; i < n; i++) {
                    const top = s.runner.deck.shift();
                    if (!top) break;
                    s.runner.discardPile.push(top);
                    const tc = s.cards[top];
                    if (tc) {
                      tc.zone = "runner:heap";
                      tc.faceup = true;
                    }
                    s.log.push(
                      `${up!.title} — trash top of stack (${tc?.title ?? top}).`,
                    );
                  }
                }
              }
              for (const hid of ice.hostedCardIds ?? []) {
                const cond = s.cards[hid];
                if (!cond?.trashHostIfAllSubsBrokenThisEncounter) continue;
                removeCardFromCurrentZone(s, iceId);
                s.corp.discardPile.push(iceId);
                ice.zone = "corp:archives";
                ice.faceup = true;
                ice.rezzed = false;
                // Hosted condition goes with the ice to Archives.
                for (const cid of [...(ice.hostedCardIds ?? [])]) {
                  const hosted = s.cards[cid];
                  if (!hosted) continue;
                  removeCardFromCurrentZone(s, cid);
                  s.corp.discardPile.push(cid);
                  hosted.zone = "corp:archives";
                  hosted.faceup = true;
                  hosted.hostId = undefined;
                }
                ice.hostedCardIds = [];
                s.log.push(
                  `${cond.title} — trash host ${ice.title} (all subroutines broken).`,
                );
                break;
              }
            }
            // Stick and Poke: remove synthetic subroutine after encounter.
            if (runState.encounter?.stickAndPokeSynthetic) {
              const synId = `${ice.defId}-stick-and-poke`;
              ice.subroutines = (ice.subroutines ?? []).filter(
                (sub) => sub.id !== synId,
              );
              runState.encounter.stickAndPokeSynthetic = false;
            }
            // Sensei: remove synthetic ETR after encounter.
            if (runState.encounter?.senseiEtrSynthetic) {
              const synId = `${ice.defId}-sensei-etr`;
              ice.subroutines = (ice.subroutines ?? []).filter(
                (sub) => sub.id !== synId,
              );
              runState.encounter.senseiEtrSynthetic = false;
            }
            // Sipa: pass outermost after fully breaking → may swap.
            if (
              runState.position === 0 &&
              runState.encounter?.fullyBrokenByRunner &&
              !s.turn.sipaSwapUsedThisTurn &&
              !s.pendingChoice
            ) {
              for (const rid of s.runner.installed) {
                const sipa = s.cards[rid];
                if (!sipa?.maySwapOutermostIceOnPassAfterFullyBreakOncePerTurn) {
                  continue;
                }
                s.turn.sipaSwapUsedThisTurn = true;
                noteInlineConditional(s, {
                  cardId: rid,
                  abilityKey: "sipa-may-swap-outermost-ice-on-pass",
                  controller: "runner",
                  mandatory: true,
                  effect: {
                    op: "do",
                    action: { kind: "may_swap_ice_with_other_installed" },
                  },
                  logLine: `${sipa.title} becomes pending — pass outermost after full break (may swap).`,
                });
                break;
              }
            }
            // Mumbad City Grid: may swap passed ice with another protecting same server.
            if (!s.pendingChoice) {
              const server = s.servers[runState.attackedServerId];
              if (server && server.ice.includes(iceId) && server.ice.length > 1) {
                for (const rid of server.root) {
                  const grid = s.cards[rid];
                  if (!grid?.rezzed || !grid.onPassIceProtectingThisServerMaySwap) {
                    continue;
                  }
                  const others = server.ice.filter((id) => id !== iceId);
                  openPendingChoose(s, {
                    sourceId: rid,
                    chooser: "corp",
                    options: [
                      ...others.map((oid) => ({
                        id: `mumbad-swap:${oid}`,
                        label: `Swap with ${s.cards[oid]!.title}`,
                        effect: {
                          op: "do" as const,
                          action: {
                            kind: "swap_mumbad_passed_ice" as const,
                            iceId,
                            otherIceId: oid,
                          },
                        },
                      })),
                      {
                        id: "decline",
                        label: "Decline",
                        effect: {
                          op: "do" as const,
                          action: {
                            kind: "gain_credits" as const,
                            side: "corp" as const,
                            amount: 0,
                          },
                        },
                      },
                    ],
                    logLine: `${grid.title} — may swap ${ice.title} with another ice on this server.`,
                  });
                  break;
                }
              }
            }
            // Sisyphus: first pass of rezzed code gate or sentry — 10.3.1a.
            noteSisyphusFirstPass(s, iceId);
            // Code Replicator / The Twins: pass rezzed ice protecting this server.
            if (ice.rezzed && !runState.passReplacedByEncounterEnd) {
              s.turn.cotcLastPassedIceId = iceId;
              notePassRezzedIceProtectingServer(s, runState.attackedServerId);
            }
          }
        }
        s.run!.phase = "movement";
        // Checkpoint while encounter facts still hold (Persephone reads
        // subroutinesResolved / ice subtypes from run.encounter — CR 10.3.1a).
        checkpointAfterInstruction(s, "run.movement");
        // Anvil: clear encounter-scoped break forbid (not Trieste lasting forbid).
        if (
          pos !== null &&
          runState.encounter?.forbidRunnerBreakThisEncounter
        ) {
          const iceId = s.servers[runState.attackedServerId].ice[pos];
          if (iceId) {
            const ice = s.cards[iceId];
            if (ice) ice.cannotBreakWithRunnerCardAbilities = false;
          }
        }
        // Banner / VSA encounter-scoped flags clear with encounter teardown.
        s.run!.encounter = null;
        s.run!.usedAbilitiesThisEncounter = [];
        s.run!.runnerCannotSpendCredits = false;
        s.log.push(`Pass ice / move inward (appendix 11.4_4).`);
      },
    },
  ),
  "run.passIcePaw": run(
    "run.passIcePaw",
    "sec_appendix_timing_structure_of_a_run_4_b",
    "11.4_4_b",
    "Paid ability window: (P).",
    "pass",
    "run.jackOutWindow",
    { allows: ["use_paid_ability", "pass_window"] },
  ),
  "run.jackOutWindow": run(
    "run.jackOutWindow",
    "sec_appendix_timing_structure_of_a_run_4_c",
    "11.4_4_c",
    "The Runner may jack out.",
    "pass",
    "run.moveInward",
    { allows: ["jack_out", "continue_run", "pass_window"] },
  ),
  "run.moveInward": run(
    "run.moveInward",
    "sec_appendix_timing_structure_of_a_run_4_d",
    "11.4_4_d",
    "The Runner moves 1 position inward, if possible.",
    "auto",
    "run.afterMovePaw",
    {
      onResolve: (s) => {
        const runState = s.run!;
        const server = s.servers[runState.attackedServerId];
        if (runState.position === null) return;
        const nextPos = runState.position + 1;
        if (nextPos < server.ice.length) {
          runState.position = nextPos;
        } else {
          runState.position = null;
        }
      },
    },
  ),
  "run.afterMovePaw": run(
    "run.afterMovePaw",
    "sec_appendix_timing_structure_of_a_run_4_e",
    "11.4_4_e",
    "Paid ability window: (P) (R).",
    "pass",
    "run.afterMove",
    { allows: ["use_paid_ability", "rez_asset", "pass_window"] },
  ),
  "run.afterMove": run(
    "run.afterMove",
    "sec_appendix_timing_structure_of_a_run_4_f",
    "11.4_4_f",
    "Did the Runner move to a new position?",
    "branch",
    (s) =>
      s.run!.position !== null ? "run.approachIce" : "run.approachServer",
  ),
  "run.approachServer": run(
    "run.approachServer",
    "sec_appendix_timing_structure_of_a_run_4_g",
    "11.4_4_g",
    "The Runner approaches the server.",
    "auto",
    (s) => {
      if (s.run?.endedTheRun) {
        return "run.closePriorityWindows";
      }
      if (s.pendingChoice) {
        return "run.approachServerPaw";
      }
      // Letheia-class: redirected back to outermost ice during approach.
      if (s.run!.position !== null) {
        return "run.approachIce";
      }
      const sid = s.run!.attackedServerId;
      const server = s.servers[sid];
      for (const id of server.root) {
        const card = s.cards[id];
        if (!card.rezzed && (card.type === "upgrade" || card.type === "asset")) {
          return "run.approachServerPaw";
        }
        if (
          !abilitiesSuppressed(s, id) &&
          card.rezzed &&
          (card.paidAbilities ?? []).some((a) =>
            a.windows.includes("approach_server_paw"),
          )
        ) {
          return "run.approachServerPaw";
        }
      }
      // Formicary-class: unrezzed ice on any server may respond at approach.
      for (const srv of Object.values(s.servers)) {
        for (const id of srv.ice) {
          const card = s.cards[id];
          if (
            card &&
            !card.rezzed &&
            !abilitiesSuppressed(s, id) &&
            (card.paidAbilities ?? []).some(
              (a) =>
                a.formicaryApproachAnyServer &&
                a.windows.includes("approach_server_paw"),
            )
          ) {
            return "run.approachServerPaw";
          }
        }
      }
      return "run.success";
    },
    {
      onResolve: (s) => {
        if (s.run!.endedTheRun || !s.servers[s.run!.attackedServerId]) {
          s.log.push(`Approach server (appendix 11.4_4_g).`);
          return;
        }
        s.run!.phase = "success";
        s.log.push(`Approach server (appendix 11.4_4_g).`);
        if (!s.pendingChoice) onPassedAllIce(s);
        // Awakening Center: whenever the Runner passes all ice protecting
        // this server (this is exactly that moment — position is null and
        // the run has arrived here), may rez 1 hosted bioroid ice for −7¢
        // and force the Runner to encounter it. Fires once per run per
        // upgrade (the run re-enters this step after the forced encounter).
        if (!s.pendingChoice) {
          const sid0 = s.run!.attackedServerId;
          const server0 = s.servers[sid0];
          for (const id of server0.root) {
            if (abilitiesSuppressed(s, id)) continue;
            const card = s.cards[id];
            if (!card?.rezzed || !card.hostsBioroidIceIgnoreInstallCost) {
              continue;
            }
            const fired = s.run!.awakeningCenterTriggeredIds ?? [];
            if (fired.includes(id)) continue;
            s.run!.awakeningCenterTriggeredIds = [...fired, id];
            const hostedUnrezzed = (card.hostedCardIds ?? []).filter(
              (hid) => {
                const h = s.cards[hid];
                return h && h.type === "ice" && !h.rezzed;
              },
            );
            if (hostedUnrezzed.length === 0) continue;
            const affordable = hostedUnrezzed.filter(
              (hid) =>
                s.corp.credits >=
                Math.max(0, (s.cards[hid]!.rezCost ?? 0) - 7),
            );
            if (affordable.length === 0) continue;
            openPendingChoose(s, {
              sourceId: id,
              chooser: "corp",
              options: [
                ...affordable.map((hid) => {
                  const h = s.cards[hid]!;
                  const pay = Math.max(0, (h.rezCost ?? 0) - 7);
                  return {
                    id: `awakening-rez:${hid}`,
                    label: `Rez ${h.title} for ${pay}¢ (−7) and force encounter`,
                    effect: {
                      op: "do" as const,
                      action: {
                        kind: "rez_hosted" as const,
                        cardId: hid,
                      },
                    },
                  };
                }),
                {
                  id: "decline",
                  label: "Decline",
                  effect: {
                    op: "do" as const,
                    action: {
                      kind: "gain_credits" as const,
                      side: "corp" as const,
                      amount: 0,
                    },
                  },
                },
              ],
              logLine: `${card.title} — may rez a hosted bioroid ice (−7¢) and force the Runner to encounter it.`,
            });
            break;
          }
        }
        if (!s.pendingChoice && !s.psi) {
          notePassAllIceProtectingServer(s, s.run!.attackedServerId);
        }
        // Open Manegarm / Cayambe tax as a pending Runner choice if applicable.
        const sid = s.run!.attackedServerId;
        const server = s.servers[sid];
        for (const id of server.root) {
          const card = s.cards[id];
          if (!card.rezzed) continue;
          if (abilitiesSuppressed(s, id)) continue;
          if (card.approachServerEtrUnlessCreditsPerAdvancedIce !== undefined) {
            const per = card.approachServerEtrUnlessCreditsPerAdvancedIce;
            const advanced = server.ice.filter(
              (iceId) => (s.cards[iceId]?.advancementCounters ?? 0) > 0,
            ).length;
            const cost = per * advanced;
            if (cost > 0) {
              const options: Array<{
                id: string;
                label: string;
                effect: import("../effects/ir.js").Effect;
              }> = [];
              if (s.runner.credits >= cost) {
                options.push({
                  id: "pay-credits",
                  label: `Spend ${cost}¢`,
                  effect: {
                    op: "do",
                    action: {
                      kind: "lose_credits",
                      side: "runner",
                      amount: cost,
                    },
                  },
                });
              }
              options.push({
                id: "etr",
                label: "End the run",
                effect: { op: "do", action: { kind: "end_the_run" } },
              });
              openPendingChoose(s, {
                sourceId: id,
                chooser: "runner",
                options,
                logLine: `${card.title} — approach tax: pay ${cost}¢ (${per}¢ × ${advanced} advanced ice) or ETR.`,
              });
              break;
            }
          }
          if (!card.approachServerTax) continue;
          const tax = card.approachServerTax;
          const options: Array<{
            id: string;
            label: string;
            effect: import("../effects/ir.js").Effect;
          }> = [];
          if (s.runner.clicks >= tax.clicks) {
            options.push({
              id: "pay-clicks",
              label: `Spend ${tax.clicks} [click]`,
              effect: {
                op: "do",
                action: {
                  kind: "lose_clicks",
                  side: "runner",
                  amount: tax.clicks,
                },
              },
            });
          }
          if (s.runner.credits >= tax.credits) {
            options.push({
              id: "pay-credits",
              label: `Spend ${tax.credits}¢`,
              effect: {
                op: "do",
                action: {
                  kind: "lose_credits",
                  side: "runner",
                  amount: tax.credits,
                },
              },
            });
          }
          options.push({
            id: "etr",
            label: "End the run",
            effect: { op: "do", action: { kind: "end_the_run" } },
          });
          openPendingChoose(s, {
            sourceId: id,
            chooser: "runner",
            options,
            logLine: `${card.title} — approach tax: pay ${tax.clicks} clicks or ${tax.credits}¢ or ETR.`,
          });
          break;
        }
        // Nanisivik Grid-class: rezzed root onApproachServer — queue for 10.3.1a.
        // Note even when a tax already opened pendingChoice; the checkpoint
        // marks, and the reaction window waits on the open choice (CR 10.3.2).
        for (const id of server.root) {
          const card = s.cards[id];
          if (!card.rezzed || !card.onApproachServer) continue;
          if (abilitiesSuppressed(s, id)) continue;
          if (card.onApproachServerOncePerTurn && s.turn.mtiApproachFiredThisTurn) {
            continue;
          }
          if (card.onApproachServerOncePerRun) {
            const fired = s.run?.approachServerTriggersFiredIds ?? [];
            if (fired.includes(id)) continue;
          }
          noteApproachServer(s, id);
          if (card.onApproachServerOncePerTurn) {
            s.turn.mtiApproachFiredThisTurn = true;
          }
          if (card.onApproachServerOncePerRun && s.run) {
            s.run.approachServerTriggersFiredIds = [
              ...(s.run.approachServerTriggersFiredIds ?? []),
              id,
            ];
          }
        }
        checkpointAfterInstruction(s, "run.approachServer");
      },
    },
  ),
  "run.approachServerPaw": run(
    "run.approachServerPaw",
    "sec_appendix_timing_structure_of_a_run_4_g",
    "11.4_4_g",
    "Paid ability window while approaching the server.",
    "pass",
    (s) =>
      s.run?.endedTheRun ? "run.closePriorityWindows" : "run.success",
    { allows: ["use_paid_ability", "rez_asset", "pass_window"] },
  ),
  "run.success": run(
    "run.success",
    "sec_appendix_timing_structure_of_a_run_5_a",
    "11.4_5_a",
    "The run is declared successful.",
    "auto",
    (s) => {
      // Breach only after a declared successful run. Blocked success
      // (Crisium/Flagship) leaves successful === null — still skip breach
      // without declaring the run unsuccessful (CR 6.8.4a).
      // Remote cease at the post-success checkpoint ends the run (CR 4.6.8e /
      // 10.3.1h) before breach.
      if (s.run?.endedTheRun) return "run.closePriorityWindows";
      if (s.run?.successful !== true) return "run.closePriorityWindows";
      if (s.run?.skipBreach) return "run.closePriorityWindows";
      return "run.breachLink";
    },
    {
      onResolve: (s) => {
        // Track first successful HQ before the flag is set (PAN-Weave-class).
        let firstSuccessfulHq = false;
        // Track first successful central before HQ/RD/Archives flags (Zenit-class).
        let firstSuccessfulCentral = false;
        // Sneakdoor: redirect attacked server before declaring success.
        if (s.run?.redirectSuccessChooseHqOrRd && !s.pendingChoice) {
          s.run.redirectSuccessChooseHqOrRd = false;
          openPendingChoose(s, {
            sourceId: s.run.runSourceId ?? s.runner.identityId,
            chooser: "runner",
            options: [
              {
                id: "hq",
                label: "Change attacked server to HQ",
                effect: {
                  op: "do",
                  action: { kind: "redirect_omar_success", serverId: "hq" },
                },
              },
              {
                id: "rd",
                label: "Change attacked server to R&D",
                effect: {
                  op: "do",
                  action: { kind: "redirect_omar_success", serverId: "rd" },
                },
              },
            ],
            logLine: `Omar Keung — choose HQ or R&D for successful run.`,
          });
        }
        if (s.run?.redirectSuccessTo) {
          const dest = s.run.redirectSuccessTo;
          s.log.push(
            `Redirect successful run from ${s.run.attackedServerId} to ${dest}.`,
          );
          s.run.attackedServerId = dest;
          s.run.redirectSuccessTo = undefined;
        }
        // Crisium Grid / Flagship: runs against this server cannot be declared
        // successful. Leave successful as null — reaching Success Phase means
        // the run is also not declared unsuccessful (CR 6.8.4a).
        const server = s.servers[s.run!.attackedServerId];
        const cannotDeclareSuccessful =
          Boolean(s.run!.cannotDeclareSuccessful) ||
          server.root.some((id) => {
            const c = s.cards[id];
            return (
              c.rezzed &&
              c.runsCannotBeSuccessful &&
              !abilitiesSuppressed(s, id)
            );
          });
        if (cannotDeclareSuccessful) {
          s.run!.successful = null;
          s.log.push(
            `Run reached Success Phase but cannot be declared successful (CR 6.8.4a).`,
          );
        } else {
          s.run!.successful = true;
          s.turn.successfulRunThisTurn = true;
          noteSuccessfulRunServerAbilities(s);
          if ((s.turn.successfulRunServerPending ?? []).length > 0) {
            checkpointAfterInstruction(s, "run.success");
          }
          onSuccessfulRunEnded(s);
          s.turn.successfulRunCountThisTurn =
            (s.turn.successfulRunCountThisTurn ?? 0) + 1;
          // Embolus: remove 1 power counter from any rezzed Corp card with the flag.
          for (const card of Object.values(s.cards)) {
            if (
              !card?.rezzed ||
              card.side !== "corp" ||
              !card.removePowerCounterOnAnySuccessfulRun
            ) {
              continue;
            }
            if ((card.powerCounters ?? 0) <= 0) continue;
            card.powerCounters = (card.powerCounters ?? 0) - 1;
            s.log.push(
              `${card.title} — remove 1 power counter (successful run) → ${card.powerCounters}.`,
            );
          }
          // Bandwidth: remove tags granted this run if successful.
          {
            const n = s.run!.bandwidthTagsToRemoveOnSuccess ?? 0;
            if (n > 0) {
              const removed = Math.min(n, s.runner.tags);
              s.runner.tags -= removed;
              s.run!.bandwidthTagsToRemoveOnSuccess = 0;
              if (removed > 0) {
                s.log.push(
                  `Bandwidth — remove ${removed} tag(s) (run successful) → ${s.runner.tags}.`,
                );
              }
            }
          }
          {
            const sid = s.run!.attackedServerId;
            if (!s.turn.successfulRunServersThisTurn.includes(sid)) {
              s.turn.successfulRunServersThisTurn.push(sid);
            }
            const isCentral =
              sid === "hq" || sid === "rd" || sid === "archives";
            if (
              isCentral &&
              !s.turn.successfulHqRunThisTurn &&
              !s.turn.successfulRdRunThisTurn &&
              !s.turn.successfulArchivesRunThisTurn
            ) {
              firstSuccessfulCentral = true;
            }
          }
          if (s.run!.attackedServerId === "hq") {
            firstSuccessfulHq = !s.turn.successfulHqRunThisTurn;
            s.turn.successfulHqRunThisTurn = true;
            for (const server of Object.values(s.servers)) {
              for (const id of server.root) {
                const up = s.cards[id];
                if (up?.trashSelfOnCorpSuccessfulHqRun && up.rezzed) {
                  noteInlineConditional(s, {
                    cardId: id,
                    abilityKey: "trash-self-on-corp-successful-hq-run",
                    controller: "corp",
                    mandatory: true,
                    effect: { op: "do", action: { kind: "trash_self" } },
                    logLine: `${up.title} becomes pending — Corp successful HQ run (trash self).`,
                  });
                }
              }
            }
          }
          if (s.run!.attackedServerId === "rd") {
            s.turn.successfulRdRunThisTurn = true;
          }
          if (
            s.run!.successful &&
            (s.run!.attackedServerId === "hq" ||
              s.run!.attackedServerId === "rd")
          ) {
            fireCorpIdentityFlippedSuccessfulHqOrRdRun(
              s,
              s.run!.attackedServerId,
            );
          }
          if (s.run!.successful) {
            const corpId = s.cards[s.corp.identityId];
            if (
              corpId?.flipIdentityOnSuccessfulCentralRun &&
              !corpId.identityFlipped &&
              (s.run!.attackedServerId === "hq" ||
                s.run!.attackedServerId === "rd" ||
                s.run!.attackedServerId === "archives")
            ) {
              noteInlineConditional(s, {
                cardId: s.corp.identityId,
                abilityKey: "flip-identity-on-successful-central-run",
                controller: "corp",
                mandatory: true,
                effect: { op: "do", action: { kind: "flip_identity" } },
                logLine: `${corpId.title} becomes pending — successful central run (flip identity).`,
              });
            }
          }
          if (s.run!.attackedServerId === "archives") {
            s.turn.successfulArchivesRunThisTurn = true;
          }
          s.turn.lastRunPassedUnrezzedIceIds = [
            ...(s.turn.currentRunPassedUnrezzedIceIds ?? []),
          ];
          s.log.push(`Run successful (CR 6.7.2).`);
        }
        // Security Testing: first successful run on named server → 2¢ instead of breach.
        // Patron: first successful run on named server → draw N instead of breach.
        if (s.run!.successful) {
          for (const id of s.runner.installed) {
            const card = s.cards[id];
            if (
              card.securityTesting &&
              card.namedServerId === s.run!.attackedServerId
            ) {
              if (hasCompetingBreachReplacement(s)) {
                s.run!.deferBreachReplacement = true;
                break;
              }
              s.runner.credits += 2;
              s.run!.skipBreach = true;
              card.namedServerId = undefined;
              s.log.push(
                `${card.title} — gain 2¢ instead of breaching ${s.run!.attackedServerId}.`,
              );
              break;
            }
            const drawN = card.patronChooseServerDrawInsteadOfBreach;
            if (
              typeof drawN === "number" &&
              card.namedServerId === s.run!.attackedServerId
            ) {
              let drew = 0;
              for (let i = 0; i < drawN; i++) {
                if (s.runner.deck.length === 0) break;
                const top = s.runner.deck.shift()!;
                s.runner.hand.push(top);
                s.cards[top]!.zone = "runner:grip";
                s.cards[top]!.faceup = false;
                drew += 1;
              }
              s.run!.skipBreach = true;
              card.namedServerId = undefined;
              s.log.push(
                `${card.title} — draw ${drew} instead of breaching ${s.run!.attackedServerId}.`,
              );
              break;
            }
          }
        }
        // Retrieval Run: skip breach, may install program from heap.
        if (
          s.run!.successful &&
          s.run!.attackedServerId === "archives"
        ) {
          for (const id of s.runner.hand) {
            const card = s.cards[id];
            if (!card?.onGripArchivesSuccessInstallSelfIgnoringCosts) continue;
            s.runner.hand = s.runner.hand.filter((x) => x !== id);
            s.runner.installed.push(id);
            card.zone = "runner:installed";
            card.faceup = true;
            s.run!.skipBreach = true;
            s.log.push(
              `${card.title} — install from grip instead of breaching Archives.`,
            );
            break;
          }
        }
        if (
          s.run!.successful &&
          s.run!.attackedServerId === "hq"
        ) {
          for (const id of s.runner.hand) {
            const card = s.cards[id];
            if (!card?.onGripHqSuccessInstallSelfIgnoringCosts) continue;
            s.runner.hand = s.runner.hand.filter((x) => x !== id);
            s.runner.installed.push(id);
            card.zone = "runner:installed";
            card.faceup = true;
            s.run!.skipBreach = true;
            s.log.push(
              `${card.title} — install from grip instead of breaching HQ.`,
            );
            break;
          }
        }
        if (
          s.run!.successful &&
          s.run!.attackedServerId === "rd"
        ) {
          for (const id of s.runner.hand) {
            const card = s.cards[id];
            if (!card?.onGripRdSuccessInstallSelfIgnoringCosts) continue;
            s.runner.hand = s.runner.hand.filter((x) => x !== id);
            s.runner.installed.push(id);
            card.zone = "runner:installed";
            card.faceup = true;
            s.run!.skipBreach = true;
            s.log.push(
              `${card.title} — install from grip instead of breaching R&D.`,
            );
            break;
          }
        }
        if (s.run!.successful && s.run!.skipBreachInstallProgramFromHeap) {
          s.run!.skipBreach = true;
          const prog = s.runner.discardPile.find(
            (id) => s.cards[id].type === "program",
          );
          if (prog) {
            const card = s.cards[prog];
            s.runner.discardPile = s.runner.discardPile.filter((x) => x !== prog);
            s.runner.installed.push(prog);
            card.zone = "runner:installed";
            card.faceup = true;
            s.log.push(
              `Retrieval Run — install ${card.title} from heap ignoring costs.`,
            );
            noteVirusProgramInstalled(s, prog);
            noteProgramOrHardwareInstalled(s, prog);
          } else {
            s.log.push(`Retrieval Run — no program in heap to install.`);
          }
        }
        // Steve Cambridge: first successful HQ each turn (identity + Fenris carriers).
        if (
          s.run!.successful &&
          s.run!.attackedServerId === "hq" &&
          !s.turn.steveCambridgeUsedThisTurn
        ) {
          for (const carrierId of runnerAbilityCarrierIds(s)) {
            if (abilitiesSuppressed(s, carrierId)) continue;
            const idCard = s.cards[carrierId];
            if (idCard?.steveCambridge && s.runner.discardPile.length >= 2) {
              s.turn.steveCambridgeUsedThisTurn = true;
              const a = s.runner.discardPile[0]!;
              const b = s.runner.discardPile[1]!;
              s.runner.discardPile = s.runner.discardPile.filter(
                (id) => id !== a && id !== b,
              );
              if (!s.removedFromGame) s.removedFromGame = [];
              s.removedFromGame.push(a);
              s.cards[a].zone = "removed-from-game";
              s.runner.hand.push(b);
              s.cards[b].zone = "runner:grip";
              s.log.push(
                `${idCard.title} — RFG ${s.cards[a].title}; ${s.cards[b].title} to grip.`,
              );
              break;
            }
          }
        }
        // onSuccessfulRun — note for 10.3.1a when actually successful.
        if (s.run!.successful) {
          const queueSuccessfulRun = (cardId: string): void => {
            const card = s.cards[cardId];
            if (!card?.onSuccessfulRun) return;
            if (
              card.onSuccessfulRunOncePerTurn &&
              s.turn.onSuccessfulRunFiredIds.includes(cardId)
            ) {
              return;
            }
            const before = (s.turn.successfulRunPendingIds ?? []).length;
            noteOnSuccessfulRun(s, cardId);
            if (
              card.onSuccessfulRunOncePerTurn &&
              (s.turn.successfulRunPendingIds ?? []).length > before
            ) {
              s.turn.onSuccessfulRunFiredIds.push(cardId);
            }
          };

          // Runner identity (Nyusha-class mark success triggers).
          queueSuccessfulRun(s.runner.identityId);

          for (const id of s.runner.installed) {
            queueSuccessfulRun(id);
          }
          if ((s.turn.successfulRunPendingIds ?? []).length > 0) {
            checkpointAfterInstruction(s, "run.success");
          }
          for (const id of s.runner.installed) {
            const card = s.cards[id];
            if (!card?.caissaAdvanceOnSuccessfulRun || !card.hostId) continue;
            noteInlineConditional(s, {
              cardId: id,
              abilityKey: "caissa-advance-on-successful-run",
              controller: "runner",
              mandatory: true,
              effect: {
                op: "do",
                action: { kind: "advance_caissa_host_inward_or_install" },
              },
              logLine: `${card.title} becomes pending — successful run (Caïssa advance).`,
            });
          }
          // Chakana: successful run on R&D — note for 10.3.1a.
          if (s.run!.attackedServerId === "rd") {
            for (const id of s.runner.installed) {
              noteSuccessfulRunOnRd(s, id);
            }
            if ((s.turn.successfulRunOnRdPendingIds ?? []).length > 0) {
              checkpointAfterInstruction(s, "run.success");
            }
          }
          // Mu Safecracker-class: may pay for bonus access on successful HQ/R&D.
          for (const id of s.runner.installed) {
            const card = s.cards[id];
            if (!card) continue;
            const attackedSid = s.run!.attackedServerId;
            const spec =
              attackedSid === "hq"
                ? card.onSuccessfulHqRunMayPayForBonusAccess
                : attackedSid === "rd"
                  ? card.onSuccessfulRdRunMayPayForBonusAccess
                  : undefined;
            if (!spec || spec.credits <= 0 || spec.bonusAccess <= 0) continue;
            const stealthOnly = Boolean(card.paidAbilitiesUseStealthCreditsOnly);
            const canPay = stealthOnly
              ? stealthHostedCreditsAvailable(s) >= spec.credits
              : runnerAvailableCredits(s) >= spec.credits;
            const options: Array<{
              id: string;
              label: string;
              effect: Effect;
            }> = [
              {
                id: "decline",
                label: "Decline",
                effect: {
                  op: "do",
                  action: { kind: "gain_credits", side: "runner", amount: 0 },
                },
              },
            ];
            if (canPay) {
              options.unshift({
                id: "pay-bonus-access",
                label: `Pay ${spec.credits}¢${stealthOnly ? " (stealth)" : ""} for +${spec.bonusAccess} access`,
                effect: {
                  op: "seq",
                  effects: [
                    stealthOnly
                      ? {
                          op: "do",
                          action: {
                            kind: "spend_stealth_credits",
                            amount: spec.credits,
                          },
                        }
                      : {
                          op: "do",
                          action: {
                            kind: "lose_credits",
                            side: "runner",
                            amount: spec.credits,
                          },
                        },
                    {
                      op: "do",
                      action: {
                        kind: "bonus_access",
                        amount: spec.bonusAccess,
                      },
                    },
                  ],
                },
              });
            }
            noteInlineConditional(s, {
              cardId: id,
              abilityKey: "may-pay-for-bonus-access-on-successful-central",
              controller: "runner",
              mandatory: true,
              effect: { op: "choose", chooser: "runner", options },
              logLine: `${card.title} becomes pending — successful ${attackedSid} run (may pay for bonus access).`,
            });
          }
          // Hosted Runner cards on ice protecting the attacked server (Stowaway).
          for (const iceId of server.ice) {
            for (const [cardId, card] of Object.entries(s.cards)) {
              if (
                card.hostId === iceId &&
                card.side === "runner" &&
                card.onSuccessfulRun
              ) {
                queueSuccessfulRun(cardId);
              }
            }
          }
          for (const id of [...server.root, ...server.ice]) {
            const card = s.cards[id];
            if (!card?.rezzed || !card.onSuccessfulRun) continue;
            queueSuccessfulRun(id);
          }
          // Active lockdowns in corp:play-area (Argus / Hyoubu).
          for (const id of activeLockdownIds(s)) {
            queueSuccessfulRun(id);
          }
          for (const id of activeCorpCurrentIds(s)) {
            queueSuccessfulRun(id);
          }
          for (const id of activeRunnerCurrentIds(s)) {
            queueSuccessfulRun(id);
          }
          if ((s.turn.successfulRunPendingIds ?? []).length > 0) {
            checkpointAfterInstruction(s, "run.success");
          }
          // Puppet Master: may place 1 advancement on a card that can be advanced.
          for (const id of s.corp.scoreArea) {
            const card = s.cards[id];
            if (!card?.onSuccessfulRunMayPlaceAdvancementOnCanBeAdvanced) continue;
            if (abilitiesSuppressed(s, id)) continue;
            noteInlineConditional(s, {
              cardId: id,
              abilityKey: "puppet-master-place-advancement-on-successful-run",
              controller: "corp",
              mandatory: true,
              effect: {
                op: "do",
                action: { kind: "tlm_puppet_master_place_advancement" },
              },
              logLine: `${card.title} becomes pending — successful run (may place advancement).`,
            });
          }
          // Dedicated Neural Net: first successful HQ each turn → psi; Corp chooses access.
          if (
            s.run!.attackedServerId === "hq" &&
            !s.turn.tlmDedicatedNeuralNetUsedThisTurn
          ) {
            for (const id of s.corp.scoreArea) {
              const card = s.cards[id];
              if (!card?.firstSuccessfulHqRunEachTurnPsiCorpChoosesAccess) continue;
              if (abilitiesSuppressed(s, id)) continue;
              s.turn.tlmDedicatedNeuralNetUsedThisTurn = true;
              s.run!.tlmCorpChoosesHqAccess = true;
              noteInlineConditional(s, {
                cardId: id,
                abilityKey: "dedicated-neural-net-psi-on-first-successful-hq",
                controller: "corp",
                mandatory: true,
                effect: {
                  op: "do",
                  action: {
                    kind: "play_psi_game",
                    maxBid: 2,
                    ifBidsDiffer: {
                      op: "do",
                      action: {
                        kind: "gain_credits",
                        side: "corp",
                        amount: 0,
                      },
                    },
                  },
                },
                logLine: `${card.title} becomes pending — first successful HQ (psi; Corp may choose access).`,
              });
              break;
            }
          }
          // Sacrifice Zone: faceup agendas on other servers — note for 10.3.1a.
          const attacked = s.run!.attackedServerId;
          for (const [sid, srv] of Object.entries(s.servers)) {
            if (sid === attacked) continue;
            for (const id of srv.root) {
              if (s.turn.otherServerSuccessAbilityUsedIds.includes(id)) continue;
              const before = (s.turn.otherServerSuccessPendingIds ?? []).length;
              noteSuccessfulRunOtherServer(s, id);
              if ((s.turn.otherServerSuccessPendingIds ?? []).length > before) {
                s.turn.otherServerSuccessAbilityUsedIds.push(id);
              }
            }
          }
          if ((s.turn.otherServerSuccessPendingIds ?? []).length > 0) {
            checkpointAfterInstruction(s, "run.success");
          }
          const src = s.run!.runSourceId;
          const fxRun = s.run!.onSuccessfulRunEffect;
          const tied = s.run!.successTiedToServers;
          const stillAllowed =
            !tied ||
            !src ||
            serversMatchingSpec(s, { servers: tied }).includes(
              s.run!.attackedServerId,
            );
          if (src && fxRun && !stillAllowed) {
            s.log.push(
              `If successful does not trigger — ${s.run!.attackedServerId} is not a server this run could have chosen (CR ${CR.ifSuccessfulTiedToServer.number}).`,
            );
          } else if (
            src &&
            fxRun &&
            !(
              s.run!.deferBreachReplacement &&
              accountSiphonReplacesBreach(s)
            )
          ) {
            const r = evalEffect({ state: s, sourceId: src }, fxRun);
            if (!r.ok) {
              s.log.push(`Run-source onSuccessfulRun failed: ${r.error}`);
            }
          }

          // Chrome City: Analog Dreamers — may instead of breaching R&D.
          if (
            s.turn.ccAnalogDreamersRun &&
            s.run!.attackedServerId === "rd" &&
            src
          ) {
            s.turn.ccAnalogDreamersRun = false;
            noteInlineConditional(s, {
              cardId: src,
              abilityKey: "analog-dreamers-may-instead-of-breach",
              controller: "runner",
              mandatory: true,
              effect: {
                op: "do",
                action: { kind: "may_breach_instead_analog_dreamers" },
              },
              logLine: `${s.cards[src]?.title ?? "Analog Dreamers"} becomes pending — successful R&D run (may instead of breach).`,
            });
          }

          // Top Hat: may access 1 of top N instead of breaching R&D.
          if (s.run!.successful && s.run!.attackedServerId === "rd") {
            for (const rid of s.runner.installed) {
              const hat = s.cards[rid];
              const n = hat?.mayInsteadOfBreachRdAccessOneOfTopN;
              if (!n) continue;
              noteInlineConditional(s, {
                cardId: rid,
                abilityKey: "top-hat-may-instead-of-breach",
                controller: "runner",
                mandatory: true,
                effect: {
                  op: "do",
                  action: { kind: "top_hat_may_instead_of_breach", n },
                },
                logLine: `${hat.title} becomes pending — successful R&D run (may instead of breach).`,
              });
              break;
            }
          }

          // First successful run on the mark this turn (Virtuoso-class).
          const mark = s.markServerId;
          if (
            mark !== null &&
            s.run!.attackedServerId === mark &&
            !s.turn.successfulMarkRunThisTurn
          ) {
            s.turn.successfulMarkRunThisTurn = true;
            noteFirstSuccessfulMarkRun(s);
          }

          // First successful HQ run this turn (PAN-Weave-class).
          if (firstSuccessfulHq) {
            noteFirstSuccessfulHqRun(s);
          }

          // First successful HQ or R&D run this turn (RNG Key-class).
          if (
            (s.run?.attackedServerId === "hq" ||
              s.run?.attackedServerId === "rd") &&
            !s.turn.dtwnFirstSuccessfulHqOrRdFired
          ) {
            s.turn.dtwnFirstSuccessfulHqOrRdFired = true;
            noteFirstSuccessfulHqOrRdRun(s);
          }

          // First successful central run this turn (Zenit-class).
          if (firstSuccessfulCentral) {
            noteFirstSuccessfulCentralRun(s);
          }

          // First/second successful run this turn (Pravdivost / John / DreamNet /
          // Enhanced Vision genetics via Gene Conditioning Shoppe) plus
          // HQ / HQ-or-R&D / central / mark first-* above. Queue for 10.3.1a;
          // checkpoint after this instruction marks pending (phase 3) and may
          // cease an empty remote before breach (CR 10.3.1h).
          noteValSuccessfulRunTrigger(s);
          checkpointAfterInstruction(s, "run.success");
          if (s.run!.deferBreachReplacement && !s.pendingChoice) {
            openBreachReplacementChoice(s);
          }
        } else {
          // Crisium still fires server onSuccessfulRun? No — run wasn't successful.
          // Hokusai requires successful run — correctly skipped.
        }
      },
    },
  ),
  "run.breachLink": run(
    "run.breachLink",
    "sec_appendix_timing_structure_of_a_run_5_b",
    "11.4_5_b",
    "The Runner breaches the attacked server.",
    "auto",
    "breach.begin",
  ),
  // --- Run Ends Phase (appendix 11.4_6 / §6.8) ---
  "run.closePriorityWindows": run(
    "run.closePriorityWindows",
    "sec_appendix_timing_structure_of_a_run_6_a",
    "11.4_6_a",
    "Close or resolve priority windows from before end the run.",
    "auto",
    (s) =>
      s.priorityStack.some(
        (pw) =>
          !pawStepKeysForRunEnds.has(pw.stepKey) &&
          !reactionStepKeysForRunEnds.has(pw.stepKey),
      )
        ? "run.completeOtherPriorityWindows"
        : "run.emptyBpFund",
    {
      onResolve: (s) => {
        // CR 6.8.2 / appendix 11.4_6_a — drain open windows by class:
        // a) PAWs close (no further paid abilities / rez);
        // b) phase-begin reaction windows close;
        // c) other open windows complete interactively without new structures
        //    (Formicary-class — see run.completeOtherPriorityWindows).
        let closedPaw = 0;
        let closedReaction = 0;
        const keptOther: typeof s.priorityStack = [];
        // Drain innermost-first; keep non-PAW/non-reaction for interactive 6.8.2c.
        while (s.priorityStack.length > 0) {
          const pw = s.priorityStack.pop()!;
          if (pawStepKeysForRunEnds.has(pw.stepKey)) {
            closedPaw += 1;
            s.log.push(
              `Close paid ability window @ ${pw.stepKey} (CR 6.8.2a / appendix 11.4_6_a).`,
            );
          } else if (reactionStepKeysForRunEnds.has(pw.stepKey)) {
            closedReaction += 1;
            s.log.push(
              `Close phase-begin reaction window @ ${pw.stepKey} (CR 6.8.2b / appendix 11.4_6_a).`,
            );
          } else {
            keptOther.unshift(pw);
          }
        }
        for (const pw of keptOther) s.priorityStack.push(pw);
        if (keptOther.length > 0) {
          s.run!.forbidNewTimingStructures = true;
          s.log.push(
            `Open priority window(s) remain for completion without new structures (CR 6.8.2c / appendix 11.4_6_a).`,
          );
        } else if (closedPaw + closedReaction === 0) {
          s.log.push(
            `Run Ends — no open priority windows (CR 6.8.2 / appendix 11.4_6_a).`,
          );
        }
      },
    },
  ),
  "run.completeOtherPriorityWindows": run(
    "run.completeOtherPriorityWindows",
    "sec_appendix_timing_structure_of_a_run_6_a",
    "11.4_6_a",
    "Complete other open priority windows without new timing structures.",
    "pass",
    "run.emptyBpFund",
    {
      allows: ["use_paid_ability", "pass_window"],
      onResolve: (s) => {
        if (s.run) s.run.forbidNewTimingStructures = true;
        s.log.push(
          `Complete other priority windows without new structures (CR 6.8.2c / appendix 11.4_6_a).`,
        );
      },
    },
  ),
  "run.emptyBpFund": run(
    "run.emptyBpFund",
    "sec_appendix_timing_structure_of_a_run_6_b",
    "11.4_6_b",
    "The Runner empties their bad publicity fund.",
    "auto",
    "run.declareUnsuccessful",
    {
      onResolve: (s) => {
        if (s.badPublicityFund > 0) {
          s.log.push(
            `Return ${s.badPublicityFund}¢ from bad publicity fund to the bank (CR 10.6.3b / 6.8.3 / appendix 11.4_6_b).`,
          );
        }
        s.badPublicityFund = 0;
      },
    },
  ),
  "run.declareUnsuccessful": run(
    "run.declareUnsuccessful",
    "sec_appendix_timing_structure_of_a_run_6_c",
    "11.4_6_c",
    "If applicable, the run is declared unsuccessful.",
    "auto",
    "run.ends",
    {
      onResolve: (s) => {
        const runState = s.run;
        if (!runState) return;
        if (runState.successful === true) {
          // Already declared successful — do not declare unsuccessful.
          return;
        }
        if (runState.successful === null) {
          // Reached Success Phase without being declared successful
          // (Crisium/Flagship) — not unsuccessful (CR 6.8.4a).
          s.log.push(
            `Run Ends — not declared unsuccessful (CR 6.8.4a / appendix 11.4_6_c).`,
          );
          return;
        }
        // successful === false (ETR / jack-out / etc.)
        if (!s.servers[runState.attackedServerId]) {
          // Server ceased to exist — unsuccessful exception (CR 6.8.4b).
          return;
        }
        s.log.push(
          `Run declared unsuccessful (CR 6.8.4 / appendix 11.4_6_c).`,
        );
        noteUnsuccessfulRunServerAbilities(s);
        // First unsuccessful run this turn (John Masanori-class). Trash-self
        // remains mid-hook; onFirstUnsuccessfulRunThisTurn marks at 10.3.1a.
        const firstUnsuccessful = !s.turn.unsuccessfulRunThisTurn;
        s.turn.unsuccessfulRunThisTurn = true;
        if (firstUnsuccessful) {
          for (const id of [...s.runner.installed]) {
            if (abilitiesSuppressed(s, id)) continue;
            const c = s.cards[id];
            if (c?.trashSelfOnUnsuccessfulRunThisTurn) {
              moveRunnerCardToHeap(s, id);
              s.log.push(`${c.title} — trashed (unsuccessful run).`);
            }
          }
          noteFirstUnsuccessfulRun(s);
        }
        if (
          firstUnsuccessful ||
          (s.turn.unsuccessfulRunServerPendingIds ?? []).length > 0
        ) {
          checkpointAfterInstruction(s, "run.declareUnsuccessful");
        }
      },
    },
  ),
  "run.ends": run(
    "run.ends",
    "sec_appendix_timing_structure_of_a_run_6_d",
    "11.4_6_d",
    "The run is complete.",
    "auto",
    (s) => (s.run?.isPostRunBreach ? "breach.begin" : "runner.actionPaw"),
    {
      onResolve: (s) => {
        resolveDeferredPersistentAmaze(s);
        const runState = s.run!;
        if (runState.resumeAfterDelayedOrder) {
          runState.resumeAfterDelayedOrder = false;
        } else {
        clearTldrSubroutineCopies(s);
        // Window: Corp may rez the ice derezzed at run begin (before cleanup).
        if (
          runState.mayRezEventDerezzedIceOnRunEndIgnoreCosts &&
          runState.eventDerezzedIceId
        ) {
          const iceId = runState.eventDerezzedIceId;
          runState.mayRezEventDerezzedIceOnRunEndIgnoreCosts = false;
          runState.endedTheRun = true;
          const src = runState.runSourceId ?? iceId;
          noteInlineConditional(s, {
            cardId: src,
            abilityKey: "window-may-rez-event-derezzed-ice-on-run-end",
            controller: "runner",
            mandatory: true,
            effect: {
              op: "do",
              action: { kind: "may_rez_event_derezzed_ice_ignore_costs" },
            },
            logLine: `${s.cards[src]?.title ?? "Window of Opportunity"} becomes pending — run end (may rez derezzed ice).`,
          });
          checkpointAfterInstruction(s, "run.ends");
          if (s.pendingChoice) return;
        }
        // Boomerang-class: delayed conditional — may shuffle title from heap
        // into stack when the run ends successfully (CR 9.10 lingering).
        if (
          runState.successful === true &&
          (runState.mayShuffleTitlesFromHeapOnSuccessfulRunEnd?.length ?? 0) > 0
        ) {
          const titles = [
            ...(runState.mayShuffleTitlesFromHeapOnSuccessfulRunEnd ?? []),
          ];
          runState.mayShuffleTitlesFromHeapOnSuccessfulRunEnd = [];
          for (const title of titles) {
            const src =
              s.runner.discardPile.find((id) => s.cards[id]?.title === title) ??
              s.runner.identityId;
            noteInlineConditional(s, {
              cardId: src,
              abilityKey: "may-shuffle-title-from-heap-on-successful-run-end",
              controller: "runner",
              mandatory: true,
              effect: {
                op: "do",
                action: {
                  kind: "may_shuffle_title_from_heap_into_stack",
                  title,
                },
              },
              logLine: `${s.cards[src]?.title ?? title} becomes pending — successful run end (may shuffle from heap).`,
              // Heap may outlives the source (CR 9.6.13c / 9.10 lingering).
              independentOfSource: true,
            });
          }
          if ((s.turn.inlineConditionalPending ?? []).length > 0) {
            checkpointAfterInstruction(s, "run.ends");
          }
          if (s.pendingChoice) return;
        }
        if (runState.successful === true) {
          s.log.push(`Run complete — successful (appendix 11.4_6_d).`);
        } else if (runState.successful === false) {
          s.log.push(`Run complete — unsuccessful (appendix 11.4_6_d).`);
        } else {
          s.log.push(
            `Run complete — neither successful nor unsuccessful (CR 6.8.4a; appendix 11.4_6_d).`,
          );
        }
          if (offerDelayedRunEndOrder(s)) return;
        }
        // Mayfly: trash if it broke a sub this run
        for (const breakerId of runState.breakersThatBroke ?? []) {
          const br = s.cards[breakerId];
          if (!br?.trashAfterBreakingThisRun) continue;
          if (!s.runner.installed.includes(breakerId)) continue;
          const idx = s.runner.installed.indexOf(breakerId);
          s.runner.installed.splice(idx, 1);
          s.runner.discardPile.push(breakerId);
          br.zone = "runner:heap";
          br.faceup = true;
          s.log.push(`${br.title} trashed — broke a subroutine this run.`);
        }
        // Hafrún / Unsmiling: clear run-scoped break restrictions
        for (const card of Object.values(s.cards)) {
          if (card.cannotBreakSubsThisRun) {
            delete card.cannotBreakSubsThisRun;
          }
          if (card.maxPrintedSubsBreakablePerEncounter !== undefined) {
            delete card.maxPrintedSubsBreakablePerEncounter;
          }
        }
        // Info Bounty: first mark run end this turn, gain ¢ if breached
        const markSid = runState.attackedServerId;
        if (
          !s.turn.infoBountyMarkRunEndUsed &&
          s.markServerId &&
          markSid === s.markServerId &&
          runState.breached
        ) {
          for (const rid of s.runner.installed) {
            const card = s.cards[rid];
            const n = card?.gainCreditsOnFirstMarkRunEndIfBreached ?? 0;
            if (n <= 0) continue;
            s.runner.credits += n;
            s.turn.infoBountyMarkRunEndUsed = true;
            s.log.push(
              `${card!.title} — gain ${n}¢ (mark run ended after breach).`,
            );
            break;
          }
        }
        const sid = runState.attackedServerId;
        // Obelus: first successful HQ/R&D run end → draw 1 per access.
        if (
          (sid === "hq" || sid === "rd") &&
          runState.successful &&
          !s.turn.esObelusRunEndUsed
        ) {
          for (const rid of s.runner.installed) {
            const card = s.cards[rid];
            if (!card?.drawPerAccessOnFirstSuccessfulHqOrRdRunEndEachTurn) continue;
            const n = runState.accessedCardIds.length;
            if (n > 0) {
              s.turn.esObelusRunEndUsed = true;
              for (let i = 0; i < n; i++) {
                if (s.runner.deck.length === 0) break;
                const top = s.runner.deck.shift()!;
                s.runner.hand.push(top);
                const drawn = s.cards[top];
                if (drawn) {
                  drawn.zone = "runner:grip";
                  if (card.revealDrawnCards || s.runner.installed.some((x) => s.cards[x]?.revealDrawnCards)) {
                    s.log.push(`Reveal drawn card: ${drawn.title}.`);
                  }
                }
              }
              s.log.push(
                `Obelus — draw ${n} (${n} access(es) on ${sid}).`,
              );
            }
            break;
          }
        }
        // Psych Mike: first successful R&D run end each turn — note for 10.3.1a.
        // Checkpoint here while run.accessedCardIds still exist (effect reads them).
        if (sid === "rd" && runState.successful) {
          noteFirstSuccessfulRunOnRdEnds(s);
          if (s.turn.firstSuccessfulRdRunEndMetPending) {
            checkpointAfterInstruction(s, "run.ends");
          }
        }
        // Amelia Earhart: HQ/R&D run end, if accessed ≥ min, place power.
        if (sid === "hq" || sid === "rd") {
          const accessed = runState.accessedCardIds.length;
          for (const rid of s.runner.installed) {
            const card = s.cards[rid];
            const spec = card?.powerOnHqRdRunEndIfAccessedGte;
            if (!spec || accessed < spec.min) continue;
            card!.powerCounters = (card!.powerCounters ?? 0) + spec.amount;
            s.log.push(
              `${card!.title} — place ${spec.amount} power (accessed ${accessed} ≥ ${spec.min}) → ${card!.powerCounters}.`,
            );
          }
        }
        // The Turning Wheel: HQ/R&D run end, if stole no agendas, place 1 power.
        if (sid === "hq" || sid === "rd") {
          const stole = (runState.agendasStolenThisRun ?? 0) > 0;
          if (!stole) {
            for (const rid of s.runner.installed) {
              const card = s.cards[rid];
              if (!card?.placePowerOnHqOrRdRunEndIfNoAgendaStolen) continue;
              card.powerCounters = (card.powerCounters ?? 0) + 1;
              s.log.push(
                `${card.title} — place 1 power (no agenda stolen on ${sid.toUpperCase()}) → ${card.powerCounters}.`,
              );
            }
          }
        }
        // Raindrops-class: run-source onRunEnd (draw per power + gain, etc.)
        const runSrc = runState.runSourceId;
        const onRunEndFx = runState.onRunEndEffect;
        if (runSrc && onRunEndFx) {
          const r = evalEffect({ state: s, sourceId: runSrc }, onRunEndFx);
          if (!r.ok) {
            s.log.push(`Run-source onRunEnd failed: ${r.error}`);
          }
        }
        // Rip Deal: RFG self when the run ends.
        if (runSrc) {
          const runSrcCard = s.cards[runSrc];
          if (runSrcCard?.rfgSelfOnRunEnd) {
            removeCardFromCurrentZone(s, runSrc);
            runSrcCard.zone = "removed-from-game";
            runSrcCard.hostId = undefined;
            s.log.push(
              `${runSrcCard.title} — remove from the game (run ended).`,
            );
          }
        }
        // Diana's Hunt: trash programs installed ignoring costs this run.
        if (runState.trashProgramsInstalledThisWayOnRunEnd) {
          for (const pid of [...(runState.dianaInstalledProgramIds ?? [])]) {
            const prog = s.cards[pid];
            if (!prog || prog.zone !== "runner:installed") continue;
            removeCardFromCurrentZone(s, pid);
            s.runner.discardPile.push(pid);
            prog.zone = "runner:heap";
            prog.faceup = true;
            s.log.push(
              `Diana's Hunt — trash ${prog.title} (installed this run ignoring costs).`,
            );
          }
        }
        // Doppelgänger: once per turn when a successful run ends — note for 10.3.1a.
        // Note even if a choice is open; checkpoint marks, reaction waits (CR 10.3.2).
        if (runState.successful === true) {
          for (const rid of s.runner.installed) {
            if (s.turn.onSuccessfulRunEndFiredIds.includes(rid)) continue;
            const before = (s.turn.successfulRunEndOncePendingIds ?? []).length;
            noteSuccessfulRunEndOncePerTurn(s, rid);
            if ((s.turn.successfulRunEndOncePendingIds ?? []).length > before) {
              s.turn.onSuccessfulRunEndFiredIds.push(rid);
            }
          }
          if ((s.turn.successfulRunEndOncePendingIds ?? []).length > 0) {
            checkpointAfterInstruction(s, "run.ends");
          }
        }
        {
          // Drop still-pending Chum whose source went inactive (CR 9.6.10).
          cancelPendingIfSourceInactive(s);
          const chumPending = pendingAbilitiesWithStatus(s, "pending").filter(
            (p) => p.payload?.kind === "chum_net_damage",
          );
          if (chumPending.length > 0) {
            const frame = openReactionWindow(
              s,
              chumPending.map((p) => p.id),
              null,
            );
            for (const inst of chumPending) {
              if (inst.status !== "pending") continue;
              markPendingAbilityResolving(s, inst.id);
              const amount =
                inst.payload?.kind === "chum_net_damage"
                  ? inst.payload.amount
                  : 0;
              const r = evalEffect(
                {
                  state: s,
                  sourceId:
                    inst.sourceId ||
                    runState.lastEncounteredIceId ||
                    s.corp.identityId,
                },
                { op: "do", action: { kind: "net_damage", amount } },
              );
              if (!r.ok) s.log.push(`Chum net damage failed: ${r.error}`);
              completePendingAbility(s, inst.id, "done");
              if (s.done || s.pendingChoice || s.pendingDamage) break;
            }
            closeReactionWindow(s, frame.id);
            pruneSettledPendingAbilities(s);
          }
        }
        if (runState.preventAllDamageThisRun) {
          runState.preventAllDamageThisRun = false;
          s.log.push(
            `Prevent-all-damage expires as the run completes (CR ${CR.runEndsCondition.number}).`,
          );
        }
        // Dedicated Response Team: successful run ends — note for 10.3.1a.
        if (runState.successful === true) {
          for (const server of Object.values(s.servers)) {
            for (const id of [...server.root, ...server.ice]) {
              noteSuccessfulRunEnd(s, id);
            }
          }
          if ((s.turn.successfulRunEndPendingIds ?? []).length > 0) {
            checkpointAfterInstruction(s, "run.ends");
          }
        }
        // Arissana: trash identity-installed program if not subtype.
        const arissanaId = runState.identityInstalledProgramId;
        const unlessSubtype = runState.identityInstalledProgramTrashUnlessSubtype;
        if (arissanaId && unlessSubtype !== undefined) {
          const prog = s.cards[arissanaId];
          if (
            prog &&
            s.runner.installed.includes(arissanaId) &&
            !(prog.subtypes ?? []).includes(unlessSubtype)
          ) {
            const idx = s.runner.installed.indexOf(arissanaId);
            s.runner.installed.splice(idx, 1);
            s.runner.discardPile.push(arissanaId);
            prog.zone = "runner:heap";
            prog.faceup = true;
            s.log.push(
              `${prog.title} trashed at run end — not a ${unlessSubtype}.`,
            );
          }
        }
        // Howler: at run end, trash Howler and derez the ice it installed.
        if (runState.howlerId) {
          const installedId = runState.howlerInstalledIceId;
          const howler = s.cards[runState.howlerId];
          if (installedId) {
            const installedIce = s.cards[installedId];
            const stillInstalled = Object.values(s.servers).some((server) =>
              server.ice.includes(installedId),
            );
            if (installedIce && stillInstalled) {
              installedIce.rezzed = false;
              installedIce.faceup = false;
              s.log.push(
                `${installedIce.title} derezzed at run end (Howler; CR 10.2).`,
              );
            }
          }
          if (howler) {
            for (const server of Object.values(s.servers)) {
              const idx = server.ice.indexOf(runState.howlerId);
              if (idx >= 0) {
                server.ice.splice(idx, 1);
                s.corp.discardPile.push(runState.howlerId);
                howler.zone = "corp:archives";
                howler.rezzed = false;
                howler.faceup = true;
                s.log.push(`${howler.title} trashed at run end (CR 10.2).`);
                break;
              }
            }
          }
        }
        // Awakening Center: trash (not just derez) each hosted ice rezzed
        // and force-encountered via its trigger this run.
        for (const iceId of runState.awakeningCenterHostedIceIds ?? []) {
          const ice = s.cards[iceId];
          if (!ice) continue;
          const hostId = ice.hostId;
          if (hostId) {
            const host = s.cards[hostId];
            if (host) {
              host.hostedCardIds = (host.hostedCardIds ?? []).filter(
                (id) => id !== iceId,
              );
            }
          }
          ice.hostId = undefined;
          s.corp.discardPile.push(iceId);
          ice.zone = "corp:archives";
          ice.rezzed = false;
          ice.faceup = true;
          s.log.push(`${ice.title} trashed at run end (Awakening Center).`);
        }
        const postBreach = runState.breachWhenRunEnds;
        // Restore Thunderbolt-granted subroutines before clearing run boosts.
        for (const iceId of runState.thunderboltGrantedIceIds ?? []) {
          const ice = s.cards[iceId];
          if (!ice?.baseSubroutines) continue;
          ice.subroutines = structuredClone(ice.baseSubroutines);
        }
        // Restore Peeping Tom run-scoped gained subroutines.
        for (const iceId of runState.peepingTomIceIds ?? []) {
          const ice = s.cards[iceId];
          if (!ice) continue;
          ice.subroutines = ice.baseSubroutines
            ? structuredClone(ice.baseSubroutines)
            : [];
        }
        // Brainstorm-class: encounter-gained subroutines last only for
        // the remainder of the run; strip them so the next run starts
        // from the printed list.
        for (const card of Object.values(s.cards)) {
          const template = card.gainsSubroutinesOnEncounterEqualGripSize;
          if (!template || !card.subroutines) continue;
          card.subroutines = card.subroutines.filter(
            (sub) => !sub.id.startsWith(`${template.id}-`),
          );
        }
        // The next checkpoint expires run-duration lingerings (CR 10.3.1b).
        s.turn.runDurationPassed = true;
        if (postBreach) {
          s.log.push(
            `Post-run breach of ${postBreach} begins (CR 7.3.1).`,
          );
          // Standalone breach shell — not a successful run on that server.
          s.run = {
            attackedServerId: postBreach,
            phase: "breach",
            position: null,
            successful: null,
            accessedCardIds: [],
            accessCandidates: [],
            randomAccessLimit: null,
            encounter: null,
            endedTheRun: false,
            cannotJackOut: false,
            accessingCardId: null,
            isPostRunBreach: true,
          };
        } else {
          s.run = null;
        }
        // AMAZE meets its trigger when the run ends, in the reaction window
        // outside that run (CR 10.3.6).
        if (
          (runState.agendasStolenThisRun ?? 0) > 0 &&
          (runState.persistentTagsIfAgendaStolen ?? 0) > 0
        ) {
          const sid = runState.attackedServerId;
          // Server may already have ceased at a prior 10.3.1a in this step
          // (empty remote; CR 10.3.1h) — AMAZE still persists (CR 9.12.5).
          const sourceId =
            runState.persistentAmazeSourceId ??
            (sid
              ? s.servers[sid]?.root.find((id) => {
                  const card = s.cards[id];
                  return (
                    card?.rezzed && (card.tagsIfAgendaStolenThisRun ?? 0) > 0
                  );
                })
              : undefined);
          if (sourceId) {
            const tags = runState.persistentTagsIfAgendaStolen!;
            const stillThere = Boolean(
              sid &&
                s.servers[sid]?.root.includes(sourceId) &&
                s.cards[sourceId]?.rezzed,
            );
            if (!stillThere) {
              log(
                s,
                `${s.cards[sourceId]?.title ?? sourceId} persists for this run end (CR ${CR.persistentAbility.number}).`,
              );
            }
            // Persistent abilities never become inactive (CR 9.12.5b).
            const inst = createPendingAbilityInstance(s, {
              abilityKey: "amaze:tags-if-agenda-stolen",
              sourceId,
              controller: "corp",
              mandatory: true,
              independentOfSource: true,
              payload: { kind: "amaze_give_tags", amount: tags },
            });
            if (s.pendingChoice) {
              // Leave the instance pending until the open choice closes (CR 9.12.5d).
              log(
                s,
                `${s.cards[sourceId]?.title ?? sourceId} remains pending (CR ${CR.persistentAbility.number}).`,
              );
            } else {
              const frame = openReactionWindow(s, [inst.id], null);
              markPendingAbilityResolving(s, inst.id);
              evalEffect(
                { state: s, sourceId },
                {
                  op: "do",
                  action: { kind: "give_tags", amount: tags },
                },
              );
              completePendingAbility(s, inst.id, "done");
              closeReactionWindow(s, frame.id);
              pruneSettledPendingAbilities(s);
            }
          }
        }
        // The run has ended. Zahya's ability meets its condition in the
        // reaction window outside the run. A run event is still resolving
        // until its play abilities finish (CR 9.1.2b).
        if (
          (sid === "hq" || sid === "rd") &&
          !s.turn.zahyaRunEndUsed
        ) {
          const idCard = s.cards[s.runner.identityId];
          const n = runState.accessedCardIds.length;
          if (idCard?.creditsPerAccessOnCentralRunEnd && n > 0) {
            const eventId = s.playedRunEventId;
            const event = eventId ? s.cards[eventId] : undefined;
            const stillResolving =
              event?.blankIdentitiesWhileResolving === true &&
              event.zone === "runner:play-area";
            if (stillResolving && event) {
              log(
                s,
                `${event.title} is resolving (CR ${CR.isResolving.number}).`,
              );
            } else if (!abilitiesSuppressed(s, idCard.id)) {
              s.turn.pendingZahyaRunEnd = { credits: n, serverId: sid };
              openPendingChoose(s, {
                sourceId: idCard.id,
                chooser: "runner",
                options: [
                  {
                    id: "zahya-gain",
                    label: `Gain ${n}¢`,
                    effect: {
                      op: "do",
                      action: {
                        kind: "gain_credits",
                        side: "runner",
                        amount: 0,
                      },
                    },
                  },
                  {
                    id: "zahya-decline",
                    label: "Decline",
                    effect: {
                      op: "do",
                      action: {
                        kind: "gain_credits",
                        side: "runner",
                        amount: 0,
                      },
                    },
                  },
                ],
                logLine: `${idCard.title} — may gain ${n}¢ (${n} access(es) on ${sid}).`,
              });
            }
          }
        }
      },
    },
  ),

  // --- Breach (appendix 11.5) ---
  "breach.begin": breach(
    "breach.begin",
    "sec_appendix_timing_structure_of_breaching_a_server_1",
    "11.5_1",
    "The breach begins.",
    "auto",
    "breach.choose",
    {
      onResolve: (s) => {
        beginBreachAccess(s);
      },
    },
  ),
  "breach.choose": breach(
    "breach.choose",
    "sec_appendix_timing_structure_of_breaching_a_server_4",
    "11.5_4",
    "Are there candidate cards remaining to access?",
    "branch",
    (s) => {
      refreshRdDeckCandidate(s);
      const cands = s.run!.accessCandidates;
      const remaining = s.run!.randomAccessLimit;
      if (cands.length === 0 || remaining === 0) {
        s.log.push(
          cands.length === 0
            ? "No access candidates — empty server breach completes."
            : "Access remaining is 0 — breach completes.",
        );
        return "breach.complete";
      }
      return "breach.awaitAccess";
    },
  ),
  "breach.awaitAccess": breach(
    "breach.awaitAccess",
    "sec_appendix_timing_structure_of_breaching_a_server_4_a",
    "11.5_4_a",
    "If yes, the Runner chooses a candidate.",
    "access",
    "breach.access",
    { allows: ["access_card", "finish_breach"] },
  ),
  // Nested access-a-card structure (appendix 11.6 / §7.2) — walked while
  // resolving one chosen candidate from breach.awaitAccess.
  "access.cardAccessed": breach(
    "access.cardAccessed",
    "sec_appendix_timing_structure_of_accessing_a_card_1",
    "11.6_1",
    "The card is accessed.",
    "auto",
    "access.midAccess",
    {
      onResolve: (s) => {
        const accessedId = s.run?.accessingCardId;
        if (accessedId) onAccessed(s, accessedId);
        const accessed = accessedId ? s.cards[accessedId] : undefined;
        if (accessed && (accessed.onAccessGiveTags ?? 0) > 0) {
          const n = accessed.onAccessGiveTags!;
          s.runner.tags += n;
          s.turn.tagsGivenThisTurn += n;
          s.log.push(
            `${accessed.title} — Runner takes ${n} tag(s) on access → ${s.runner.tags}.`,
          );
        }
        noteAccessedCardAbilities(s);
        if ((s.turn.accessAbilityPending ?? []).length > 0) {
          checkpointAfterInstruction(s, "access.cardAccessed");
        }
      },
    },
  ),
  "access.midAccess": breach(
    "access.midAccess",
    "sec_appendix_timing_structure_of_accessing_a_card_2",
    "11.6_2",
    "The Runner may trash the card or use another mid-access ability.",
    "access",
    "access.stealAgenda",
    {
      allows: [
        "trash_accessed",
        "access_rfg_paying_trash_cost",
        "finish_access",
        "access_trash_from_grip",
        "access_trash_with_virus",
        "access_trash_free",
        "access_trash_paying_printed_cost_from_stealth",
        "access_trash_self_non_agenda_draw",
        "access_host_non_agenda_faceup",
      ],
    },
  ),
  "access.stealAgenda": breach(
    "access.stealAgenda",
    "sec_appendix_timing_structure_of_accessing_a_card_3",
    "11.6_3",
    "If the card is an agenda, the Runner steals it.",
    "access",
    "access.complete",
    { allows: ["steal_agenda", "finish_access", "access_host_agenda_on_film_critic"] },
  ),
  "access.complete": breach(
    "access.complete",
    "sec_appendix_timing_structure_of_accessing_a_card_4",
    "11.6_4",
    "Access is complete.",
    "auto",
    "breach.access",
    {
      onResolve: (s) => {
        noteFinishAccessRdOncePerTurn(s);
        if ((s.turn.accessAbilityPending ?? []).length > 0) {
          checkpointAfterInstruction(s, "access.complete");
        }
        const accessedId = s.run?.accessingCardId;
        if (accessedId) {
          const accessed = s.cards[accessedId];
          const inArchives =
            accessed?.zone === "corp:archives" ||
            s.corp.discardPile.includes(accessedId);
          const hasTrashCost =
            typeof accessed?.trashCost === "number" ||
            (accessed?.defId != null &&
              getCardDef(accessed.defId)?.trashCost != null);
          if (accessed && hasTrashCost && !inArchives) {
            for (const rid of [...s.runner.installed]) {
              const info = s.cards[rid];
              if (!info?.aeneasInformantRevealGainOnAccessWithoutTrash) continue;
              noteInlineConditional(s, {
                cardId: rid,
                abilityKey: "aeneas-may-reveal-gain-on-access-without-trash",
                controller: "runner",
                mandatory: true,
                effect: {
                  op: "do",
                  action: {
                    kind: "may_reveal_aeneas_gain_one",
                    cardId: accessedId,
                  },
                },
                logLine: `${info.title} becomes pending — access without trash (may reveal and gain).`,
              });
            }
            if ((s.turn.inlineConditionalPending ?? []).length > 0) {
              checkpointAfterInstruction(s, "access.complete");
            }
          }
        }
        if (s.run) s.run.accessingCardId = null;
        s.log.push(`Access complete (CR 7.2.4 / appendix 11.6_4).`);
      },
    },
  ),
  "breach.access": breach(
    "breach.access",
    "sec_appendix_timing_structure_of_breaching_a_server_5",
    "11.5_5",
    "The Runner accesses the chosen card.",
    "auto",
    "breach.choose",
  ),
  "breach.complete": breach(
    "breach.complete",
    "sec_appendix_timing_structure_of_breaching_a_server_7",
    "11.5_7",
    "Breaching the server is complete.",
    "auto",
    (s) => {
      // Divide and Conquer-class: queue further breaches after this one.
      const queued = s.run?.queuedBreachesAfterCurrent;
      if (queued && queued.length > 0) {
        const next = queued.shift()!;
        const run = s.run!;
        run.attackedServerId = next.server;
        run.cannotAccessRoot = next.cannotAccessRoot ?? false;
        run.accessCandidates = [];
        run.randomAccessLimit = null;
        run.accessingCardId = null;
        run.accessedCardIds = [];
        run.breachStoleOrTrashed = false;
        run.phase = "breach";
        run.breached = false;
        run.wakeImplantPending = false;
        run.wakeImplantResolved = false;
        run.mercuryBreachPending = false;
        run.mediumBreachPending = false;
        run.cupellationBreachPending = false;
        run.cupellationBreachResolved = false;
        run.onBreachRdPending = false;
        run.onBreachRdResolved = false;
        run.prettyMaryBreachResolved = false;
        run.heliamphoraHostInsteadUsedThisBreach = false;
        s.log.push(
          `Queued breach of ${next.server} begins${
            next.cannotAccessRoot ? " (cannot access root)" : ""
          }.`,
        );
        return "breach.begin";
      }
      // Shiro-class: resume suspended ice encounter after nested breach.
      if (s.run?.nestedBreachFromEncounter && s.run.resumeEncounterIceId) {
        const run = s.run;
        const parentId = run.resumeEncounterIceId as string;
        const parent = s.cards[parentId];
        const suspended = run.suspendedEncounter;
        run.nestedBreachFromEncounter = false;
        run.cannotAccessRoot = false;
        if (run.attackedServerIdBeforeNestedBreach) {
          run.attackedServerId = run.attackedServerIdBeforeNestedBreach;
          run.attackedServerIdBeforeNestedBreach = undefined;
        }
        run.resumeEncounterIceId = undefined;
        run.suspendedEncounter = undefined;
        const stillRezzed =
          parent?.type === "ice" &&
          parent.rezzed &&
          Object.values(s.servers).some((srv) => srv.ice.includes(parentId));
        if (stillRezzed && parent) {
          const host = Object.values(s.servers).find((srv) =>
            srv.ice.includes(parentId),
          );
          if (host && host.id === run.attackedServerId) {
            run.position = host.ice.indexOf(parentId);
          }
          if (suspended?.iceId === parentId) {
            run.encounter = suspended;
          } else {
            const subs = parent.subroutines ?? [];
            run.encounter = {
              iceId: parentId,
              broken: subs.map(() => false),
            };
          }
          run.skipOnEncounterOnce = true;
          run.phase = "encounter";
          s.log.push(
            `Resume encounter with ${parent.title} after nested breach.`,
          );
          return "run.encounterPaw";
        }
        s.log.push(
          `Cannot resume encounter — ${parent?.title ?? parentId} no longer rezzed.`,
        );
        return "run.passIcePaw";
      }
      // Clear post-run breach shell here (after onResolve) so next() still
      // sees isPostRunBreach — otherwise we'd incorrectly re-enter run.ends.
      if (s.run?.isPostRunBreach) {
        s.run = null;
        return "runner.actionPaw";
      }
      return "run.closePriorityWindows";
    },
    {
      onResolve: (s) => {
        const kitsuneId = s.run?.kitsuneIceToTrashAtBreachEnd;
        if (s.run && kitsuneId) {
          s.run.kitsuneIceToTrashAtBreachEnd = undefined;
          const ice = s.cards[kitsuneId];
          if (ice && ice.zone.startsWith("server:") && ice.zone.endsWith(":ice")) {
            log(
              s,
              `${ice.title} is trashed — its own name means this ice (CR ${CR.selfReference.number}).`,
            );
            trashCorpCardToArchives(s, kitsuneId);
          }
        }
        s.log.push(`Breach complete (appendix 11.5_7).`);
        const lastAccessed = s.run?.accessedCardIds?.at(-1);
        if (lastAccessed && !s.run?.breachStoleOrTrashed) {
          onAccessFinishedWithoutStealOrTrash(s, lastAccessed);
        }
        breachCreditGain(s);
        // Aumakua: finish breach with no steal/trash → place virus.
        if (s.run && !s.run.breachStoleOrTrashed) {
          for (const rid of s.runner.installed) {
            const card = s.cards[rid];
            if (!card?.placeVirusCounterOnFinishBreachIfNoStealOrTrash) continue;
            card.virusCounters = (card.virusCounters ?? 0) + 1;
            s.log.push(
              `${card.title} — place 1 virus (finish breach, no steal/trash) → ${card.virusCounters}.`,
            );
          }
        }
        if (
          s.run &&
          !s.run.isPostRunBreach &&
          !s.run.nestedBreachFromEncounter &&
          !(s.run.queuedBreachesAfterCurrent?.length)
        ) {
          s.run.phase = "ends";
        }
      },
    },
  ),
};

/** Game starts at Corp mulligan (CR 1.6.6a); first turn step remains corp.gainClicks. */
export const START_STEP = "opening.corpMulligan";

/** Convenience aliases used by older call sites / tests. */
export const CORP_STEPS = {
  gainClicks: STEPS["corp.gainClicks"],
  mandatoryDraw: STEPS["corp.mandatoryDraw"],
  actionPaw: STEPS["corp.actionPaw"],
  takeAction: STEPS["corp.takeAction"],
  actionPhaseEnd: STEPS["corp.actionPhaseEnd"],
  discard: STEPS["corp.discard"],
  turnComplete: STEPS["corp.turnComplete"],
} as const;

export const RUNNER_STEPS = {
  gainClicks: STEPS["runner.gainClicks"],
  actionPaw: STEPS["runner.actionPaw"],
  takeAction: STEPS["runner.takeAction"],
  actionPhaseEnd: STEPS["runner.actionPhaseEnd"],
  discard: STEPS["runner.discard"],
  turnComplete: STEPS["runner.turnComplete"],
} as const;

export const RUN_STEPS = {
  announce: STEPS["run.announce"],
  fillBpFund: STEPS["run.fillBpFund"],
  begin: STEPS["run.begin"],
  checkIce: STEPS["run.checkIce"],
  approachServer: STEPS["run.approachServer"],
  success: STEPS["run.success"],
  breach: STEPS["run.breachLink"],
  closePriorityWindows: STEPS["run.closePriorityWindows"],
  completeOtherPriorityWindows: STEPS["run.completeOtherPriorityWindows"],
  emptyBpFund: STEPS["run.emptyBpFund"],
  declareUnsuccessful: STEPS["run.declareUnsuccessful"],
  runEnds: STEPS["run.ends"],
} as const;

export const BREACH_STEPS = {
  begin: STEPS["breach.begin"],
  choose: STEPS["breach.choose"],
  access: STEPS["breach.access"],
  complete: STEPS["breach.complete"],
  awaitAccess: STEPS["breach.awaitAccess"],
  cardAccessed: STEPS["access.cardAccessed"],
  midAccess: STEPS["access.midAccess"],
  stealAgenda: STEPS["access.stealAgenda"],
  accessComplete: STEPS["access.complete"],
} as const;
