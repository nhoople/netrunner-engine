import type {
  Action,
  GameState,
  TimingCursor,
  TurnPhase,
} from "../state/types.js";

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
 * v0: paid-ability windows are pass/auto no-ops; rezzed-ice encounter is not modeled.
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
  ),
  "corp.turnBegins": corp(
    "corp.turnBegins",
    "sec_appendix_timing_structure_corps_turn_1_d",
    "11.2_1_d",
    "The Corp's turn begins.",
    "auto",
    "corp_draw",
    "corp.mandatoryDraw",
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
  ),
  "runner.turnBegins": runner(
    "runner.turnBegins",
    "sec_appendix_timing_structure_runners_turn_1_d",
    "11.3_1_d",
    "The Runner's turn begins.",
    "auto",
    "runner_action",
    "runner.actionPaw",
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
        s.done = true;
        s.log.push(
          `Vertical slice complete — returning to Corp would be turn ${s.turnNumber}`,
        );
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
  ),
  "run.approachPaw": run(
    "run.approachPaw",
    "sec_appendix_timing_structure_of_a_run_2_b",
    "11.4_2_b",
    "Paid ability window: (P) (R) and ice can be rezzed.",
    "auto",
    "run.iceRezzed",
  ),
  "run.iceRezzed": run(
    "run.iceRezzed",
    "sec_appendix_timing_structure_of_a_run_2_c",
    "11.4_2_c",
    "Is the approached ice rezzed?",
    "branch",
    (s) => {
      const runState = s.run!;
      const iceId = s.servers[runState.attackedServerId].ice[runState.position!];
      return s.cards[iceId].rezzed ? "run.encounter" : "run.movement";
    },
  ),
  "run.encounter": run(
    "run.encounter",
    "sec_appendix_timing_structure_of_a_run_3_a",
    "11.4_3_a",
    "The Runner encounters ice.",
    "auto",
    "run.movement",
  ),
  "run.movement": run(
    "run.movement",
    "sec_appendix_timing_structure_of_a_run_4_a",
    "11.4_4_a",
    "If the run got here from (2) or (3), the Runner passes ice.",
    "auto",
    "run.moveInward",
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
    "run.success",
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
        s.run!.successful = true;
        s.log.push(`Run successful (CR 6.7.2).`);
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
        s.run = null;
        s.log.push(`Run complete (appendix 11.4_6_d).`);
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
        const runState = s.run!;
        const server = s.servers[runState.attackedServerId];
        runState.phase = "breach";
        runState.accessCandidates = [...server.root];
        s.log.push(
          `Breach begins on ${server.id} with ${runState.accessCandidates.length} candidate(s) (CR 7.3.1, 7.4.1a).`,
        );
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
