import type {
  Action,
  GameState,
  TimingCursor,
  TurnPhase,
} from "../state/types.js";
import { abilitiesSuppressed } from "../state/abilities.js";
import { refillRecurringCredits } from "../state/costs.js";
import { evalEffect, fireOnBypassTriggers, fireHostRezStateTriggers } from "../effects/eval.js";
import { beginBreachAccess } from "../state/access.js";
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
        for (const card of Object.values(s.cards)) {
          if (!card.onCorpTurnEnd || !card.rezzed) continue;
          if (!card.zone.endsWith(":root")) continue;
          const r = evalEffect({ state: s, sourceId: card.id }, card.onCorpTurnEnd);
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
        // Security Testing: name a server (auto HQ).
        for (const id of s.runner.rig) {
          const card = s.cards[id];
          if (card.securityTesting) {
            card.namedServerId = "hq";
            s.log.push(`${card.title} — name HQ (auto).`);
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
          if (!card?.onTurnBegin) continue;
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
        // Amanuensis-class: installed Runner cards' onRunnerTurnEnd.
        for (const id of [...s.runner.rig]) {
          const card = s.cards[id];
          if (!card?.onRunnerTurnEnd) continue;
          const r = evalEffect({ state: s, sourceId: id }, card.onRunnerTurnEnd);
          if (!r.ok) {
            s.log.push(`onRunnerTurnEnd error on ${card.title}: ${r.error}`);
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
    "run.begin",
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
        // installed cards (Tributary).
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
            const r = evalEffect({ state: s, sourceId: id }, card.onApproachIce);
            if (!r.ok) {
              s.log.push(`onApproachIce failed on ${card.title}: ${r.error}`);
            }
            if (s.pendingChoice) break;
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
          s.servers[runState.attackedServerId].ice[runState.position!];
        const ice = s.cards[iceId];
        runState.iceEncounteredCount = (runState.iceEncounteredCount ?? 0) + 1;
        // Inside Job / S-Dobrado: bypass first encounter
        if (runState.bypassFirstEncounter) {
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
        }
        const subs = ice.subroutines ?? [];
        runState.phase = "encounter";
        if (!runState.encounter) {
          runState.encounter = {
            iceId,
            broken: subs.map(() => false),
          };
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
          !(runState.bypassedIceIds ?? []).includes(iceId)
        ) {
          // Defer for when_encountered_interrupt_paw (AirbladeX); otherwise
          // fire immediately so encounter choices appear at encounter start.
          runState.encounter!.onEncounterPending = true;
          if (!runnerHasWhenEncounteredInterrupt(s)) {
            resolvePendingOnEncounter(s);
          }
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
    { allows: ["break_subroutine", "break_bioroid_subroutine", "use_paid_ability", "pass_window"] },
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
    (s) => (s.run!.endedTheRun ? "run.ends" : "run.checkSubs"),
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
        s.run.reencounterIceId = undefined;
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
            const ice = s.cards[iceId];
            if (!ice.rezzed) {
              s.turn.currentRunPassedUnrezzedIceIds = [
                ...(s.turn.currentRunPassedUnrezzedIceIds ?? []),
                iceId,
              ];
            } else if ((ice.subtypes ?? []).includes("bioroid")) {
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
      if (s.pendingChoice || s.run?.endedTheRun) {
        return s.run?.endedTheRun
          ? "run.ends"
          : "run.approachServerPaw";
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
      return "run.success";
    },
    {
      onResolve: (s) => {
        s.run!.phase = "success";
        s.log.push(`Approach server (appendix 11.4_4_g).`);
        // Open Manegarm tax as a pending Runner choice if applicable.
        const sid = s.run!.attackedServerId;
        const server = s.servers[sid];
        for (const id of server.root) {
          const card = s.cards[id];
          if (!card.rezzed || !card.approachServerTax) continue;
          if (abilitiesSuppressed(s, id)) continue;
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
            const r = evalEffect(
              { state: s, sourceId: id },
              card.onApproachServer,
            );
            if (!r.ok) {
              s.log.push(`onApproachServer failed on ${card.title}: ${r.error}`);
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
    (s) => (s.run?.endedTheRun ? "run.ends" : "run.success"),
    { allows: ["use_paid_ability", "rez_asset", "pass_window"] },
  ),
  "run.success": run(
    "run.success",
    "sec_appendix_timing_structure_of_a_run_5_a",
    "11.4_5_a",
    "The run is declared successful.",
    "auto",
    (s) => {
      if (s.run?.successful === false) return "run.ends";
      if (s.run?.skipBreach) return "run.ends";
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
        if (s.run?.redirectSuccessTo) {
          const dest = s.run.redirectSuccessTo;
          s.log.push(
            `Redirect successful run from ${s.run.attackedServerId} to ${dest}.`,
          );
          s.run.attackedServerId = dest;
          s.run.redirectSuccessTo = undefined;
        }
        // Crisium Grid: runs against this server cannot be declared successful.
        const server = s.servers[s.run!.attackedServerId];
        const crisium = server.root.some((id) => {
          const c = s.cards[id];
          return (
            c.rezzed &&
            c.runsCannotBeSuccessful &&
            !abilitiesSuppressed(s, id)
          );
        });
        if (crisium) {
          s.run!.successful = false;
          s.log.push(
            `Run is not successful — Crisium Grid (cannot declare successful).`,
          );
        } else {
          firstSuccessfulRun = !s.turn.successfulRunThisTurn;
          s.run!.successful = true;
          s.turn.successfulRunThisTurn = true;
          {
            const sid = s.run!.attackedServerId;
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
          if (s.run!.attackedServerId === "archives") {
            s.turn.successfulArchivesRunThisTurn = true;
          }
          s.turn.lastRunPassedUnrezzedIceIds = [
            ...(s.turn.currentRunPassedUnrezzedIceIds ?? []),
          ];
          s.log.push(`Run successful (CR 6.7.2).`);
        }
        // Security Testing: first successful run on named server → 2¢ instead of breach.
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
          }
        }
        // Retrieval Run: skip breach, may install program from heap.
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
        // Steve Cambridge: first successful HQ each turn.
        if (
          s.run!.successful &&
          s.run!.attackedServerId === "hq" &&
          !s.turn.steveCambridgeUsedThisTurn
        ) {
          const idCard = s.cards[s.runner.identityId];
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
          for (const id of [...server.root, ...server.ice]) {
            const card = s.cards[id];
            if (!card?.rezzed || !card.onSuccessfulRun) continue;
            if (abilitiesSuppressed(s, id)) continue;
            fireSuccessfulRun(id);
          }
          const src = s.run!.runSourceId;
          const fxRun = s.run!.onSuccessfulRunEffect;
          if (src && fxRun) {
            const r = evalEffect({ state: s, sourceId: src }, fxRun);
            if (!r.ok) {
              s.log.push(`Run-source onSuccessfulRun failed: ${r.error}`);
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

          // First successful run this turn (any server; Pravdivost-class).
          if (firstSuccessfulRun) {
            const fireFirst = (cardId: string): void => {
              const card = s.cards[cardId];
              if (!card?.onFirstSuccessfulRunThisTurn) return;
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
            fireFirst(s.corp.identityId);
            for (const server of Object.values(s.servers)) {
              for (const id of [...server.root, ...server.ice]) {
                const card = s.cards[id];
                if (!card?.rezzed || !card.onFirstSuccessfulRunThisTurn) continue;
                if (abilitiesSuppressed(s, id)) continue;
                fireFirst(id);
              }
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
        if (runState.successful === true) {
          s.log.push(`Run complete — successful (appendix 11.4_6_d).`);
        } else {
          s.log.push(
            `Run complete — unsuccessful (appendix 11.4_6_d / 11.4_6_c).`,
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
        const postBreach = runState.breachWhenRunEnds;
        // Restore Thunderbolt-granted subroutines before clearing run boosts.
        for (const iceId of runState.thunderboltGrantedIceIds ?? []) {
          const ice = s.cards[iceId];
          if (!ice?.baseSubroutines) continue;
          ice.subroutines = structuredClone(ice.baseSubroutines);
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
      // Clear post-run breach shell here (after onResolve) so next() still
      // sees isPostRunBreach — otherwise we'd incorrectly re-enter run.ends.
      if (s.run?.isPostRunBreach) {
        s.run = null;
        return "runner.actionPaw";
      }
      return "run.ends";
    },
    {
      onResolve: (s) => {
        s.log.push(`Breach complete (appendix 11.5_7).`);
        if (s.run && !s.run.isPostRunBreach) {
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
  begin: STEPS["run.begin"],
  checkIce: STEPS["run.checkIce"],
  approachServer: STEPS["run.approachServer"],
  success: STEPS["run.success"],
  breach: STEPS["run.breachLink"],
  runEnds: STEPS["run.ends"],
} as const;

export const BREACH_STEPS = {
  begin: STEPS["breach.begin"],
  choose: STEPS["breach.choose"],
  access: STEPS["breach.access"],
  complete: STEPS["breach.complete"],
  awaitAccess: STEPS["breach.awaitAccess"],
} as const;
