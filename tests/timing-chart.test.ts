/**
 * The Corp turn (11.2), the Runner turn (11.3), a run (11.4), a breach (11.5),
 * and an access (11.6) follow the pinned timing chart in child order. A chart
 * line with no graph step is named below, and each such line is followed or
 * run. (P), (R), and (S) on a line match the paid-ability, rez, and score
 * gates. A click-leading ability stays on the "takes an action" lines
 * (CR 5.2.1, 5.4.1).
 */
import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { startRun } from "../src/actions/run.js";
import { corpMayRez, corpMayScore, currentWindow } from "../src/cards/stubs.js";
import { createInitialState } from "../src/state/createGame.js";
import { beginBreachAccess } from "../src/state/access.js";
import { costBeginsWithClick, paidAbilityOpenIn } from "../src/state/costs.js";
import type { Action, GameState, PaidAbility, RunState } from "../src/state/types.js";
import { priorityHolderForStep } from "../src/legality/priority.js";
import { STEPS, type TimingStepDef } from "../src/timing/graph.js";
import { enterStep } from "../src/timing/machine.js";
import {
  applyAction,
  assertPinnedTag,
  crDataPresent,
  queryLegality,
  vendorPathForPinFile,
} from "../src/index.js";

interface ChartNode {
  id: string;
  number: string;
  parent_id: string | null;
  child_ids: string[];
  text_plain: string;
}

interface Arm {
  from: string;
  to: string;
  arrange?: (state: GameState) => void;
}

function blankRun(serverId: RunState["attackedServerId"]): RunState {
  return {
    attackedServerId: serverId,
    phase: "movement",
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
  };
}

function withRun(serverId: RunState["attackedServerId"] = "hq"): GameState {
  const state = createInitialState();
  state.run = blankRun(serverId);
  return state;
}

function protectHq(state: GameState): void {
  state.servers.hq.ice = ["corp-ice-1"];
  state.run!.position = 0;
}

function rezIce(state: GameState, rezzed: boolean): void {
  protectHq(state);
  state.cards["corp-ice-1"].rezzed = rezzed;
}

function follow(arm: Arm): string {
  const step = STEPS[arm.from];
  const state = withRun();
  arm.arrange?.(state);
  return typeof step.next === "string" ? step.next : step.next(state);
}

function proveRunPosition(): void {
  const iced = createInitialState();
  iced.servers.hq.ice = ["corp-ice-1"];
  iced.corp.deck = iced.corp.deck.filter((id) => id !== "corp-ice-1");
  const declared = startRun(iced, "hq");
  expect(declared.ok).toBe(true);
  if (!declared.ok) return;
  expect(declared.state.run?.position).toBe(0);

  const open = createInitialState();
  open.servers.hq.root = ["corp-asset-1"];
  open.corp.deck = open.corp.deck.filter((id) => id !== "corp-asset-1");
  const bare = startRun(open, "hq");
  expect(bare.ok).toBe(true);
  if (!bare.ok) return;
  expect(bare.state.run?.position).toBeNull();
}

function proveArchivesFaceup(): void {
  const state = withRun("archives");
  const cardId = "corp-fill-1";
  state.corp.deck = state.corp.deck.filter((id) => id !== cardId);
  state.corp.discard = [cardId];
  state.cards[cardId].zone = "corp:archives";
  state.cards[cardId].faceup = false;
  beginBreachAccess(state);
  expect(state.cards[cardId].faceup).toBe(true);
}

function proveCentralAccessCount(): void {
  const hq = withRun("hq");
  const fromHand = "corp-fill-2";
  hq.corp.deck = hq.corp.deck.filter((id) => id !== fromHand);
  hq.corp.hand = [fromHand];
  hq.cards[fromHand].zone = "corp:hq";
  beginBreachAccess(hq);
  expect(hq.run?.accessRemaining).toBe(1);

  const rd = withRun("rd");
  beginBreachAccess(rd);
  expect(rd.run?.accessRemaining).toBe(1);
}

/**
 * Chart lines the graph does not stop on. A go-to line names the step it
 * follows. A folded line runs the procedure the graph still performs.
 */
const CHART_SKIPS: Record<string, { text: string; because: string; arm?: Arm; prove?: () => void }> = {
  "11.2_2_b_i": {
    text: "If no, go to (d).",
    because: "corp.checkClicks continues to corp.actionPhaseEnd.",
    arm: { from: "corp.checkClicks", to: "corp.actionPhaseEnd", arrange: (state) => { state.corp.clicks = 0; } },
  },
  "11.2_2_c": {
    text: "Return to (a).",
    because: "corp.takeAction continues to corp.actionPaw.",
    arm: { from: "corp.takeAction", to: "corp.actionPaw" },
  },
  "11.3_1_f_i": {
    text: "If no, go to (h).",
    because: "runner.checkClicks continues to runner.actionPhaseEnd.",
    arm: { from: "runner.checkClicks", to: "runner.actionPhaseEnd", arrange: (state) => { state.runner.clicks = 0; } },
  },
  "11.3_1_g": {
    text: "Return to (e).",
    because: "runner.takeAction continues to runner.actionPaw.",
    arm: { from: "runner.takeAction", to: "runner.actionPaw" },
  },
  "11.4_1_d": {
    text: "The Runner's position is set to the outermost ice, if any.",
    because: "startRun sets the position when the run is declared.",
    prove: proveRunPosition,
  },
  "11.4_1_f_i": {
    text: "If yes, go to (2).",
    because: "run.checkIce continues to run.approachIce.",
    arm: { from: "run.checkIce", to: "run.approachIce", arrange: protectHq },
  },
  "11.4_1_f_ii": {
    text: "If no, go to (4).",
    because: "run.checkIce continues to run.approachServer.",
    arm: { from: "run.checkIce", to: "run.approachServer", arrange: (state) => { state.run!.position = null; } },
  },
  "11.4_2_c_i": {
    text: "If yes, go to (3).",
    because: "run.iceRezzed continues to run.encounter.",
    arm: { from: "run.iceRezzed", to: "run.encounter", arrange: (state) => rezIce(state, true) },
  },
  "11.4_2_c_ii": {
    text: "If no, go to (4).",
    because: "run.iceRezzed continues to run.movement.",
    arm: { from: "run.iceRezzed", to: "run.movement", arrange: (state) => rezIce(state, false) },
  },
  "11.4_3_c_ii": {
    text: "If no, go to (e).",
    because: "run.checkSubs continues to run.movement.",
    arm: { from: "run.checkSubs", to: "run.movement", arrange: (state) => { state.run!.encounter = { iceId: "corp-ice-1", broken: [true] }; } },
  },
  "11.4_3_d": {
    text: "Return to (c).",
    because: "run.resolveSub continues to run.checkSubs.",
    arm: { from: "run.resolveSub", to: "run.checkSubs", arrange: (state) => { state.run!.endedTheRun = false; } },
  },
  "11.4_3_e": {
    text: "Go to (4).",
    because: "run.checkSubs continues to run.movement.",
    arm: { from: "run.checkSubs", to: "run.movement", arrange: (state) => { state.run!.encounter = { iceId: "corp-ice-1", broken: [true] }; } },
  },
  "11.4_4_f_i": {
    text: "If yes, go to (2).",
    because: "run.afterMove continues to run.approachIce.",
    arm: { from: "run.afterMove", to: "run.approachIce", arrange: (state) => { state.run!.position = 0; } },
  },
  "11.4_4_f_ii": {
    text: "If no, go to (g).",
    because: "run.afterMove continues to run.approachServer.",
    arm: { from: "run.afterMove", to: "run.approachServer", arrange: (state) => { state.run!.position = null; } },
  },
  "11.4_4_h": {
    text: "Go to (5).",
    because: "run.approachServerPaw continues to run.success.",
    arm: { from: "run.approachServerPaw", to: "run.success", arrange: (state) => { state.run!.endedTheRun = false; } },
  },
  "11.4_5_c": {
    text: "Go to (6).",
    because: "breach.complete continues to run.closePriorityWindows.",
    arm: {
      from: "breach.complete",
      to: "run.closePriorityWindows",
      arrange: (state) => {
        state.run!.isPostRunBreach = false;
        state.run!.queuedBreachesAfterCurrent = [];
      },
    },
  },
  "11.5_2": {
    text: "If breaching Archives, facedown cards in Archives are turned faceup.",
    because: "beginBreachAccess turns those cards faceup from breach.begin.",
    prove: proveArchivesFaceup,
  },
  "11.5_3": {
    text: "If breaching HQ or R&D, determine how many accesses from Corp's hand or deck.",
    because: "beginBreachAccess counts those cards from breach.begin.",
    prove: proveCentralAccessCount,
  },
  "11.5_4_b": {
    text: "If no, go to (7).",
    because: "breach.choose continues to breach.complete.",
    arm: {
      from: "breach.choose",
      to: "breach.complete",
      arrange: (state) => {
        state.run!.accessCandidates = [];
        state.run!.accessRemaining = 0;
      },
    },
  },
  "11.5_6": {
    text: "Return to (4).",
    because: "breach.access continues to breach.choose.",
    arm: { from: "breach.access", to: "breach.choose" },
  },
};

/** Yes arms of the same questions. These lines are real graph steps. */
const YES_ARMS: Array<Arm & { number: string }> = [
  { number: "11.2_2_b_ii", from: "corp.checkClicks", to: "corp.takeAction", arrange: (state) => { state.corp.clicks = 1; } },
  { number: "11.3_1_f_ii", from: "runner.checkClicks", to: "runner.takeAction", arrange: (state) => { state.runner.clicks = 1; } },
  {
    number: "11.4_3_c_i",
    from: "run.checkSubs",
    to: "run.resolveSub",
    arrange: (state) => { state.run!.encounter = { iceId: "corp-ice-1", broken: [false] }; },
  },
  {
    number: "11.5_4_a",
    from: "breach.choose",
    to: "breach.awaitAccess",
    arrange: (state) => {
      state.run!.accessCandidates = ["corp-asset-1"];
      state.run!.accessRemaining = 1;
    },
  },
];

/**
 * Windows the appendix prints as part of another line. CR 6.6.6 says approaching
 * the server has no inherent effect and is referred to by card abilities, so the
 * engine opens (P) (R) on the next step. CR 6.8.2c completes other priority
 * windows at Run Ends without a second chart line.
 */
const EXTRA_PAID_WINDOWS = new Set([
  "run.approachServerPaw",
  "run.completeOtherPriorityWindows",
]);
const EXTRA_REZ_WINDOWS = new Set(["run.approachServerPaw"]);

const CHARTS = ["11.2", "11.3", "11.4", "11.5", "11.6"] as const;

function passWindow(state: GameState): GameState {
  const result = applyAction(state, { type: "pass_window" });
  if (!result.ok) throw new Error(`${state.timingKey}: ${result.error}`);
  return result.state;
}

function park(key: string, arrange?: (state: GameState) => void): GameState {
  const state = createInitialState();
  const step = STEPS[key];
  state.activeSide = step.stepNumber.startsWith("11.2") ? "corp" : "runner";
  state.corp.credits = 10;
  state.runner.credits = 10;
  state.corp.clicks = 0;
  state.runner.clicks = 0;
  state.priorityStack = [];
  if (step.stepNumber.startsWith("11.4")) state.run = blankRun("hq");
  arrange?.(state);
  enterStep(state, key);
  return state;
}

function closeWindow(state: GameState): GameState {
  const start = state.timingKey;
  for (let i = 0; i < 2 && state.timingKey === start; i++) state = passWindow(state);
  return state;
}

function installIce(state: GameState, rezzed: boolean): void {
  state.servers.hq.ice = ["corp-ice-1"];
  state.corp.deck = state.corp.deck.filter((id) => id !== "corp-ice-1");
  const ice = state.cards["corp-ice-1"];
  ice.zone = "server:hq:ice";
  ice.rezzed = rezzed;
  ice.faceup = rezzed;
  state.run!.position = 0;
}

function offers(state: GameState, pred: (action: Action) => boolean): boolean {
  return queryLegality(state).legal.some((entry) => pred(entry.action));
}

function foreignAbility(windows: PaidAbility["windows"]): PaidAbility {
  return {
    id: "foreign",
    label: "Foreign",
    clickCost: 0,
    creditCost: 0,
    cost: { credits: 0 },
    windows,
    effect: { op: "do", action: { kind: "gain_credits", amount: 1 } },
  };
}

function plantAsset(state: GameState, rezzed: boolean): void {
  const card = state.cards["corp-asset-1"];
  state.corp.deck = state.corp.deck.filter((id) => id !== "corp-asset-1");
  state.servers.hq.root = ["corp-asset-1"];
  card.zone = "server:hq:root";
  card.rezzed = rezzed;
  card.faceup = rezzed;
  card.rezCost = 0;
  card.type = "asset";
}

/** A Runner non-click ability. On the Corp's turn this is the other player's option. */
function plantRunnerAbility(state: GameState): void {
  const card = state.cards["runner-program-1"];
  state.runner.hand = state.runner.hand.filter((id) => id !== "runner-program-1");
  state.runner.rig = ["runner-program-1"];
  card.zone = "runner:rig";
  card.paidAbilities = [foreignAbility(["runner_action_paw"])];
}

function standOn(key: string): {
  state: GameState;
  foreign: (action: Action) => boolean;
} {
  const state = createInitialState();
  const step = STEPS[key];
  state.activeSide = step.stepNumber.startsWith("11.2") ? "corp" : "runner";
  state.corp.credits = 10;
  state.runner.credits = 10;
  state.corp.clicks = 0;
  state.runner.clicks = 0;
  state.priorityStack = [];
  if (step.stepNumber.startsWith("11.4")) state.run = blankRun("hq");

  let foreign: (action: Action) => boolean;
  if (state.activeSide === "corp") {
    plantRunnerAbility(state);
    foreign = (action) =>
      action.type === "use_paid_ability" &&
      action.cardId === "runner-program-1" &&
      action.abilityId === "foreign";
  } else if (corpMayRez(key)) {
    plantAsset(state, false);
    foreign = (action) =>
      action.type === "rez_asset" && action.cardId === "corp-asset-1";
  } else {
    plantAsset(state, true);
    state.cards["corp-asset-1"].paidAbilities = [
      foreignAbility(["corp_action_paw"]),
    ];
    foreign = (action) =>
      action.type === "use_paid_ability" &&
      action.cardId === "corp-asset-1" &&
      action.abilityId === "foreign";
  }

  if (key === "run.approachPaw" || key === "run.encounterPaw") {
    state.servers.hq.ice = ["corp-ice-1"];
    state.corp.deck = state.corp.deck.filter((id) => id !== "corp-ice-1");
    state.cards["corp-ice-1"].zone = "server:hq:ice";
    state.run!.position = 0;
  }
  if (key === "run.encounterPaw") {
    state.cards["corp-ice-1"].rezzed = true;
    state.cards["corp-ice-1"].faceup = true;
    state.run!.encounter = { iceId: "corp-ice-1", broken: [true] };
  }
  enterStep(state, key);
  return { state, foreign };
}

let nodes: ChartNode[] = [];
const byId = new Map<string, ChartNode>();

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  assertPinnedTag("v26.03");
  nodes = JSON.parse(
    readFileSync(vendorPathForPinFile("data/timing-structures.json"), "utf8"),
  ) as ChartNode[];
  for (const node of nodes) byId.set(node.id, node);
});

function chartNodes(prefix: (typeof CHARTS)[number]): ChartNode[] {
  const phases = nodes
    .filter((node) => new RegExp(`^${prefix}_\\d+$`).test(node.number))
    .sort((a, b) => a.number.localeCompare(b.number, undefined, { numeric: true }));
  const out: ChartNode[] = [];
  const visit = (node: ChartNode) => {
    const cited =
      Object.values(STEPS).some((step) => step.stepNumber === node.number) ||
      Object.prototype.hasOwnProperty.call(CHART_SKIPS, node.number);
    if (node.child_ids.length === 0 || cited) out.push(node);
    for (const childId of node.child_ids) {
      const child = byId.get(childId);
      if (!child) throw new Error(`Missing timing child ${childId}`);
      visit(child);
    }
  };
  for (const phase of phases) visit(phase);
  return out;
}

function engineSteps(prefix: (typeof CHARTS)[number]): TimingStepDef[] {
  return Object.values(STEPS).filter(
    (step) => step.stepNumber === prefix || step.stepNumber.startsWith(`${prefix}_`),
  );
}

const nonClick: PaidAbility = {
  id: "non-click",
  label: "Non-click",
  clickCost: 0,
  creditCost: 0,
  cost: { credits: 1 },
  windows: ["corp_action_paw"],
  effect: { op: "do", action: { kind: "gain_credits", amount: 1 } },
};

describe("pinned timing charts 11.2 through 11.6", () => {
  it("names every skipped line, and only lines the graph does not stop on", () => {
    const numbers = new Set(nodes.map((node) => node.number));
    for (const [number, skip] of Object.entries(CHART_SKIPS)) {
      const node = nodes.find((item) => item.number === number);
      expect(node, number).toBeTruthy();
      expect(node?.text_plain, number).toBe(skip.text);
      expect(numbers.has(number), number).toBe(true);
      const stopped = Object.values(STEPS).filter((step) => step.stepNumber === number);
      expect(stopped, `${number} ${skip.because}`).toEqual([]);
      expect(Boolean(skip.arm) !== Boolean(skip.prove), number).toBe(true);
    }
  });

  it("follows each go-to and runs each folded line", () => {
    for (const [number, skip] of Object.entries(CHART_SKIPS)) {
      if (skip.arm) expect(follow(skip.arm), number).toBe(skip.arm.to);
      skip.prove?.();
    }
    for (const arm of YES_ARMS) {
      expect(follow(arm), arm.number).toBe(arm.to);
    }
  });

  it.each(CHARTS)("walks %s in chart order", (prefix) => {
    const chart = chartNodes(prefix);
    const expected = chart
      .map((node) => node.number)
      .filter((number) => !Object.prototype.hasOwnProperty.call(CHART_SKIPS, number));
    const seen = new Set<string>();
    const actual: string[] = [];
    for (const step of engineSteps(prefix)) {
      const node = chart.find((item) => item.number === step.stepNumber);
      expect(node, `${step.key} cites ${step.stepNumber}`).toBeTruthy();
      expect(step.stepId, step.key).toBe(node?.id);
      if (seen.has(step.stepNumber)) continue;
      seen.add(step.stepNumber);
      actual.push(step.stepNumber);
    }
    expect(actual).toEqual(expected);
  });

  it("matches (P), (R), and (S) to the paid-ability, rez, and score gates", () => {
    const chartSteps = CHARTS.flatMap((prefix) => engineSteps(prefix));
    for (const step of chartSteps) {
      const node = nodes.find((item) => item.id === step.stepId);
      expect(node, step.key).toBeTruthy();
      const text = node?.text_plain ?? "";
      const paid = text.includes("(P)");
      const rez = text.includes("(R)");
      const score = text.includes("(S)");
      const window = currentWindow(step.key);

      if (EXTRA_PAID_WINDOWS.has(step.key)) {
        expect(paid, step.key).toBe(false);
        expect(window, step.key).not.toBeNull();
      } else {
        expect(window !== null, step.key).toBe(paid);
      }
      if (paid && window) {
        expect(paidAbilityOpenIn(nonClick, window), step.key).toBe(true);
        expect(costBeginsWithClick(nonClick), step.key).toBe(false);
      }

      if (EXTRA_REZ_WINDOWS.has(step.key)) {
        expect(rez, step.key).toBe(false);
        expect(corpMayRez(step.key), step.key).toBe(true);
      } else {
        expect(corpMayRez(step.key), step.key).toBe(rez);
      }
      expect(corpMayScore(step.key), step.key).toBe(score);

      const takesAction = text.includes("takes an action");
      const isTakeAction =
        step.key === "corp.takeAction" || step.key === "runner.takeAction";
      expect(isTakeAction, step.key).toBe(takesAction);
      if (takesAction) {
        expect(window, step.key).toBeNull();
        expect(step.allows ?? [], step.key).toContain("basic_gain_credit");
        expect(step.allows ?? [], step.key).not.toContain("rez_asset");
      }
      if (paid) {
        expect(step.allows ?? [], step.key).not.toContain("basic_gain_credit");
      }
      const rezzesIce = text.includes("ice can be rezzed");
      expect((step.allows ?? []).includes("rez_ice"), step.key).toBe(rezzesIce);
    }
  });

  it("starts a paid ability window with the active player (CR 9.2.7a)", () => {
    for (const step of CHARTS.flatMap((prefix) => engineSteps(prefix))) {
      if (!currentWindow(step.key)) continue;
      expect(priorityHolderForStep(step.key, "runner"), step.key).toBe("runner");
      expect(priorityHolderForStep(step.key, "corp"), step.key).toBe("corp");
    }
    expect(priorityHolderForStep("run.jackOutWindow", "corp")).toBe("runner");
  });

  it("keeps the other player's option hidden until they receive priority (CR 9.2.7a)", () => {
    const windows = CHARTS.flatMap((prefix) => engineSteps(prefix)).filter(
      (step) => currentWindow(step.key),
    );
    const keys = windows.map((step) => step.key);
    expect(keys).toContain("corp.drawPaw");
    expect(keys).toContain("runner.startPaw");
    expect(keys).toContain("run.approachPaw");
    expect(keys).toContain("run.encounterPaw");
    // CR 6.8.2c completes a frame that is already open. That frame keeps its
    // holder; this step does not start a new paid ability window.
    expect(keys).toContain("run.completeOtherPriorityWindows");

    for (const step of windows) {
      if (step.key === "run.completeOtherPriorityWindows") continue;
      const active = step.stepNumber.startsWith("11.2") ? "corp" : "runner";
      const other = active === "corp" ? "runner" : "corp";
      const opened = standOn(step.key);
      let state = opened.state;
      expect(queryLegality(state).priority, step.key).toBe(active);
      expect(offers(state, opened.foreign), step.key).toBe(false);
      state = passWindow(state);
      expect(state.timingKey, step.key).toBe(step.key);
      expect(queryLegality(state).priority, step.key).toBe(other);
      expect(offers(state, opened.foreign), step.key).toBe(true);
      state = passWindow(state);
      expect(state.timingKey, step.key).not.toBe(step.key);
    }
  });

  it("stops on the next chart line after a paid ability window closes", () => {
    const stop = (state: GameState): string => closeWindow(state).timing.stepNumber;

    expect(stop(park("corp.drawPaw"))).toBe("11.2_1_e");
    expect(stop(park("corp.actionPaw"))).toBe("11.2_2_d");
    expect(stop(park("corp.discardPaw"))).toBe("11.2_3_e");
    expect(stop(park("runner.startPaw"))).toBe("11.3_1_e");
    expect(stop(park("runner.actionPaw"))).toBe("11.3_1_h");
    expect(stop(park("runner.discardPaw"))).toBe("11.3_2_e");

    expect(
      stop(
        park("run.approachPaw", (state) => {
          installIce(state, false);
        }),
      ),
    ).toBe("11.4_4_c");

    expect(
      stop(
        park("run.encounterPaw", (state) => {
          installIce(state, true);
          state.run!.encounter = { iceId: "corp-ice-1", broken: [true] };
        }),
      ),
    ).toBe("11.4_4_c");

    const passing = park("run.passIcePaw", (state) => {
      plantRunnerAbility(state);
    });
    expect(
      offers(
        passing,
        (action) =>
          action.type === "use_paid_ability" && action.cardId === "runner-program-1",
      ),
    ).toBe(true);
    expect(stop(passing)).toBe("11.4_4_c");

    expect(
      stop(
        park("run.afterMovePaw", (state) => {
          installIce(state, false);
        }),
      ),
    ).toBe("11.4_2_b");

    expect(
      stop(
        park("run.initiatePaw", (state) => {
          state.runner.clicks = 1;
          state.run!.position = null;
          state.servers.hq.ice = [];
          state.servers.hq.root = [];
          state.corp.hand = [];
        }),
      ),
    ).toBe("11.3_1_e");
  });

  it("returns to the paid ability window after the last click (11.2_2_c, 11.3_1_g)", () => {
    const spendLastClick = (side: "corp" | "runner"): void => {
      const windowKey = side === "corp" ? "corp.actionPaw" : "runner.actionPaw";
      let state = park(windowKey, (current) => {
        const player = side === "corp" ? current.corp : current.runner;
        player.clicks = 1;
      });
      const before = (side === "corp" ? state.corp : state.runner).credits;
      state = closeWindow(state);
      expect(state.timing.stepNumber, side).toBe(
        side === "corp" ? "11.2_2_b_ii" : "11.3_1_f_ii",
      );
      expect((side === "corp" ? state.corp : state.runner).clicks, side).toBe(1);

      const spent = applyAction(state, { type: "basic_gain_credit" });
      expect(spent.ok, side).toBe(true);
      if (!spent.ok) return;
      state = spent.state;
      const player = side === "corp" ? state.corp : state.runner;
      expect(player.clicks, side).toBe(0);
      expect(player.credits, side).toBe(before + 1);
      expect(state.timing.stepNumber, side).toBe(side === "corp" ? "11.2_2_a" : "11.3_1_e");
      expect(closeWindow(state).timing.stepNumber, side).toBe(
        side === "corp" ? "11.2_2_d" : "11.3_1_h",
      );
    };
    spendLastClick("corp");
    spendLastClick("runner");
  });

  it("accesses each installed card, then completes the breach (11.5_4, 11.6)", () => {
    // CR 7.4.1b: a breach of HQ accesses one card. CR 7.4.1a: a remote's
    // candidates are the cards installed in its root, so two of them are
    // accessed one after another.
    const remoteId = "remote-1" as RunState["attackedServerId"];
    let state = park("run.initiatePaw", (current) => {
      current.servers[remoteId] = {
        id: remoteId,
        kind: "remote",
        ice: [],
        root: [],
      };
      current.run = blankRun(remoteId);
      for (const id of ["corp-asset-1", "corp-fill-1"]) {
        current.corp.deck = current.corp.deck.filter((cardId) => cardId !== id);
        const card = current.cards[id];
        card.type = "asset";
        card.rezzed = true;
        card.faceup = true;
        card.trashCost = undefined;
        card.paidAbilities = [];
        card.zone = `server:${remoteId}:root`;
        current.servers[remoteId].root.push(id);
      }
    });
    state = closeWindow(state);
    expect(state.timing.stepNumber).toBe("11.5_4_a");
    expect(state.run?.accessCandidates).toEqual(["corp-asset-1", "corp-fill-1"]);
    expect(state.run?.accessRemaining).toBe(2);

    const first = applyAction(state, {
      type: "access_card",
      cardId: "corp-asset-1",
    });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    state = first.state;
    expect(state.timing.stepNumber).toBe("11.5_4_a");
    expect(state.run?.accessCandidates).toEqual(["corp-fill-1"]);
    expect(state.run?.accessRemaining).toBe(1);
    expect(state.log.some((line) => line.includes("11.6_4"))).toBe(true);

    const second = applyAction(state, {
      type: "access_card",
      cardId: "corp-fill-1",
    });
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    state = second.state;
    expect(state.log.some((line) => line.includes("11.5_7"))).toBe(true);
    expect(state.run).toBeNull();
  });

  it("follows each string next to the next chart line", () => {
    const arms = [
      ...Object.values(CHART_SKIPS).flatMap((skip) => (skip.arm ? [skip.arm] : [])),
      ...YES_ARMS,
    ];
    const numbers = CHARTS.flatMap((prefix) =>
      chartNodes(prefix)
        .map((node) => node.number)
        .filter((number) => !Object.prototype.hasOwnProperty.call(CHART_SKIPS, number)),
    );
    for (const step of CHARTS.flatMap((prefix) => engineSteps(prefix))) {
      if (typeof step.next !== "string") continue;
      const dest = STEPS[step.next];
      expect(dest, step.key).toBeTruthy();
      const arm = arms.find((item) => item.from === step.key);
      if (arm) {
        expect(dest.key, step.key).toBe(arm.to);
        continue;
      }
      if (dest.stepNumber === step.stepNumber) continue;
      const index = numbers.indexOf(step.stepNumber);
      expect(index, step.key).toBeGreaterThanOrEqual(0);
      const successor = numbers[index + 1];
      if (step.stepNumber === "11.4_5_b") {
        expect(dest.stepNumber, step.key).toBe("11.5_1");
        continue;
      }
      if (step.stepNumber === "11.6_4") {
        expect(dest.stepNumber, step.key).toBe("11.5_5");
        continue;
      }
      expect(dest.stepNumber, `${step.key} → ${step.next}`).toBe(successor);
    }
  });

  it("follows each function next along the chart line", () => {
    const go = (key: string, arrange?: (state: GameState) => void): string => {
      const step = STEPS[key];
      const state = withRun();
      arrange?.(state);
      return typeof step.next === "string" ? step.next : step.next(state);
    };
    const plantRoot = (state: GameState, type: "asset" | "upgrade"): void => {
      const card = state.cards["corp-asset-1"];
      state.corp.deck = state.corp.deck.filter((id) => id !== "corp-asset-1");
      state.servers.hq.root = ["corp-asset-1"];
      card.zone = "server:hq:root";
      card.rezzed = false;
      card.faceup = false;
      card.type = type;
    };

    expect(STEPS["runner.turnComplete"].stepNumber).toBe("11.3_2_e");
    expect(
      go("runner.turnComplete", (state) => {
        state.pendingExtraRunnerTurns = 0;
      }),
    ).toBe("corp.gainClicks");

    expect(STEPS["run.movement"].stepNumber).toBe("11.4_4_a");
    expect(go("run.movement")).toBe("run.passIcePaw");

    expect(STEPS["run.approachServer"].stepNumber).toBe("11.4_4_g");
    expect(go("run.approachServer")).toBe("run.success");
    expect(go("run.approachServer", (state) => plantRoot(state, "asset"))).toBe(
      "run.approachServerPaw",
    );
    expect(go("run.approachServer", (state) => plantRoot(state, "upgrade"))).toBe(
      "run.approachServerPaw",
    );

    expect(STEPS["run.success"].stepNumber).toBe("11.4_5_a");
    const declared = withRun();
    STEPS["run.success"].onResolve?.(declared);
    expect(declared.run?.successful).toBe(true);
    expect(
      typeof STEPS["run.success"].next === "function"
        ? STEPS["run.success"].next(declared)
        : STEPS["run.success"].next,
    ).toBe("run.breachLink");

    const blocked = withRun();
    blocked.run!.cannotDeclareSuccessful = true;
    STEPS["run.success"].onResolve?.(blocked);
    expect(blocked.run?.successful).toBeNull();
    expect(
      typeof STEPS["run.success"].next === "function"
        ? STEPS["run.success"].next(blocked)
        : STEPS["run.success"].next,
    ).toBe("run.closePriorityWindows");

    expect(STEPS["run.closePriorityWindows"].stepNumber).toBe("11.4_6_a");
    expect(go("run.closePriorityWindows")).toBe("run.emptyBpFund");
    expect(
      go("run.closePriorityWindows", (state) => {
        state.priorityStack = [
          {
            id: "pw-other",
            stepKey: "run.formicaryPending",
            nestDepth: 0,
            consecutivePasses: 0,
            priorityHolder: "corp",
            checkpointId: "",
          },
        ];
      }),
    ).toBe("run.completeOtherPriorityWindows");

    expect(STEPS["run.ends"].stepNumber).toBe("11.4_6_d");
    expect(go("run.ends")).toBe("runner.actionPaw");

    expect(
      go("run.resolveSub", (state) => {
        state.run!.endedTheRun = true;
      }),
    ).toBe("run.closePriorityWindows");

    expect(STEPS["breach.complete"].stepNumber).toBe("11.5_7");
    const queued = go("breach.complete", (state) => {
      state.run!.queuedBreachesAfterCurrent = [{ server: "rd" }];
    });
    expect(queued).toBe("breach.begin");
    expect(STEPS[queued].stepNumber.startsWith("11.5")).toBe(true);

    const called = new Set([
      "runner.turnComplete",
      "run.movement",
      "run.approachServer",
      "run.success",
      "run.closePriorityWindows",
      "run.ends",
      "run.resolveSub",
      "breach.complete",
    ]);
    const armed = new Set([
      ...Object.values(CHART_SKIPS).flatMap((skip) => (skip.arm ? [skip.arm.from] : [])),
      ...YES_ARMS.map((arm) => arm.from),
    ]);
    for (const step of CHARTS.flatMap((prefix) => engineSteps(prefix))) {
      if (typeof step.next === "string") continue;
      expect(armed.has(step.key) || called.has(step.key), step.key).toBe(true);
    }
  });
});
