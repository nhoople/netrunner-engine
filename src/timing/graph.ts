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
import type { Effect } from "../effects/ir.js";
import { beginBreachAccess } from "../state/access.js";
import { syncGainsSubroutinesBeforePrintedPerFaceupArchives, syncGainsSubroutinesPerAdvancement } from "../state/powerCounters.js";
import { syncAllTourGuideSubs } from "../effects/sansanUotPrimitives.js";
import {
  beginCorpTurnFlags,
  beginRunnerTurnFlags,
} from "../state/turn.js";
import { agendaPointsFor } from "../state/scoring.js";
import { noteVirusProgramInstalled } from "../state/virusInstall.js";
import { noteProgramOrHardwareInstalled } from "../state/programHardwareInstall.js";
import { log } from "../state/createGame.js";
import {
  resolvePendingOnEncounter,
  runnerHasWhenEncounteredInterrupt,
} from "../state/onEncounter.js";
import {
  fireCorpActionPhaseEnd,
  fireRunnerActionPhaseEnd,
} from "../state/phaseEndHooks.js";
import {
  fireCorpIdentityFlippedSuccessfulHqOrRdRun,
} from "../state/identityFlipHooks.js";
import { fireOutsidePoolSpendTriggers } from "../state/outsidePoolSpend.js";
import {
  activeLockdownIds,
  trashActiveLockdownsAtCorpTurnBegin,
} from "../state/lockdowns.js";
import {
  activeCorpCurrentIds,
  activeRunnerCurrentIds,
} from "../state/currents.js";
import { noteRunnerClickLose } from "../state/clickHooks.js";
import { removeCardFromCurrentZone } from "../state/scoring.js";
import { moveRunnerCardToHeap } from "../state/trashHooks.js";
import { recomputeRunnerMaxHandSize } from "../state/handSize.js";


function iceBypassBlockedByServerUpgrade(
  state: import("../state/types.js").GameState,
  iceId: string,
): boolean {
  const ice = state.cards[iceId];
  if (ice?.cannotBeBypassed) return true;
  for (const server of Object.values(state.servers)) {
    if (!server.ice.includes(iceId)) continue;
    return [...server.root, ...server.ice].some(
      (id) =>
        state.cards[id]?.rezzed &&
        state.cards[id]?.iceCannotBeBypassedThisServer,
    );
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
 * Explicit timing step graph for Corp turn, Runner turn, run, and breach.
 * Appendix ids match vendor/cr-data/timing-structures.json (CR v26.03).
 *
 * PAW nodes accept hardcoded paid abilities (pump / fortify) via use_paid_ability.
 */
export const STEPS: Record<string, TimingStepDef> = {
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
          allotted += card.allottedClicksBonus ?? 0;
        }
        // Akshara Sareen: Corp +N while Runner connection installed.
        for (const id of s.runner.rig) {
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
    "auto",
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
            s.pendingChoice = {
              sourceId: idCard.id,
              chooser: "corp",
              options: idCard.identityFaceOptions!.map((face) => ({
                id: `jb-face:${face.id}`,
                label: face.label,
                effect: {
                  op: "do" as const,
                  action: {
                    kind: "jinteki_biotech_choose_face" as const,
                    faceId: face.id,
                  },
                },
              })),
            };
          }
        }
        // Lockdowns: trash at turn begin before pending conditionals (CR 3.5.1c).
        trashActiveLockdownsAtCorpTurnBegin(s);
        // Subliminal Messaging: if Runner made no runs last turn, return from Archives.
        if (!s.turn.runnerMadeRunLastTurn) {
          for (const id of [...s.corp.discard]) {
            const card = s.cards[id];
            if (!card.subliminalMessaging) continue;
            s.corp.discard = s.corp.discard.filter((x) => x !== id);
            s.corp.hand.push(id);
            card.zone = "corp:hq";
            card.faceup = false;
            s.log.push(
              `${card.title} — return from Archives (Runner made no runs last turn).`,
            );
          }
        }
        for (const card of Object.values(s.cards)) {
          if (card.side !== "corp" || !card.rezzed || !card.onTurnBegin) continue;
          const r = evalEffect({ state: s, sourceId: card.id }, card.onTurnBegin);
          if (!r.ok) {
            s.log.push(`onTurnBegin failed on ${card.title}: ${r.error}`);
          }
        }
        for (const id of s.corp.score) {
          const card = s.cards[id];
          if (!card?.onTurnBegin) continue;
          const r = evalEffect({ state: s, sourceId: id }, card.onTurnBegin);
          if (!r.ok) {
            s.log.push(`onTurnBegin failed on ${card.title}: ${r.error}`);
          }
        }
        for (const id of s.corp.score) {
          const card = s.cards[id];
          if (!card?.onTurnBeginIfRunnerTagged) continue;
          if (s.runner.tags <= 0) continue;
          const r = evalEffect(
            { state: s, sourceId: id },
            card.onTurnBeginIfRunnerTagged,
          );
          if (!r.ok) {
            s.log.push(
              `onTurnBeginIfRunnerTagged failed on ${card.title}: ${r.error}`,
            );
          }
        }
        for (const id of s.runner.rig) {
          const card = s.cards[id];
          if (!card?.onCorpTurnBeginIfRunnerUntagged) continue;
          if (s.runner.tags > 0) continue;
          const r = evalEffect(
            { state: s, sourceId: id },
            card.onCorpTurnBeginIfRunnerUntagged,
          );
          if (!r.ok) {
            s.log.push(
              `onCorpTurnBeginIfRunnerUntagged failed on ${card.title}: ${r.error}`,
            );
          }
        }
        for (const id of s.runner.rig) {
          const card = s.cards[id];
          if (!card?.onCorpTurnBegin) continue;
          const r = evalEffect(
            { state: s, sourceId: id },
            card.onCorpTurnBegin,
          );
          if (!r.ok) {
            s.log.push(`onCorpTurnBegin failed on ${card.title}: ${r.error}`);
          }
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
        "score_agenda",
        "basic_trash_resource",
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
        fireCorpActionPhaseEnd(s);
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
    "auto",
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
          const facedown = s.corp.discard.some((id) => !s.cards[id].faceup);
          if (facedown) {
            s.corp.credits += 1;
            log(s, `Jinteki: Restoring Humanity — gain 1¢ (facedown Archives).`);
          }
        }
        // Klevetnik: clear resource blanks when Corp turn ends.
        for (const card of Object.values(s.cards)) {
          const rem = card.abilitiesBlankedCorpTurnsRemaining;
          if (rem === undefined || rem === null) continue;
          if (rem <= 1) {
            card.abilitiesBlanked = false;
            delete card.abilitiesBlankedCorpTurnsRemaining;
            s.log.push(`${card.title} — abilities restored (Corp turn ended).`);
          } else {
            card.abilitiesBlankedCorpTurnsRemaining = rem - 1;
          }
        }
        // Mark designation expires at end of turn (CR 10.11.4).
        if (s.markServerId !== null) {
          log(s, `Mark on ${s.markServerId} expires (CR 10.11.4).`);
          s.markServerId = null;
        }
        // Tinkering-class: temporary ice subtypes expire at end of turn.
        for (const card of Object.values(s.cards)) {
          if (!card.grantedSubtypesUntilEndOfTurn?.length) continue;
          delete card.grantedSubtypesUntilEndOfTurn;
          s.log.push(`${card.title} — temporary subtypes expire (end of turn).`);
        }
        for (const card of Object.values(s.cards)) {
          if (!card.onCorpTurnEnd || !card.rezzed) continue;
          if (!card.zone.endsWith(":root")) continue;
          const r = evalEffect({ state: s, sourceId: card.id }, card.onCorpTurnEnd);
          if (!r.ok) {
            s.log.push(`onCorpTurnEnd error on ${card.title}: ${r.error}`);
          }
        }
        // Scored agendas (Jumon): onCorpTurnEnd while in Corp score area.
        for (const id of s.corp.score) {
          const card = s.cards[id];
          if (!card?.onCorpTurnEnd) continue;
          const r = evalEffect({ state: s, sourceId: id }, card.onCorpTurnEnd);
          if (!r.ok) {
            s.log.push(`onCorpTurnEnd error on ${card.title}: ${r.error}`);
          }
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
        for (const id of s.runner.rig) {
          allotted += s.cards[id]?.allottedClicksBonus ?? 0;
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
    "auto",
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
        s.log.push(`Runner turn begins (appendix 11.3_1_d).`);
        s.turn.leveragePreventRunnerDamage = false;
        s.turn.tlmDedicatedNeuralNetUsedThisTurn = false;
        s.turn.starlightDoubleEventAdditionalCostIgnored = false;
        // Security Testing: name a server (auto HQ).
        // Patron: choose a server.
        for (const id of s.runner.rig) {
          const card = s.cards[id];
          if (card.securityTesting) {
            card.namedServerId = "hq";
            s.log.push(`${card.title} — name HQ (auto).`);
          }
          if (typeof card.patronChooseServerDrawInsteadOfBreach === "number") {
            const r = evalEffect(
              { state: s, sourceId: id },
              { op: "do", action: { kind: "patron_choose_server" } },
            );
            if (!r.ok) {
              s.log.push(`Patron choose server failed: ${r.error}`);
            }
          }
        }
        const runnerIdCard = s.cards[s.runner.identityId];
        if (runnerIdCard?.onTurnBegin) {
          const r = evalEffect(
            { state: s, sourceId: runnerIdCard.id },
            runnerIdCard.onTurnBegin,
          );
          if (!r.ok) {
            s.log.push(
              `onTurnBegin failed on ${runnerIdCard.title}: ${r.error}`,
            );
          }
        }
        for (const id of s.runner.rig) {
          const card = s.cards[id];
          if (card?.onTurnBeginIfCorpNoBadPublicity) {
            if ((s.corp.badPublicity ?? 0) === 0) {
              const r0 = evalEffect(
                { state: s, sourceId: id },
                card.onTurnBeginIfCorpNoBadPublicity,
              );
              if (!r0.ok) {
                s.log.push(
                  `onTurnBeginIfCorpNoBadPublicity failed on ${card.title}: ${r0.error}`,
                );
              }
            }
          }
          if (!card?.onTurnBegin) continue;
          const r = evalEffect({ state: s, sourceId: id }, card.onTurnBegin);
          if (!r.ok) {
            s.log.push(`onTurnBegin failed on ${card.title}: ${r.error}`);
          }
        }
        // Out of the Ashes: heap may RFG self to make a run.
        for (const id of [...s.runner.discard]) {
          const card = s.cards[id];
          if (!card?.heapOnTurnBeginMayRfgSelfToMakeRun) continue;
          const r = evalEffect(
            { state: s, sourceId: id },
            {
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
          );
          if (!r.ok) {
            s.log.push(`Out of the Ashes turn-begin failed: ${r.error}`);
          }
        }
        for (const server of Object.values(s.servers)) {
          for (const id of server.root) {
            const card = s.cards[id];
            if (!card?.rezzed || !card.onRunnerTurnBegin) continue;
            const r = evalEffect(
              { state: s, sourceId: id },
              card.onRunnerTurnBegin,
            );
            if (!r.ok) {
              s.log.push(
                `onRunnerTurnBegin failed on ${card.title}: ${r.error}`,
              );
            }
          }
        }
        for (const id of s.corp.score) {
          const card = s.cards[id];
          if (!card?.onRunnerTurnBegin) continue;
          const r = evalEffect(
            { state: s, sourceId: id },
            card.onRunnerTurnBegin,
          );
          if (!r.ok) {
            s.log.push(
              `onRunnerTurnBegin failed on ${card.title}: ${r.error}`,
            );
          }
        }
        // Door to Door-class: currents in corp play-area.
        for (const [cid, card] of Object.entries(s.cards)) {
          if (card?.zone !== "corp:play-area" || !card.onRunnerTurnBegin) {
            continue;
          }
          const r = evalEffect(
            { state: s, sourceId: cid },
            card.onRunnerTurnBegin,
          );
          if (!r.ok) {
            s.log.push(
              `onRunnerTurnBegin failed on ${card.title}: ${r.error}`,
            );
          }
        }
        // Project Vacheron et al.: agendas in Runner score with onTurnBegin.
        for (const id of s.runner.score) {
          const card = s.cards[id];
          if (!card?.onTurnBegin) continue;
          if (
            card.worthZeroAgendaPointsWhileHasAgendaCounters &&
            (card.agendaCounters ?? 0) < 1
          ) {
            continue;
          }
          const r = evalEffect({ state: s, sourceId: id }, card.onTurnBegin);
          if (!r.ok) {
            s.log.push(`onTurnBegin failed on ${card.title}: ${r.error}`);
          }
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
        fireRunnerActionPhaseEnd(s);
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
        for (const id of [...s.runner.rig]) {
          const card = s.cards[id];
          if (!card.returnToGripAtDiscardPhase) continue;
          s.runner.rig = s.runner.rig.filter((x) => x !== id);
          s.runner.hand.push(id);
          card.zone = "runner:grip";
          s.log.push(`${card.title} — return to grip (discard phase).`);
        }
        // Test Run: bounce to stack at turn end (handle at discard start).
        for (const id of [...s.runner.rig]) {
          const card = s.cards[id];
          if (!card.bounceToStackAtTurnEnd) continue;
          s.runner.rig = s.runner.rig.filter((x) => x !== id);
          s.runner.deck.push(id);
          card.zone = "runner:stack";
          card.bounceToStackAtTurnEnd = false;
          card.faceup = false;
          s.log.push(`${card.title} — bounce to stack (Test Run).`);
        }
      },
    },
  ),
  "runner.discardPaw": runner(
    "runner.discardPaw",
    "sec_appendix_timing_structure_runners_turn_2_b",
    "11.3_2_b",
    "Paid ability window: (P) (R).",
    "auto",
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
        // Hoshiko-class: Runner identity onRunnerTurnEnd before rig cards.
        const runnerIdCard = s.cards[s.runner.identityId];
        if (runnerIdCard?.onRunnerTurnEnd) {
          const r = evalEffect(
            { state: s, sourceId: runnerIdCard.id },
            runnerIdCard.onRunnerTurnEnd,
          );
          if (!r.ok) {
            s.log.push(
              `onRunnerTurnEnd error on ${runnerIdCard.title}: ${r.error}`,
            );
          }
        }
        // Amanuensis-class: installed Runner cards' onRunnerTurnEnd.
        for (const id of [...s.runner.rig]) {
          const card = s.cards[id];
          if (!card?.onRunnerTurnEnd) continue;
          const r = evalEffect({ state: s, sourceId: id }, card.onRunnerTurnEnd);
          if (!r.ok) {
            s.log.push(`onRunnerTurnEnd error on ${card.title}: ${r.error}`);
          }
        }
        // Algernon-class: trash if click-gain was taken and no successful run.
        for (const id of [...s.runner.rig]) {
          const card = s.cards[id];
          if (!card?.trashAtTurnEndUnlessSuccessfulRun) continue;
          card.trashAtTurnEndUnlessSuccessfulRun = false;
          if (s.turn.successfulRunThisTurn) continue;
          const r = evalEffect(
            { state: s, sourceId: id },
            { op: "do", action: { kind: "trash_self" } },
          );
          if (!r.ok) {
            s.log.push(
              `trashAtTurnEndUnlessSuccessfulRun failed on ${card.title}: ${r.error}`,
            );
          }
        }
        // London Library: trash all programs hosted when Runner turn ends.
        for (const id of [...s.runner.rig]) {
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
        // Joshua B.-class: take 1 tag at turn end if click was gained.
        for (const id of [...s.runner.rig]) {
          const card = s.cards[id];
          if (!card?.tagAtTurnEnd) continue;
          card.tagAtTurnEnd = false;
          const r = evalEffect(
            { state: s, sourceId: id },
            { op: "do", action: { kind: "give_tags", amount: 1 } },
          );
          if (!r.ok) {
            s.log.push(`tagAtTurnEnd failed on ${card.title}: ${r.error}`);
          }
        }
        // Lightning Laboratory: delayed derez at end of the turn the ability was used
        // (runs are on the Runner turn → runner.turnEnds).
        const pending = s.turn.lightningPendingDerez;
        if (pending) {
          s.turn.lightningPendingDerez = null;
          const src =
            s.corp.score.find((id) => {
              const c = s.cards[id];
              return Boolean(
                c?.onCorpTurnEndDerezUpToIceProtectingLightningServer,
              );
            }) ?? s.corp.identityId;
          const r = evalEffect(
            { state: s, sourceId: src },
            {
              op: "do",
              action: {
                kind: "derez_up_to_ice_protecting_server",
                serverId: pending.serverId,
                maxIce: pending.maxIce,
              },
            },
          );
          if (!r.ok) {
            s.log.push(`Lightning Laboratory end-of-turn derez failed: ${r.error}`);
          }
        }
        sweepDerezAtAnyTurnEnd(s);
        // Mark designation expires at end of turn (CR 10.11.4).
        if (s.markServerId !== null) {
          log(s, `Mark on ${s.markServerId} expires (CR 10.11.4).`);
          s.markServerId = null;
        }
        // Tinkering-class: temporary ice subtypes expire at end of turn.
        for (const card of Object.values(s.cards)) {
          if (!card.grantedSubtypesUntilEndOfTurn?.length) continue;
          delete card.grantedSubtypesUntilEndOfTurn;
          s.log.push(`${card.title} — temporary subtypes expire (end of turn).`);
        }
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
    "corp.gainClicks",
    {
      onResolve: (s) => {
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
    "run.checkIce",
    {
      onResolve: (s) => {
        for (const id of s.runner.rig) {
          const card = s.cards[id];
          if (!card?.onRunBegin) continue;
          const r = evalEffect({ state: s, sourceId: id }, card.onRunBegin);
          if (!r.ok) {
            s.log.push(`onRunBegin failed on ${card.title}: ${r.error}`);
          }
        }
        // Active lockdowns in corp:play-area (SYNC Rerouting).
        for (const id of activeLockdownIds(s)) {
          const card = s.cards[id];
          if (!card?.onRunBegin) continue;
          const r = evalEffect({ state: s, sourceId: id }, card.onRunBegin);
          if (!r.ok) {
            s.log.push(`onRunBegin failed on ${card.title}: ${r.error}`);
          }
        }
        // First R&D run begin this turn → Runner identity trigger (Padma).
        if (s.run?.attackedServerId === "rd" && !s.turn.rdRunBegunThisTurn) {
          s.turn.rdRunBegunThisTurn = true;
          const idCard = s.cards[s.runner.identityId];
          if (idCard?.onFirstRdRunBeginThisTurn) {
            const r = evalEffect(
              { state: s, sourceId: idCard.id },
              idCard.onFirstRdRunBeginThisTurn,
            );
            if (!r.ok) {
              s.log.push(
                `onFirstRdRunBeginThisTurn failed on ${idCard.title}: ${r.error}`,
              );
            }
          }
        }
        // First run begin this turn → scored agendas (Stegodon) + rezzed
        // installed cards (Tributary) + Runner rig (Prognostic Q-Loop).
        if (!s.turn.runBeginThisTurnUsed) {
          s.turn.runBeginThisTurnUsed = true;
          for (const id of s.corp.score) {
            const card = s.cards[id];
            if (!card?.onFirstRunBeginThisTurn) continue;
            const r = evalEffect(
              { state: s, sourceId: id },
              card.onFirstRunBeginThisTurn,
            );
            if (!r.ok) {
              s.log.push(
                `onFirstRunBeginThisTurn failed on ${card.title}: ${r.error}`,
              );
            }
          }
          for (const server of Object.values(s.servers)) {
            for (const id of [...server.ice, ...server.root]) {
              const card = s.cards[id];
              if (!card?.rezzed || !card.onFirstRunBeginThisTurn) continue;
              const r = evalEffect(
                { state: s, sourceId: id },
                card.onFirstRunBeginThisTurn,
              );
              if (!r.ok) {
                s.log.push(
                  `onFirstRunBeginThisTurn failed on ${card.title}: ${r.error}`,
                );
              }
            }
          }
          for (const id of s.runner.rig) {
            const card = s.cards[id];
            if (!card?.onFirstRunBeginThisTurn) continue;
            const r = evalEffect(
              { state: s, sourceId: id },
              card.onFirstRunBeginThisTurn,
            );
            if (!r.ok) {
              s.log.push(
                `onFirstRunBeginThisTurn failed on ${card.title}: ${r.error}`,
              );
            }
          }
        }
        // First Archives run begin → rezzed root cards (Front Company).
        if (s.run?.attackedServerId === "archives") {
          if (!s.turn.archivesRunBegunThisTurn) {
            s.turn.archivesRunBegunThisTurn = true;
            for (const server of Object.values(s.servers)) {
              for (const id of server.root) {
                const card = s.cards[id];
                if (!card?.rezzed || !card.onFirstArchivesRunBeginThisTurn) {
                  continue;
                }
                const r = evalEffect(
                  { state: s, sourceId: id },
                  card.onFirstArchivesRunBeginThisTurn,
                );
                if (!r.ok) {
                  s.log.push(
                    `onFirstArchivesRunBeginThisTurn failed on ${card.title}: ${r.error}`,
                  );
                }
              }
            }
          }
        }
        // Window of Opportunity: derez 1 protecting ice when run begins.
        if (s.run?.derezProtectingIceOnRunBegin) {
          s.run.derezProtectingIceOnRunBegin = false;
          const src = s.run.runSourceId;
          if (src) {
            const r = evalEffect(
              { state: s, sourceId: src },
              {
                op: "do",
                action: { kind: "may_derez_protecting_attacked_ice" },
              },
            );
            if (!r.ok) {
              s.log.push(`Window derez on run begin failed: ${r.error}`);
            }
          }
        }
        // Lightning Laboratory: may spend agenda counter to rez up to N ice.
        if (!s.pendingChoice) {
          for (const id of s.corp.score) {
            const card = s.cards[id];
            const hook =
              card?.onRunBeginMaySpendAgendaCounterRezUpToIceProtectingAttacked;
            if (!hook || (card.agendaCounters ?? 0) < 1) continue;
            s.pendingChoice = {
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
                      kind: "lightning_spend_counter_rez_up_to_protecting_attacked",
                      maxIce: hook.maxIce,
                    },
                  },
                },
              ],
            };
            log(
              s,
              `${card.title} — may remove 1 agenda counter to rez up to ${hook.maxIce} ice.`,
            );
            break;
          }
        }
      },
    },
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
        s.pendingChoice = {
          sourceId: runState.runSourceId ?? s.runner.identityId,
          chooser: "runner",
          options,
        };
        s.log.push(
          `Baker — may pay ${cost}¢ from stealth to approach HQ or R&D.`,
        );
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
        const server = s.servers[runState.attackedServerId];
        if (!s.pendingChoice) {
          for (const id of server.root) {
            const card = s.cards[id];
            if (!card?.rezzed || !card.onApproachIce) continue;
            if (abilitiesSuppressed(s, id)) continue;
            if (card.onApproachIceOncePerRun) {
              const fired = s.run?.approachIceTriggersFiredIds ?? [];
              if (fired.includes(id)) continue;
            }
            const r = evalEffect({ state: s, sourceId: id }, card.onApproachIce);
            if (!r.ok) {
              s.log.push(`onApproachIce failed on ${card.title}: ${r.error}`);
            }
            if (card.onApproachIceOncePerRun && s.run) {
              s.run.approachIceTriggersFiredIds = [
                ...(s.run.approachIceTriggersFiredIds ?? []),
                id,
              ];
            }
            if (s.pendingChoice) break;
          }
        }
        // Snitch: once per run, approaching unrezzed ice → may expose then jack out.
        if (
          !s.pendingChoice &&
          ice &&
          !ice.rezzed &&
          !runState.snitchUsedThisRun
        ) {
          for (const id of s.runner.rig) {
            const snitch = s.cards[id];
            if (!snitch?.mayExposeApproachedUnrezzedIceOncePerRunThenMayJackOut) {
              continue;
            }
            runState.snitchUsedThisRun = true;
            s.pendingChoice = {
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
            };
            s.log.push(
              `${snitch.title} — may expose approached ${ice.title}, then may jack out.`,
            );
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
    { allows: ["rez_ice", "use_paid_ability", "pass_window"] },
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
    "run.encounterPaw",
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
        runState.iceEncounteredCount = (runState.iceEncounteredCount ?? 0) + 1;
        runState.lastEncounteredIceId = iceId;
        if (
          runState.mayJackOutOnFirstIceEncounter &&
          !runState.reconJackOutOffered &&
          runState.iceEncounteredCount === 1
        ) {
          runState.reconJackOutOffered = true;
          const r = evalEffect(
            { state: s, sourceId: runState.runSourceId ?? iceId },
            { op: "do", action: { kind: "offer_jack_out" } },
          );
          if (!r.ok) {
            s.log.push(`Recon jack-out offer failed: ${r.error}`);
          }
        }
        // Nero Severn: once per turn when encountering a sentry, may jack out.
        {
          const idCard = s.cards[s.runner.identityId];
          const iceSubs = ice.subtypes ?? [];
          if (
            idCard?.mayJackOutOnEncounterSentryOncePerTurn &&
            !s.turn.dagNeroSentryJackOutUsedThisTurn &&
            iceSubs.includes("sentry") &&
            !s.pendingChoice
          ) {
            s.turn.dagNeroSentryJackOutUsedThisTurn = true;
            const r = evalEffect(
              { state: s, sourceId: idCard.id },
              { op: "do", action: { kind: "offer_jack_out" } },
            );
            if (!r.ok) {
              s.log.push(`Nero Severn jack-out offer failed: ${r.error}`);
            } else {
              s.log.push(
                `${idCard.title} — may jack out (encounter sentry, once per turn).`,
              );
            }
          }
        }
        // Paperclip: when encountering a barrier, may install self from heap.
        if (
          (ice.subtypes ?? []).includes("barrier") &&
          !s.pendingChoice
        ) {
          for (const heapId of [...s.runner.discard]) {
            const c = s.cards[heapId];
            if (!c?.mayInstallSelfFromHeapOnEncounterBarrier) continue;
            const r = evalEffect(
              { state: s, sourceId: heapId },
              {
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
            );
            if (!r.ok) {
              s.log.push(`Paperclip heap install offer failed: ${r.error}`);
            }
            break;
          }
        }
        // Black Orchestra: when encountering a code gate, may install self from heap.
        if (
          (ice.subtypes ?? []).includes("code gate") &&
          !s.pendingChoice
        ) {
          for (const heapId of [...s.runner.discard]) {
            const c = s.cards[heapId];
            if (!c?.mayInstallSelfFromHeapOnEncounterCodeGate) continue;
            const r = evalEffect(
              { state: s, sourceId: heapId },
              {
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
            );
            if (!r.ok) {
              s.log.push(`Black Orchestra heap install offer failed: ${r.error}`);
            }
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
          if (ice.onEncounterEnd && ice.rezzed) {
            const r = evalEffect(
              { state: s, sourceId: iceId },
              ice.onEncounterEnd,
            );
            if (!r.ok) {
              s.log.push(`onEncounterEnd failed on ${ice.title}: ${r.error}`);
            }
          }
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
          if (ice.onEncounterEnd && ice.rezzed) {
            const r = evalEffect(
              { state: s, sourceId: iceId },
              ice.onEncounterEnd,
            );
            if (!r.ok) {
              s.log.push(`onEncounterEnd failed on ${ice.title}: ${r.error}`);
            }
          }
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
              if (ice.onEncounterEnd && ice.rezzed) {
                const r = evalEffect(
                  { state: s, sourceId: iceId },
                  ice.onEncounterEnd,
                );
                if (!r.ok) {
                  s.log.push(
                    `onEncounterEnd failed on ${ice.title}: ${r.error}`,
                  );
                }
              }
            }
          }
        }
        const subs = ice.subroutines ?? [];
        runState.phase = "encounter";
        if (!runState.encounter) {
          if (ice.dynamicEtrSubroutineCountFromCorpAgendaPoints) {
            const n = agendaPointsFor(s, "corp");
            if (!ice.baseSubroutines) {
              ice.baseSubroutines = structuredClone(subs);
            }
            ice.subroutines = (ice.baseSubroutines ?? subs).slice(0, n);
          }
          if (ice.dynamicEtrSubroutineCountFromCorpHandSize) {
            const n = s.corp.hand.length;
            const etrEffect = {
              op: "do" as const,
              action: { kind: "end_the_run" as const },
            };
            if (!ice.baseSubroutines) {
              ice.baseSubroutines = structuredClone(subs);
            }
            ice.subroutines = [
              ...(ice.baseSubroutines ?? subs),
              ...Array.from({ length: n }, (_, i) => ({
                id: `${ice.defId}-hq-etr-${i}`,
                text: "End the run.",
                effect: etrEffect,
              })),
            ];
          }
          if (ice.dynamicEtrSubroutineCountFromRezzedIceSubtype) {
            const sub = ice.dynamicEtrSubroutineCountFromRezzedIceSubtype;
            let n = 0;
            for (const server of Object.values(s.servers)) {
              for (const id of server.ice) {
                const c = s.cards[id];
                if (
                  c?.rezzed &&
                  (c.subtypes ?? []).some((st) =>
                    st.toLowerCase().includes(sub.toLowerCase()),
                  )
                ) {
                  n += 1;
                }
              }
            }
            const etrEffect = {
              op: "do" as const,
              action: { kind: "end_the_run" as const },
            };
            ice.subroutines = [
              ...(ice.baseSubroutines ?? subs),
              ...Array.from({ length: n }, (_, i) => ({
                id: `${ice.defId}-next-etr-${i}`,
                text: "End the run.",
                effect: structuredClone(etrEffect),
              })),
            ];
          }
          if (
            s.run?.iceRezzedDuringApproachId === iceId &&
            s.cards[s.runner.identityId]?.onEncounterRezzedAfterApproach
          ) {
            const idCard = s.cards[s.runner.identityId]!;
            const r = evalEffect(
              { state: s, sourceId: s.runner.identityId },
              idCard.onEncounterRezzedAfterApproach!,
            );
            if (!r.ok) {
              s.log.push(`onEncounterRezzedAfterApproach failed: ${r.error}`);
            }
          }
          runState.encounter = {
            iceId,
            broken: (ice.subroutines ?? subs).map(() => false),
          };
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
              `${ice.title} — Marker adds ETR subroutine after printed subs.`,
            );
          }
        } else if (runState.encounter.iceId === iceId) {
          // encounter already set (bypass paths)
        }
        // Chum: apply pending next-ice strength bonus at encounter begin.
        if (runState.chumNextIce) {
          const chum = runState.chumNextIce;
          runState.chumNextIce = undefined;
          runState.iceStrengthBoosts[iceId] =
            (runState.iceStrengthBoosts[iceId] ?? 0) + chum.strengthBonus;
          runState.chumActiveEncounter = {
            iceId,
            netDamageIfNotFullyBroken: chum.netDamageIfNotFullyBroken,
          };
          s.log.push(
            `Chum — ${ice.title} gets +${chum.strengthBonus} strength this encounter.`,
          );
        }
        // Winchester: while protecting HQ, gains extra printed subroutines.
        if (
          ice.gainsSubroutinesWhileProtectingHq &&
          s.run?.attackedServerId === "hq" &&
          !(runState as { winchesterHqSubsApplied?: boolean }).winchesterHqSubsApplied
        ) {
          if (!ice.baseSubroutines) {
            ice.baseSubroutines = structuredClone(ice.subroutines ?? []);
          }
          const extras = ice.gainsSubroutinesWhileProtectingHq.map((sub) => ({
            ...structuredClone(sub),
            id: `${sub.id}-hq`,
          }));
          ice.subroutines = [...(ice.baseSubroutines ?? []), ...extras];
          runState.encounter = {
            iceId,
            broken: ice.subroutines.map(() => false),
          };
          (runState as { winchesterHqSubsApplied?: boolean }).winchesterHqSubsApplied =
            true;
          s.log.push(
            `${ice.title} — gains ${extras.length} subroutine(s) while protecting HQ.`,
          );
        }
        // Blockchain: gains floor(faceup Archives type+subtype / per) subs
        // before printed (sync at encounter begin).
        if (ice.gainsSubroutinesBeforePrintedPerFaceupArchives) {
          const before = ice.subroutines?.length ?? 0;
          syncGainsSubroutinesBeforePrintedPerFaceupArchives(s, ice);
          const after = ice.subroutines?.length ?? 0;
          runState.encounter = {
            iceId,
            broken: (ice.subroutines ?? []).map(() => false),
          };
          if (after !== before) {
            s.log.push(
              `${ice.title} — sync Archives-faceup gained subroutines (${after - (ice.baseSubroutines?.length ?? 0)} before printed).`,
            );
          }
        }
        // Wetwork Refit-class: hosted condition grants subs before printed.
        {
          const hostedExtras: Array<{
            id: string;
            text: string;
            effect: import("../effects/ir.js").Effect;
          }> = [];
          for (const hid of ice.hostedCardIds ?? []) {
            const hosted = s.cards[hid];
            for (const sub of hosted?.hostGainsSubroutinesBeforePrinted ?? []) {
              hostedExtras.push({
                ...structuredClone(sub),
                id: `${sub.id}-${hid}`,
              });
            }
          }
          if (hostedExtras.length > 0) {
            if (!ice.baseSubroutines) {
              ice.baseSubroutines = structuredClone(ice.subroutines ?? []);
            }
            ice.subroutines = [
              ...hostedExtras,
              ...(ice.baseSubroutines ?? []),
            ];
            runState.encounter = {
              iceId,
              broken: (ice.subroutines ?? []).map(() => false),
            };
            s.log.push(
              `${ice.title} — gains ${hostedExtras.length} hosted condition subroutine(s) before printed.`,
            );
          }
        }
        // Woodcutter/Tyrant: gains one sub per advancement.
        if (ice.gainsSubroutinesPerAdvancement) {
          syncGainsSubroutinesPerAdvancement(ice);
          runState.encounter = {
            iceId,
            broken: (ice.subroutines ?? []).map(() => false),
          };
        }
        // Brainstorm: gains X "Do 1 core damage" subs = grip size for remainder of run.
        if (
          ice.gainsSubroutinesOnEncounterEqualGripSize &&
          !(runState as { tlmBrainstormApplied?: boolean }).tlmBrainstormApplied
        ) {
          const x = s.runner.hand.length;
          if (!ice.baseSubroutines) {
            ice.baseSubroutines = structuredClone(ice.subroutines ?? []);
          }
          const template = ice.gainsSubroutinesOnEncounterEqualGripSize;
          const extras = Array.from({ length: x }, (_, i) => ({
            ...structuredClone(template),
            id: `${template.id}-${i}`,
          }));
          ice.subroutines = [...(ice.subroutines ?? []), ...extras];
          runState.encounter = {
            iceId,
            broken: (ice.subroutines ?? []).map(() => false),
          };
          (runState as { tlmBrainstormApplied?: boolean }).tlmBrainstormApplied =
            true;
          s.log.push(
            `${ice.title} — gains ${x} core-damage subroutine(s) (grip size).`,
          );
        }
        // Tour Guide: sync ETR subs per rezzed asset at encounter begin.
        if (ice.etrSubroutinesPerRezzedAsset) {
          syncAllTourGuideSubs(s);
          runState.encounter = {
            iceId,
            broken: (ice.subroutines ?? []).map(() => false),
          };
        }
        // Stick and Poke: first encounter each turn, ice gains a subroutine.
        if (
          !s.turn.stickAndPokeUsedThisTurn &&
          !(runState.bypassedIceIds ?? []).includes(iceId) &&
          !runState.encounter.stickAndPokeSynthetic
        ) {
          for (const rid of s.runner.rig) {
            const poke = s.cards[rid];
            const syn = poke?.firstEncounterGainsSubroutine;
            if (!syn) continue;
            s.turn.stickAndPokeUsedThisTurn = true;
            const synSub = {
              id: `${ice.defId}-stick-and-poke`,
              text: syn.text,
              effect: structuredClone(syn.effect),
            };
            ice.subroutines = [synSub, ...(ice.subroutines ?? [])];
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
          ice.subroutines = [...(ice.subroutines ?? []), synSub];
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
          s.pendingChoice = {
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
          };
          s.log.push(
            `Threat — may spend [click] to bypass ${ice.title} (second encounter).`,
          );
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
          s.pendingChoice = {
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
          };
          s.log.push(
            `Alarm Clock — may spend ${n} [click] to bypass ${ice.title} (first encounter).`,
          );
        }
        s.log.push(
          `Encounter ${ice.title} (appendix 11.4_3_a / CR 6.5.1) with ${subs.length} subroutine(s).`,
        );
        // Gantulga: first encounter each turn with ice on the named server.
        if (!s.turn.gantulgaEncounterIceId) {
          for (const rid of s.runner.rig) {
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
        if (
          ice.onEncounter &&
          !abilitiesSuppressed(s, iceId) &&
          !(runState.bypassedIceIds ?? []).includes(iceId) &&
          !runState.skipOnEncounterOnce
        ) {
          // Defer for when_encountered_interrupt_paw (AirbladeX); otherwise
          // fire immediately so encounter choices appear at encounter start.
          runState.encounter!.onEncounterPending = true;
          if (!runnerHasWhenEncounteredInterrupt(s)) {
            resolvePendingOnEncounter(s);
          }
        }
        // Baklan: first actual encounter each run → onFirstEncounterEachRun.
        if (
          !runState.onFirstEncounterEachRunFired &&
          !(runState.bypassedIceIds ?? []).includes(iceId)
        ) {
          runState.onFirstEncounterEachRunFired = true;
          for (const rid of s.runner.rig) {
            const card = s.cards[rid];
            if (!card?.onFirstEncounterEachRun) continue;
            if (abilitiesSuppressed(s, rid)) continue;
            const r = evalEffect(
              { state: s, sourceId: rid },
              card.onFirstEncounterEachRun,
            );
            if (!r.ok) {
              s.log.push(
                `onFirstEncounterEachRun failed on ${card.title}: ${r.error}`,
              );
            }
            if (s.pendingChoice) break;
          }
        }
        // Chisel-class trojans + Eavesdrop-class conditions: onHostEncounter.
        if (
          !s.pendingChoice &&
          !(runState.bypassedIceIds ?? []).includes(iceId)
        ) {
          const hosteds = [
            ...s.runner.rig.filter((tid) => s.cards[tid]?.hostId === iceId),
            ...(ice.hostedCardIds ?? []),
          ];
          const seen = new Set<string>();
          for (const tid of hosteds) {
            if (seen.has(tid)) continue;
            seen.add(tid);
            const hosted = s.cards[tid];
            if (
              !hosted?.onHostEncounter ||
              hosted.hostId !== iceId ||
              abilitiesSuppressed(s, tid)
            ) {
              continue;
            }
            const r = evalEffect(
              { state: s, sourceId: tid },
              hosted.onHostEncounter,
            );
            if (!r.ok) {
              s.log.push(
                `onHostEncounter failed on ${hosted.title}: ${r.error}`,
              );
            }
            if (s.pendingChoice) break;
            // Host may have been trashed (Chisel at strength ≤ 0).
            if (!s.servers[runState.attackedServerId]?.ice.includes(iceId)) {
              break;
            }
          }
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
            s.pendingChoice = {
              sourceId: rid,
              chooser: "corp",
              options,
            };
            s.log.push(
              `${up.title} — may trash ${ice.title} to resolve a subroutine.`,
            );
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
            s.pendingChoice = {
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
            };
            s.log.push(`Rigged Results — bypass ${ice.title}.`);
          } else
          for (const rid of s.runner.rig) {
            const femme = s.cards[rid];
            if (femme.chosenIceId !== iceId) continue;
            const n = (ice.subroutines ?? []).length;
            const cost = n;
            if (s.runner.credits >= cost && n > 0) {
              s.pendingChoice = {
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
              };
              s.log.push(
                `${femme.title} — may pay ${cost}¢ to bypass ${ice.title}.`,
              );
            }
            break;
          }
        }
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
        fireOutsidePoolSpendTriggers(s);
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
    (s) =>
      s.run!.endedTheRun ? "run.closePriorityWindows" : "run.checkSubs",
    {
      onResolve: (s) => {
        const runState = s.run!;
        const enc = runState.encounter!;
        const ice = s.cards[enc.iceId];
        const subs = ice.subroutines ?? [];
        const idx = enc.broken.findIndex((b) => !b);
        if (idx < 0) return;
        const sub = subs[idx];
        // Mark resolved (fired) so we do not re-fire; unbroken means not broken by runner.
        enc.broken[idx] = true;
        // Gantulga replacement: first named-server encounter → Do N net damage.
        let replaced = false;
        if (s.turn.gantulgaEncounterIceId === enc.iceId) {
          for (const rid of s.runner.rig) {
            const g = s.cards[rid];
            const n = g.firstEncounterSubsBecomeNetDamage ?? 0;
            if (n <= 0 || !g.namedServerId) continue;
            if (g.namedServerId !== runState.attackedServerId) continue;
            s.log.push(
              `Resolve subroutine "${sub.text}" as Do ${n} net damage (${g.title}).`,
            );
            const r = evalEffect(
              { state: s, sourceId: rid },
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
          // Keep spend-block while a pendingChoice from this sub is open.
          if (blockedSpend && !s.pendingChoice) {
            runState.runnerCannotSpendCredits = false;
          }
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
      return "run.jackOutWindow";
    },
    {
      onResolve: (s) => {
        const runState = s.run!;
        const pos = runState.position;
        if (pos !== null) {
          const iceId = s.servers[runState.attackedServerId].ice[pos];
          if (iceId) {
            // Count every pass (rezzed, unrezzed, or bypassed → movement).
            runState.passedIceIds = [
              ...(runState.passedIceIds ?? []),
              iceId,
            ];
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
            // Khan: first pass ice each turn → may install icebreaker.
            if (!s.turn.bmFirstPassIceUsedThisTurn) {
              const khan = s.cards[s.runner.identityId];
              if (khan?.onFirstPassIceEachTurn) {
                s.turn.bmFirstPassIceUsedThisTurn = true;
                const r = evalEffect(
                  { state: s, sourceId: khan.id },
                  khan.onFirstPassIceEachTurn,
                );
                if (!r.ok) {
                  s.log.push(
                    `onFirstPassIceEachTurn failed on ${khan.title}: ${r.error}`,
                  );
                }
              }
            }
            const ice = s.cards[iceId];
            if (!ice.rezzed) {
              s.turn.currentRunPassedUnrezzedIceIds = [
                ...(s.turn.currentRunPassedUnrezzedIceIds ?? []),
                iceId,
              ];
              runState.lastPassedUnrezzedIceId = iceId;
              for (const rid of [...s.runner.rig]) {
                const rigCard = s.cards[rid];
                if (!rigCard?.onPassUnrezzedIce) continue;
                const r = evalEffect(
                  { state: s, sourceId: rid },
                  rigCard.onPassUnrezzedIce,
                );
                if (!r.ok) {
                  s.log.push(
                    `onPassUnrezzedIce failed on ${rigCard.title}: ${r.error}`,
                  );
                }
                if (s.pendingChoice) break;
              }
            } else if (ice.rezzed) {
              runState.lastPassedRezzedIceId = iceId;
              for (const rid of [...s.runner.rig]) {
                const rigCard = s.cards[rid];
                if (!rigCard?.onPassRezzedIce) continue;
                if (abilitiesSuppressed(s, rid)) continue;
                const r = evalEffect(
                  { state: s, sourceId: rid },
                  rigCard.onPassRezzedIce,
                );
                if (!r.ok) {
                  s.log.push(
                    `onPassRezzedIce failed on ${rigCard.title}: ${r.error}`,
                  );
                }
                if (s.pendingChoice) break;
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
            // Phoneutria-class onPass (fire while ice id is known).
            if (
              ice.onPass &&
              ice.rezzed &&
              !abilitiesSuppressed(s, iceId) &&
              !(runState.bypassedIceIds ?? []).includes(iceId)
            ) {
              const r = evalEffect({ state: s, sourceId: iceId }, ice.onPass);
              if (!r.ok) {
                s.log.push(`onPass failed on ${ice.title}: ${r.error}`);
              }
            }
            // Pichação-class: hosted trojans' onPassHost.
            if (
              ice.rezzed &&
              !(runState.bypassedIceIds ?? []).includes(iceId)
            ) {
              for (const hid of [...s.runner.rig]) {
                const hostee = s.cards[hid];
                if (!hostee?.onPassHost || hostee.hostId !== iceId) continue;
                if (abilitiesSuppressed(s, hid)) continue;
                const r = evalEffect(
                  { state: s, sourceId: hid },
                  hostee.onPassHost,
                );
                if (!r.ok) {
                  s.log.push(
                    `onPassHost failed on ${hostee.title}: ${r.error}`,
                  );
                }
                if (s.pendingChoice) break;
              }
            }
            // Cloud Eater: encounter end if rezzed this turn.
            if (
              ice.onEncounterEndIfRezzedThisTurn &&
              (s.turn.rezzedThisTurnIds ?? []).includes(iceId) &&
              !(runState.bypassedIceIds ?? []).includes(iceId)
            ) {
              const r = evalEffect(
                { state: s, sourceId: iceId },
                ice.onEncounterEndIfRezzedThisTurn,
              );
              if (!r.ok) {
                s.log.push(
                  `onEncounterEndIfRezzedThisTurn failed on ${ice.title}: ${r.error}`,
                );
              }
            }
            // Knowledge Seeker: whenever an encounter with this ice ends.
            if (ice.onEncounterEnd && ice.rezzed) {
              const r = evalEffect(
                { state: s, sourceId: iceId },
                ice.onEncounterEnd,
              );
              if (!r.ok) {
                s.log.push(`onEncounterEnd failed on ${ice.title}: ${r.error}`);
              }
            }
            // Weyland Builder of Nations: first advanced-ice encounter end → 1 meat.
            if (
              !s.turn.bmFirstAdvancedIceEncounterEndMeatUsed &&
              (ice.advancementTokens ?? 0) > 0
            ) {
              const idCard = s.cards[s.corp.identityId];
              if (idCard?.firstAdvancedIceEncounterEndMeatDamageEachTurn) {
                s.turn.bmFirstAdvancedIceEncounterEndMeatUsed = true;
                const r = evalEffect(
                  { state: s, sourceId: idCard.id },
                  { op: "do", action: { kind: "meat_damage", amount: 1 } },
                );
                if (!r.ok) {
                  s.log.push(
                    `Builder of Nations meat failed: ${r.error}`,
                  );
                } else {
                  s.log.push(
                    `Weyland Consortium: Builder of Nations — 1 meat damage.`,
                  );
                }
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
                const r = evalEffect(
                  { state: s, sourceId: iceId },
                  {
                    op: "do",
                    action: {
                      kind: "net_damage",
                      amount: chumEnc.netDamageIfNotFullyBroken,
                    },
                  },
                );
                if (!r.ok) {
                  s.log.push(`Chum net damage failed: ${r.error}`);
                } else {
                  s.log.push(
                    `Chum — ${chumEnc.netDamageIfNotFullyBroken} net damage (ice not fully broken).`,
                  );
                }
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
                const r = evalEffect(
                  { state: s, sourceId: bid },
                  {
                    op: "do",
                    action: { kind: "brahman_add_nonvirus_program_to_stack_top" },
                  },
                );
                if (!r.ok) {
                  s.log.push(`Brahman encounter-end failed: ${r.error}`);
                }
              }
              if (!br.removeVirusOrTrashOnEncounterEndIfBroke) continue;
              if ((br.virusCounters ?? 0) >= 1) {
                br.virusCounters = (br.virusCounters ?? 0) - 1;
                s.log.push(
                  `${br.title} — remove 1 virus counter (broke a subroutine).`,
                );
              } else {
                removeCardFromCurrentZone(s, bid);
                s.runner.discard.push(bid);
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
              for (const hid of ice.hostedCardIds ?? []) {
                const cond = s.cards[hid];
                if (!cond?.trashHostIfAllSubsBrokenThisEncounter) continue;
                removeCardFromCurrentZone(s, iceId);
                s.corp.discard.push(iceId);
                ice.zone = "corp:archives";
                ice.faceup = true;
                ice.rezzed = false;
                // Hosted condition goes with the ice to Archives.
                for (const cid of [...(ice.hostedCardIds ?? [])]) {
                  const hosted = s.cards[cid];
                  if (!hosted) continue;
                  removeCardFromCurrentZone(s, cid);
                  s.corp.discard.push(cid);
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
              for (const rid of s.runner.rig) {
                const sipa = s.cards[rid];
                if (!sipa?.maySwapOutermostIceOnPassAfterFullyBreakOncePerTurn) {
                  continue;
                }
                s.turn.sipaSwapUsedThisTurn = true;
                const r = evalEffect(
                  { state: s, sourceId: iceId },
                  {
                    op: "do",
                    action: { kind: "may_swap_ice_with_other_installed" },
                  },
                );
                if (!r.ok) {
                  s.log.push(`Sipa swap failed on ${sipa.title}: ${r.error}`);
                } else {
                  s.log.push(
                    `${sipa.title} — may swap outermost ${ice.title} with another ice.`,
                  );
                }
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
                  s.pendingChoice = {
                    sourceId: rid,
                    chooser: "corp",
                    options: [
                      ...others.map((oid) => ({
                        id: `mumbad-swap:${oid}`,
                        label: `Swap with ${s.cards[oid]!.title}`,
                        effect: {
                          op: "do" as const,
                          action: {
                            kind: "kg_mumbad_swap_passed_ice" as const,
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
                  };
                  s.log.push(
                    `${grid.title} — may swap ${ice.title} with another ice on this server.`,
                  );
                  break;
                }
              }
            }
            // Sisyphus: first pass of rezzed code gate or sentry each turn.
            if (
              ice.rezzed &&
              !s.turn.sisyphusPassUsedThisTurn &&
              ((ice.subtypes ?? []).includes("code gate") ||
                (ice.subtypes ?? []).includes("sentry"))
            ) {
              for (const sid of s.corp.score) {
                const scored = s.cards[sid];
                if (!scored?.onFirstPassRezzedCodeGateOrSentryThisTurn) {
                  continue;
                }
                s.turn.sisyphusPassUsedThisTurn = true;
                runState.pendingReencounterIceId = iceId;
                const r = evalEffect(
                  { state: s, sourceId: sid },
                  scored.onFirstPassRezzedCodeGateOrSentryThisTurn,
                );
                if (!r.ok) {
                  s.log.push(
                    `onFirstPassRezzedCodeGateOrSentryThisTurn failed on ${scored.title}: ${r.error}`,
                  );
                }
                break;
              }
            }
          }
        }
        s.run!.phase = "movement";
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
        // Encounter-scoped strength boosts expire (CR 3.9.5b).
        // Run-scoped pumps (duration: "run") persist until the run ends.
        s.run!.encounterStrengthBoosts = {};
        s.run!.iceStrengthBoosts = {};
        s.log.push(`Pass ice / move inward (appendix 11.4_4).`);
      },
    },
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
    "run.afterMove",
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
        s.run!.phase = "success";
        s.log.push(`Approach server (appendix 11.4_4_g).`);
        // Awakening Center: whenever the Runner passes all ice protecting
        // this server (this is exactly that moment — position is null and
        // the run has arrived here), may rez 1 hosted bioroid ice for −7¢
        // and force the Runner to encounter it. Fires once per run per
        // upgrade (the run re-enters this step after the forced encounter).
        if (!s.pendingChoice) {
          const sid0 = s.run!.attackedServerId;
          const server0 = s.servers[sid0];
          for (const id of server0.root) {
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
            s.pendingChoice = {
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
                        kind: "awakening_center_rez_hosted" as const,
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
            };
            s.log.push(
              `${card.title} — may rez a hosted bioroid ice (−7¢) and force the Runner to encounter it.`,
            );
            break;
          }
        }
        if (!s.pendingChoice && !s.psi) {
          const sidCap = s.run!.attackedServerId;
          const serverCap = s.servers[sidCap];
          for (const id of serverCap.root) {
            const card = s.cards[id];
            if (!card?.rezzed || !card.onPassAllIceProtectingServer) continue;
            if (abilitiesSuppressed(s, id)) continue;
            const r = evalEffect(
              { state: s, sourceId: id },
              card.onPassAllIceProtectingServer,
            );
            if (!r.ok) {
              s.log.push(
                `onPassAllIceProtectingServer failed on ${card.title}: ${r.error}`,
              );
            }
            if (s.pendingChoice || s.psi) break;
          }
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
              (iceId) => (s.cards[iceId]?.advancementTokens ?? 0) > 0,
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
              s.pendingChoice = {
                sourceId: id,
                chooser: "runner",
                options,
              };
              s.log.push(
                `${card.title} — approach tax: pay ${cost}¢ (${per}¢ × ${advanced} advanced ice) or ETR.`,
              );
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
          s.pendingChoice = {
            sourceId: id,
            chooser: "runner",
            options,
          };
          s.log.push(
            `${card.title} — approach tax: pay ${tax.clicks} clicks or ${tax.credits}¢ or ETR.`,
          );
          break;
        }
        // Nanisivik Grid-class: rezzed root onApproachServer (if no pending yet).
        if (!s.pendingChoice) {
          for (const id of server.root) {
            const card = s.cards[id];
            if (!card.rezzed || !card.onApproachServer) continue;
            if (abilitiesSuppressed(s, id)) continue;
            if (card.onApproachServerOncePerRun) {
              const fired = s.run?.approachServerTriggersFiredIds ?? [];
              if (fired.includes(id)) continue;
            }
            const r = evalEffect(
              { state: s, sourceId: id },
              card.onApproachServer,
            );
            if (!r.ok) {
              s.log.push(`onApproachServer failed on ${card.title}: ${r.error}`);
            }
            if (card.onApproachServerOncePerRun && s.run) {
              s.run.approachServerTriggersFiredIds = [
                ...(s.run.approachServerTriggersFiredIds ?? []),
                id,
              ];
            }
            if (s.pendingChoice) break;
          }
        }
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
        // Track first successful run of any server (Pravdivost-class).
        let firstSuccessfulRun = false;
        // Sneakdoor: redirect attacked server before declaring success.
        if (s.run?.redirectSuccessChooseHqOrRd && !s.pendingChoice) {
          s.run.redirectSuccessChooseHqOrRd = false;
          s.pendingChoice = {
            sourceId: s.run.runSourceId ?? s.runner.identityId,
            chooser: "runner",
            options: [
              {
                id: "hq",
                label: "Change attacked server to HQ",
                effect: {
                  op: "do",
                  action: { kind: "omar_redirect_success", serverId: "hq" },
                },
              },
              {
                id: "rd",
                label: "Change attacked server to R&D",
                effect: {
                  op: "do",
                  action: { kind: "omar_redirect_success", serverId: "rd" },
                },
              },
            ],
          };
          s.log.push(`Omar Keung — choose HQ or R&D for successful run.`);
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
          firstSuccessfulRun = !s.turn.successfulRunThisTurn;
          s.run!.successful = true;
          s.turn.successfulRunThisTurn = true;
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
                  const r = evalEffect(
                    { state: s, sourceId: id },
                    { op: "do", action: { kind: "trash_self" } },
                  );
                  if (!r.ok) {
                    s.log.push(
                      `trashSelfOnCorpSuccessfulHqRun failed on ${up.title}: ${r.error}`,
                    );
                  }
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
              const r = evalEffect(
                { state: s, sourceId: s.corp.identityId },
                { op: "do", action: { kind: "flip_identity" } },
              );
              if (!r.ok) {
                s.log.push(
                  `flipIdentityOnSuccessfulCentralRun failed on ${corpId.title}: ${r.error}`,
                );
              }
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
          for (const id of s.runner.rig) {
            const card = s.cards[id];
            if (
              card.securityTesting &&
              card.namedServerId === s.run!.attackedServerId
            ) {
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
            s.runner.rig.push(id);
            card.zone = "runner:rig";
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
            s.runner.rig.push(id);
            card.zone = "runner:rig";
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
            s.runner.rig.push(id);
            card.zone = "runner:rig";
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
          const prog = s.runner.discard.find(
            (id) => s.cards[id].type === "program",
          );
          if (prog) {
            const card = s.cards[prog];
            s.runner.discard = s.runner.discard.filter((x) => x !== prog);
            s.runner.rig.push(prog);
            card.zone = "runner:rig";
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
            if (idCard?.steveCambridge && s.runner.discard.length >= 2) {
              s.turn.steveCambridgeUsedThisTurn = true;
              const a = s.runner.discard[0]!;
              const b = s.runner.discard[1]!;
              s.runner.discard = s.runner.discard.filter(
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
        // Fire onSuccessfulRun only when actually successful.
        if (s.run!.successful) {
          const fireSuccessfulRun = (cardId: string): void => {
            const card = s.cards[cardId];
            if (!card?.onSuccessfulRun) return;
            if (
              card.onSuccessfulRunOncePerTurn &&
              s.turn.onSuccessfulRunFiredIds.includes(cardId)
            ) {
              return;
            }
            const r = evalEffect(
              { state: s, sourceId: cardId },
              card.onSuccessfulRun,
            );
            if (!r.ok) {
              s.log.push(
                `onSuccessfulRun failed on ${card.title}: ${r.error}`,
              );
              return;
            }
            if (card.onSuccessfulRunOncePerTurn) {
              s.turn.onSuccessfulRunFiredIds.push(cardId);
            }
          };

          // Runner identity (Nyusha-class mark success triggers).
          fireSuccessfulRun(s.runner.identityId);

          for (const id of s.runner.rig) {
            fireSuccessfulRun(id);
          }
          for (const id of s.runner.rig) {
            if (s.pendingChoice) break;
            const card = s.cards[id];
            if (!card?.caissaAdvanceOnSuccessfulRun || !card.hostId) continue;
            const r = evalEffect(
              { state: s, sourceId: id },
              {
                op: "do",
                action: { kind: "caissa_advance_host_inward_or_install" },
              },
            );
            if (!r.ok) {
              s.log.push(
                `Caïssa advance failed on ${card.title}: ${r.error}`,
              );
            }
          }
          // Chakana: fire whenever the successful run was on R&D specifically.
          if (s.run!.attackedServerId === "rd") {
            for (const id of s.runner.rig) {
              const card = s.cards[id];
              if (!card?.onSuccessfulRunOnRd) continue;
              const r = evalEffect({ state: s, sourceId: id }, card.onSuccessfulRunOnRd);
              if (!r.ok) {
                s.log.push(`onSuccessfulRunOnRd failed on ${card.title}: ${r.error}`);
              }
            }
          }
          // Mu Safecracker-class: may pay for bonus access on successful HQ/R&D.
          for (const id of s.runner.rig) {
            if (s.pendingChoice) break;
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
            s.pendingChoice = {
              sourceId: id,
              chooser: "runner",
              options,
            };
            s.log.push(
              `${card.title} — may pay ${spec.credits}¢ for +${spec.bonusAccess} access on ${attackedSid}.`,
            );
          }
          // Hosted Runner cards on ice protecting the attacked server (Stowaway).
          for (const iceId of server.ice) {
            for (const [cardId, card] of Object.entries(s.cards)) {
              if (
                card.hostId === iceId &&
                card.side === "runner" &&
                card.onSuccessfulRun
              ) {
                fireSuccessfulRun(cardId);
              }
            }
          }
          for (const id of [...server.root, ...server.ice]) {
            const card = s.cards[id];
            if (!card?.rezzed || !card.onSuccessfulRun) continue;
            if (abilitiesSuppressed(s, id)) continue;
            fireSuccessfulRun(id);
          }
          // Active lockdowns in corp:play-area (Argus / Hyoubu).
          for (const id of activeLockdownIds(s)) {
            fireSuccessfulRun(id);
          }
          for (const id of activeCorpCurrentIds(s)) {
            fireSuccessfulRun(id);
          }
          for (const id of activeRunnerCurrentIds(s)) {
            fireSuccessfulRun(id);
          }
          // Puppet Master: may place 1 advancement on a card that can be advanced.
          for (const id of s.corp.score) {
            const card = s.cards[id];
            if (!card?.onSuccessfulRunMayPlaceAdvancementOnCanBeAdvanced) continue;
            if (abilitiesSuppressed(s, id)) continue;
            const r = evalEffect(
              { state: s, sourceId: id },
              {
                op: "do",
                action: { kind: "tlm_puppet_master_place_advancement" },
              },
            );
            if (!r.ok) {
              s.log.push(`Puppet Master failed: ${r.error}`);
            }
          }
          // Dedicated Neural Net: first successful HQ each turn → psi; Corp chooses access.
          if (
            s.run!.attackedServerId === "hq" &&
            !s.turn.tlmDedicatedNeuralNetUsedThisTurn
          ) {
            for (const id of s.corp.score) {
              const card = s.cards[id];
              if (!card?.firstSuccessfulHqRunEachTurnPsiCorpChoosesAccess) continue;
              if (abilitiesSuppressed(s, id)) continue;
              s.turn.tlmDedicatedNeuralNetUsedThisTurn = true;
              const r = evalEffect(
                { state: s, sourceId: id },
                {
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
              );
              if (!r.ok) {
                s.log.push(`Dedicated Neural Net psi failed: ${r.error}`);
              } else {
                s.run!.tlmCorpChoosesHqAccess = true;
                s.log.push(
                  `${card.title} — psi on first successful HQ; Corp may choose HQ access this run.`,
                );
              }
              break;
            }
          }
          // Sacrifice Zone: faceup agendas on other servers.
          const attacked = s.run!.attackedServerId;
          for (const [sid, srv] of Object.entries(s.servers)) {
            if (sid === attacked) continue;
            for (const id of srv.root) {
              const card = s.cards[id];
              if (!card?.onSuccessfulRunOtherServerOncePerTurn) continue;
              if (s.turn.otherServerSuccessAbilityUsedIds.includes(id)) continue;
              if (abilitiesSuppressed(s, id)) continue;
              // Public faceup agendas are neither rezzed nor unrezzed.
              if (!card.faceup && !card.rezzed) continue;
              s.turn.otherServerSuccessAbilityUsedIds.push(id);
              const r = evalEffect(
                { state: s, sourceId: id },
                card.onSuccessfulRunOtherServerOncePerTurn,
              );
              if (!r.ok) {
                s.log.push(
                  `onSuccessfulRunOtherServerOncePerTurn failed on ${card.title}: ${r.error}`,
                );
              }
            }
          }
          const src = s.run!.runSourceId;
          const fxRun = s.run!.onSuccessfulRunEffect;
          if (src && fxRun) {
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
            const r = evalEffect(
              { state: s, sourceId: src },
              {
                op: "do",
                action: { kind: "analog_dreamers_may_instead_of_breach" },
              },
            );
            if (!r.ok) {
              s.log.push(`Analog Dreamers instead-of-breach failed: ${r.error}`);
            }
          }

          // Top Hat: may access 1 of top N instead of breaching R&D.
          if (s.run!.successful && s.run!.attackedServerId === "rd") {
            for (const rid of s.runner.rig) {
              const hat = s.cards[rid];
              const n = hat?.mayInsteadOfBreachRdAccessOneOfTopN;
              if (!n) continue;
              const r = evalEffect(
                { state: s, sourceId: rid },
                {
                  op: "do",
                  action: { kind: "top_hat_may_instead_of_breach", n },
                },
              );
              if (!r.ok) {
                s.log.push(`Top Hat instead-of-breach failed: ${r.error}`);
              }
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
            const fireMark = (cardId: string): void => {
              const card = s.cards[cardId];
              if (!card?.onFirstSuccessfulMarkRunThisTurn) return;
              const r = evalEffect(
                { state: s, sourceId: cardId },
                card.onFirstSuccessfulMarkRunThisTurn,
              );
              if (!r.ok) {
                s.log.push(
                  `onFirstSuccessfulMarkRunThisTurn failed on ${card.title}: ${r.error}`,
                );
              }
            };
            for (const id of s.runner.rig) {
              fireMark(id);
            }
            fireMark(s.runner.identityId);
          }

          // First successful HQ run this turn (PAN-Weave-class).
          if (firstSuccessfulHq) {
            const fireHq = (cardId: string): void => {
              const card = s.cards[cardId];
              if (!card?.onFirstSuccessfulHqRunThisTurn) return;
              const r = evalEffect(
                { state: s, sourceId: cardId },
                card.onFirstSuccessfulHqRunThisTurn,
              );
              if (!r.ok) {
                s.log.push(
                  `onFirstSuccessfulHqRunThisTurn failed on ${card.title}: ${r.error}`,
                );
              }
            };
            for (const id of s.runner.rig) {
              fireHq(id);
            }
            fireHq(s.runner.identityId);
          }

          // First successful central run this turn (Zenit-class).
          if (firstSuccessfulCentral) {
            const fireCentral = (cardId: string): void => {
              const card = s.cards[cardId];
              if (!card?.onFirstSuccessfulCentralRunThisTurn) return;
              const r = evalEffect(
                { state: s, sourceId: cardId },
                card.onFirstSuccessfulCentralRunThisTurn,
              );
              if (!r.ok) {
                s.log.push(
                  `onFirstSuccessfulCentralRunThisTurn failed on ${card.title}: ${r.error}`,
                );
              }
            };
            for (const id of s.runner.rig) {
              fireCentral(id);
            }
            fireCentral(s.runner.identityId);
          }

          // First/second successful run this turn (Pravdivost / John / DreamNet /
          // Enhanced Vision genetics via Gene Conditioning Shoppe).
          {
            const count = (s.turn.valSuccessfulRunTriggerCount ?? 0) + 1;
            s.turn.valSuccessfulRunTriggerCount = count;
            let geneticsThreshold = 1;
            for (const id of s.runner.rig) {
              if (s.cards[id]?.geneticsAlsoTriggerSecondTime) {
                geneticsThreshold = 2;
                break;
              }
            }
            const fireFirst = (cardId: string): void => {
              const card = s.cards[cardId];
              if (!card?.onFirstSuccessfulRunThisTurn) return;
              const isGenetics = (card.subtypes ?? []).includes("genetics");
              const lim = isGenetics ? geneticsThreshold : 1;
              if (count > lim) return;
              const r = evalEffect(
                { state: s, sourceId: cardId },
                card.onFirstSuccessfulRunThisTurn,
              );
              if (!r.ok) {
                s.log.push(
                  `onFirstSuccessfulRunThisTurn failed on ${card.title}: ${r.error}`,
                );
              }
            };
            if (firstSuccessfulRun || count <= geneticsThreshold) {
              fireFirst(s.corp.identityId);
              for (const server of Object.values(s.servers)) {
                for (const id of [...server.root, ...server.ice]) {
                  const card = s.cards[id];
                  if (!card?.rezzed || !card.onFirstSuccessfulRunThisTurn) continue;
                  if (abilitiesSuppressed(s, id)) continue;
                  fireFirst(id);
                }
              }
              for (const id of s.runner.rig) {
                if (abilitiesSuppressed(s, id)) continue;
                fireFirst(id);
              }
              fireFirst(s.runner.identityId);
            }
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
        // First unsuccessful run this turn (John Masanori-class).
        const firstUnsuccessful = !s.turn.unsuccessfulRunThisTurn;
        s.turn.unsuccessfulRunThisTurn = true;
        if (firstUnsuccessful) {
          const fireUnsuccessful = (cardId: string): void => {
            const card = s.cards[cardId];
            if (!card?.onFirstUnsuccessfulRunThisTurn) return;
            const r = evalEffect(
              { state: s, sourceId: cardId },
              card.onFirstUnsuccessfulRunThisTurn,
            );
            if (!r.ok) {
              s.log.push(
                `onFirstUnsuccessfulRunThisTurn failed on ${card.title}: ${r.error}`,
              );
            }
          };
          for (const id of [...s.runner.rig]) {
            if (abilitiesSuppressed(s, id)) continue;
            fireUnsuccessful(id);
            const c = s.cards[id];
            if (c?.trashSelfOnUnsuccessfulRunThisTurn) {
              moveRunnerCardToHeap(s, id);
              s.log.push(`${c.title} — trashed (unsuccessful run).`);
            }
          }
          fireUnsuccessful(s.runner.identityId);
          fireUnsuccessful(s.corp.identityId);
          for (const server of Object.values(s.servers)) {
            for (const id of [...server.root, ...server.ice]) {
              const card = s.cards[id];
              if (!card?.rezzed || !card.onFirstUnsuccessfulRunThisTurn) continue;
              if (abilitiesSuppressed(s, id)) continue;
              fireUnsuccessful(id);
            }
          }
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
        const runState = s.run!;
        // Window: Corp may rez the ice derezzed at run begin (before cleanup).
        if (
          runState.mayRezEventDerezzedIceOnRunEndIgnoreCosts &&
          runState.eventDerezzedIceId
        ) {
          const iceId = runState.eventDerezzedIceId;
          runState.mayRezEventDerezzedIceOnRunEndIgnoreCosts = false;
          runState.endedTheRun = true;
          const src = runState.runSourceId ?? iceId;
          const r = evalEffect(
            { state: s, sourceId: src },
            {
              op: "do",
              action: { kind: "may_rez_event_derezzed_ice_ignore_costs" },
            },
          );
          if (!r.ok) {
            s.log.push(`Window rez on run end failed: ${r.error}`);
          }
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
            if (s.pendingChoice) break;
            const src =
              s.runner.discard.find((id) => s.cards[id]?.title === title) ??
              s.runner.identityId;
            const r = evalEffect(
              { state: s, sourceId: src },
              {
                op: "do",
                action: {
                  kind: "may_shuffle_title_from_heap_into_stack",
                  title,
                },
              },
            );
            if (!r.ok) {
              s.log.push(
                `May shuffle ${title} from heap on successful run end failed: ${r.error}`,
              );
            }
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
        // Mayfly: trash if it broke a sub this run
        for (const breakerId of runState.breakersThatBroke ?? []) {
          const br = s.cards[breakerId];
          if (!br?.trashAfterBreakingThisRun) continue;
          if (!s.runner.rig.includes(breakerId)) continue;
          const idx = s.runner.rig.indexOf(breakerId);
          s.runner.rig.splice(idx, 1);
          s.runner.discard.push(breakerId);
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
          for (const rid of s.runner.rig) {
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
        // Zahya: once per turn on HQ/R&D run end, gain 1¢ per access
        const sid = runState.attackedServerId;
        if (
          (sid === "hq" || sid === "rd") &&
          !s.turn.zahyaRunEndUsed
        ) {
          const idCard = s.cards[s.runner.identityId];
          if (idCard?.creditsPerAccessOnCentralRunEnd) {
            const n = runState.accessedCardIds.length;
            if (n > 0) {
              s.runner.credits += n;
              s.turn.zahyaRunEndUsed = true;
              s.log.push(
                `Zahya Sadeghi — gain ${n}¢ (${n} access(es) on ${sid}).`,
              );
            }
          }
        }
        // Obelus: first successful HQ/R&D run end → draw 1 per access.
        if (
          (sid === "hq" || sid === "rd") &&
          runState.successful &&
          !s.turn.esObelusRunEndUsed
        ) {
          for (const rid of s.runner.rig) {
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
                  if (card.revealDrawnCards || s.runner.rig.some((x) => s.cards[x]?.revealDrawnCards)) {
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
        // Psych Mike: first successful R&D run end each turn.
        if (
          sid === "rd" &&
          runState.successful &&
          !s.turn.firstSuccessfulRdRunEndUsedThisTurn
        ) {
          for (const rid of s.runner.rig) {
            const card = s.cards[rid];
            if (!card?.onFirstSuccessfulRunOnRdEndsThisTurn) continue;
            s.turn.firstSuccessfulRdRunEndUsedThisTurn = true;
            const r = evalEffect(
              { state: s, sourceId: rid },
              card.onFirstSuccessfulRunOnRdEndsThisTurn,
            );
            if (!r.ok) {
              s.log.push(
                `onFirstSuccessfulRunOnRdEndsThisTurn failed on ${card.title}: ${r.error}`,
              );
            }
            break;
          }
        }
        // Amelia Earhart: HQ/R&D run end, if accessed ≥ min, place power.
        if (sid === "hq" || sid === "rd") {
          const accessed = runState.accessedCardIds.length;
          for (const rid of s.runner.rig) {
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
            for (const rid of s.runner.rig) {
              const card = s.cards[rid];
              if (!card?.placePowerOnHqOrRdRunEndIfNoAgendaStolen) continue;
              card.powerCounters = (card.powerCounters ?? 0) + 1;
              s.log.push(
                `${card.title} — place 1 power (no agenda stolen on ${sid.toUpperCase()}) → ${card.powerCounters}.`,
              );
            }
          }
        }
        // Amaze persistent: tags if agenda stolen this run
        if (
          (runState.agendasStolenThisRun ?? 0) > 0 &&
          (runState.persistentTagsIfAgendaStolen ?? 0) > 0
        ) {
          const n = runState.persistentTagsIfAgendaStolen!;
          s.runner.tags += n;
          s.turn.tagsGivenThisTurn += n;
          s.log.push(
            `AMAZE Amusements — give ${n} tag(s) (agenda stolen this run).`,
          );
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
        // Doppelgänger: once per turn when a successful run ends (may_start_run).
        if (runState.successful === true && !s.pendingChoice) {
          for (const rid of s.runner.rig) {
            if (s.pendingChoice) break;
            const card = s.cards[rid];
            if (!card?.onSuccessfulRunEndOncePerTurn) continue;
            if (s.turn.onSuccessfulRunEndFiredIds.includes(rid)) continue;
            const r = evalEffect(
              { state: s, sourceId: rid },
              card.onSuccessfulRunEndOncePerTurn,
            );
            if (!r.ok) {
              s.log.push(
                `onSuccessfulRunEndOncePerTurn failed on ${card.title}: ${r.error}`,
              );
              continue;
            }
            s.turn.onSuccessfulRunEndFiredIds.push(rid);
          }
        }
        // Dedicated Response Team: whenever a successful run ends (rezzed Corp).
        if (runState.successful === true && !s.pendingChoice) {
          for (const server of Object.values(s.servers)) {
            for (const id of [...server.root, ...server.ice]) {
              if (s.pendingChoice) break;
              const card = s.cards[id];
              if (!card?.rezzed || !card.onSuccessfulRunEnd) continue;
              if (abilitiesSuppressed(s, id)) continue;
              const r = evalEffect(
                { state: s, sourceId: id },
                card.onSuccessfulRunEnd,
              );
              if (!r.ok) {
                s.log.push(
                  `onSuccessfulRunEnd failed on ${card.title}: ${r.error}`,
                );
              }
            }
          }
        }
        // Arissana: trash identity-installed program if not subtype.
        const arissanaId = runState.identityInstalledProgramId;
        const unlessSubtype = runState.identityInstalledProgramTrashUnlessSubtype;
        if (arissanaId && unlessSubtype !== undefined) {
          const prog = s.cards[arissanaId];
          if (
            prog &&
            s.runner.rig.includes(arissanaId) &&
            !(prog.subtypes ?? []).includes(unlessSubtype)
          ) {
            const idx = s.runner.rig.indexOf(arissanaId);
            s.runner.rig.splice(idx, 1);
            s.runner.discard.push(arissanaId);
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
            if (installedIce) {
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
                s.corp.discard.push(runState.howlerId);
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
          s.corp.discard.push(iceId);
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
        runState.strengthBoosts = {};
        runState.encounterStrengthBoosts = {};
        runState.iceStrengthBoosts = {};
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
            accessRemaining: null,
            encounter: null,
            endedTheRun: false,
            cannotJackOut: false,
            strengthBoosts: {},
            encounterStrengthBoosts: {},
            iceStrengthBoosts: {},
            accessingCardId: null,
            isPostRunBreach: true,
          };
        } else {
          s.run = null;
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
      const cands = s.run!.accessCandidates;
      const remaining = s.run!.accessRemaining;
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
        run.accessRemaining = null;
        run.accessingCardId = null;
        run.accessedCardIds = [];
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
        s.log.push(`Breach complete (appendix 11.5_7).`);
        if (
          s.run &&
          !s.run.isPostRunBreach &&
          !(s.run.queuedBreachesAfterCurrent?.length)
        ) {
          s.run.phase = "ends";
        }
      },
    },
  ),
};

export const START_STEP = "corp.gainClicks";

/** Convenience aliases used by older call sites / tests. */
export const CORP_STEPS = {
  gainClicks: STEPS["corp.gainClicks"],
  mandatoryDraw: STEPS["corp.mandatoryDraw"],
  actionWindow: STEPS["corp.actionPaw"],
  takeAction: STEPS["corp.takeAction"],
  actionPhaseEnd: STEPS["corp.actionPhaseEnd"],
  discard: STEPS["corp.discard"],
  turnComplete: STEPS["corp.turnComplete"],
} as const;

export const RUNNER_STEPS = {
  gainClicks: STEPS["runner.gainClicks"],
  actionWindow: STEPS["runner.actionPaw"],
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
