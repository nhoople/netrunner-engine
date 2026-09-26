import type {
  Action,
  GameState,
  TimingCursor,
  TurnPhase,
} from "../state/types.js";
import { refillRecurringCredits } from "../state/costs.js";
import { evalEffect } from "../effects/eval.js";
import { beginBreachAccess } from "../state/access.js";
import {
  beginCorpTurnFlags,
  beginRunnerTurnFlags,
} from "../state/turn.js";
import { log } from "../state/createGame.js";

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
        s.corp.clicks = 3;
        s.log.push(
          `Corp gains 3 clicks (CR 1.11.2a / appendix 11.2_1_a).`,
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
        s.runner.clicks = 4;
        s.log.push(
          `Runner gains 4 clicks (CR 1.11.2b / appendix 11.3_1_a). No draw phase (CR 5.3.3).`,
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
  ),
  "runner.discard": runner(
    "runner.discard",
    "sec_appendix_timing_structure_runners_turn_2_a",
    "11.3_2_a",
    "The Runner discards cards.",
    "discard",
    "runner_discard",
    "runner.discardPaw",
    { allows: ["discard_to_hand_size"] },
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
  ),
  "run.checkIce": run(
    "run.checkIce",
    "sec_appendix_timing_structure_of_a_run_1_f",
    "11.4_1_f",
    "Does the Runner have a position corresponding to a piece of ice?",
    "branch",
    (s) => {
      const runState = s.run!;
      const server = s.servers[runState.attackedServerId];
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
        // Inside Job: bypass first encounter
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
        }
        const subs = ice.subroutines ?? [];
        runState.phase = "encounter";
        if (!runState.encounter) {
          runState.encounter = {
            iceId,
            broken: subs.map(() => false),
          };
        }
        s.log.push(
          `Encounter ${ice.title} (appendix 11.4_3_a / CR 6.5.1) with ${subs.length} subroutine(s).`,
        );
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
        if (ice.onEncounter && !(runState.bypassedIceIds ?? []).includes(iceId)) {
          const r = evalEffect({ state: s, sourceId: iceId }, ice.onEncounter);
          if (!r.ok) {
            s.log.push(`onEncounter failed on ${ice.title}: ${r.error}`);
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
        s.log.push(
          `Resolve subroutine "${sub.text}" (appendix 11.4_3_c_i / CR 6.5.5).`,
        );
        const r = evalEffect({ state: s, sourceId: ice.id }, sub.effect);
        if (!r.ok) {
          s.log.push(`Subroutine effect failed: ${r.error}`);
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
    "run.jackOutWindow",
    {
      onResolve: (s) => {
        s.run!.phase = "movement";
        s.run!.encounter = null;
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
    "run.breachLink",
    {
      onResolve: (s) => {
        // Sneakdoor: redirect attacked server before declaring success.
        if (s.run?.redirectSuccessTo) {
          const dest = s.run.redirectSuccessTo;
          s.log.push(
            `Redirect successful run from ${s.run.attackedServerId} to ${dest}.`,
          );
          s.run.attackedServerId = dest;
          s.run.redirectSuccessTo = undefined;
        }
        s.run!.successful = true;
        s.turn.successfulRunThisTurn = true;
        s.log.push(`Run successful (CR 6.7.2).`);
        // Fire onSuccessfulRun on installed runner cards.
        for (const id of s.runner.rig) {
          const card = s.cards[id];
          if (!card?.onSuccessfulRun) continue;
          const r = evalEffect(
            { state: s, sourceId: id },
            card.onSuccessfulRun,
          );
          if (!r.ok) {
            s.log.push(`onSuccessfulRun failed on ${card.title}: ${r.error}`);
          }
        }
        // Fire onSuccessfulRun on rezzed corp cards in the attacked server (Hokusai).
        const server = s.servers[s.run!.attackedServerId];
        for (const id of [...server.root, ...server.ice]) {
          const card = s.cards[id];
          if (!card?.rezzed || !card.onSuccessfulRun) continue;
          const r = evalEffect(
            { state: s, sourceId: id },
            card.onSuccessfulRun,
          );
          if (!r.ok) {
            s.log.push(`onSuccessfulRun failed on ${card.title}: ${r.error}`);
          }
        }
        // Run-source effect (Jailbreak draw / Red Team take credits).
        const src = s.run!.runSourceId;
        const fxRun = s.run!.onSuccessfulRunEffect;
        if (src && fxRun) {
          const r = evalEffect({ state: s, sourceId: src }, fxRun);
          if (!r.ok) {
            s.log.push(`Run-source onSuccessfulRun failed: ${r.error}`);
          }
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
    "runner.actionPaw",
    {
      onResolve: (s) => {
        const runState = s.run!;
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
        runState.strengthBoosts = {};
        runState.encounterStrengthBoosts = {};
        runState.iceStrengthBoosts = {};
        s.run = null;
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
      if (cands.length === 0) {
        s.log.push("No access candidates — empty server breach completes.");
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
    "run.ends",
    {
      onResolve: (s) => {
        s.log.push(`Breach complete (appendix 11.5_7).`);
        if (s.run) s.run.phase = "ends";
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
