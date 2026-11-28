/**
 * The timing walk (CR audit tool 1.15): every turn, run, breach and access in
 * the seeded playouts follows the chapter 11 charts. What is checked is in
 * tests/playout/timing-walk.ts.
 *
 * Failures go in `tests/baselines/timing-walk.json`, grouped by the area that
 * owns the rule (tool 1.13) and then by chart line, each with a dated reason.
 * The baseline only shrinks: a new failure fails, and so does a recorded one
 * that no longer happens. Regenerate with
 * `UPDATE_TIMING_WALK=1 npx vitest run tests/playout/timing-walk.test.ts`, then write
 * a reason for each new entry (an entry with no reason fails).
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import {
  applyAction,
  assertCardsPinnedTag,
  assertPinnedTag,
  cardsDataPresent,
  crDataPresent,
  queryLegality,
} from "../../src/index.js";
import { createInitialState } from "../../src/state/setupAndEnd/createGame.js";
import type { Action } from "../../src/state/types/actions.js";
import type { GameState } from "../../src/state/types/game.js";
import { enterStep } from "../../src/timing/machine.js";
import type { StepRecord } from "../../src/debug/stepHook.js";
import { ROOT } from "../cr-citations/cr-citations.js";
import { ownerRank } from "../cr-citations/cr-owners.js";
import { FORMATS } from "./harness.js";
import { playoutSeedList } from "./harness.js";
import {
  drive,
  fresh,
  installIce,
  runnerTurn,
  toHand,
} from "../rulings/rulings-helpers.js";
import {
  WalkRecorder,
  Walker,
  bodyRule,
  buildChartModel,
  timingWalk,
  type ChartModel,
} from "./timing-walk.js";

const BASELINE = join(ROOT, "tests/baselines/timing-walk.json");
const TODAY = new Date().toISOString().slice(0, 10);

interface Entry {
  cr: string[];
  recorded: string;
  reason: string;
  example: string;
}
interface Baseline {
  _comment: string;
  /** Owner → chart line → failure key → entry. */
  areas: Record<string, Record<string, Record<string, Entry>>>;
  /** Chart lines the graph cites that no playout entered. */
  unwalked: string[];
  /**
   * Moves off the chart that the end of the run (CR 6.1.4, 6.1.5) or an
   * ability (CR 6.1.3) made, as "from → to (cause)".
   */
  jumps: string[];
}

function readBaseline(): Baseline {
  if (!existsSync(BASELINE))
    return { _comment: "", areas: {}, unwalked: [], jumps: [] };
  return JSON.parse(readFileSync(BASELINE, "utf8")) as Baseline;
}

function flatten(baseline: Baseline): Map<string, Entry & { owner: string }> {
  const out = new Map<string, Entry & { owner: string }>();
  for (const [owner, lines] of Object.entries(baseline.areas)) {
    for (const entries of Object.values(lines)) {
      for (const [key, entry] of Object.entries(entries))
        out.set(key, { ...entry, owner });
    }
  }
  return out;
}

let model: ChartModel;

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.148.0");
  model = buildChartModel();
});

describe("timing walk in the seeded playouts (CR audit tool 1.15)", () => {
  it("every turn, run, breach and access in the seeded playouts follows the chapter 11 charts (CR 5.6, 5.7, 6.9, 7.2, 7.3.4, 9.2.7)", () => {
    const playouts = FORMATS.flatMap((format) =>
      playoutSeedList(format).map((seed) => ({ format, seed })),
    );
    const { failures, counts } = timingWalk(playouts);
    console.log(
      `timing walk: ${playouts.length} playouts, ${counts.turns} turns, ${counts.runs} runs, ` +
        `${counts.breaches} breaches, ${counts.accesses} accesses, ${counts.steps} steps; ` +
        `checked ${counts.checked.stops} window stops, ${counts.checked.rez} rezzes, ` +
        `${counts.checked.score} scores, ${counts.checked.iceRez} ice rezzes, ` +
        `${counts.checked.paidAbilities} paid abilities; ` +
        `moves by ability or run end: ${JSON.stringify(counts.jumps)}`,
    );
    // The recorder sees the playouts at all.
    expect(counts.turns).toBeGreaterThan(0);
    expect(counts.runs).toBeGreaterThan(0);
    expect(counts.breaches).toBeGreaterThan(0);
    expect(counts.accesses).toBeGreaterThan(0);

    const unwalked = [...model.lines.values()]
      .filter((line) => line.engine && !counts.entered[line.number])
      .map((line) => line.number);
    const jumps = Object.keys(counts.jumps).sort();
    const baseline = readBaseline();
    const recorded = flatten(baseline);

    if (process.env.UPDATE_TIMING_WALK) {
      const areas: Baseline["areas"] = {};
      const sorted = [...failures.values()].sort(
        (a, b) =>
          ownerRank(a.owner) - ownerRank(b.owner) ||
          a.line.localeCompare(b.line, undefined, { numeric: true }) ||
          a.key.localeCompare(b.key),
      );
      for (const failure of sorted) {
        const old = recorded.get(failure.key);
        const lineKey = `${failure.line} ${model.lines.get(failure.line)?.text ?? ""}`;
        ((areas[failure.owner] ??= {})[lineKey] ??= {})[failure.key] = {
          cr: failure.cr,
          recorded: old?.recorded ?? TODAY,
          reason: old?.reason ?? "",
          example: failure.example,
        };
      }
      const out: Baseline = {
        _comment:
          "Generated by tests/playout/timing-walk.test.ts (CR audit tool 1.15). Shrink-only. Each failure the timing walk finds in the seeded playouts, grouped by the area that owns its rule (tests/cr-citations/cr-section-owners.json) and by chart line, with the CR rules it breaks, the date it was first recorded, why it fails, and the first playout step that shows it (replay with replayTo in tests/playout/harness.ts). `unwalked` lists the chart lines the graph cites that no playout entered. `jumps` lists the moves off the chart that the end of the run or an ability made (CR 6.1.3-6.1.5); a new kind of move fails until someone checks it and regenerates.",
        areas,
        unwalked,
        jumps,
      };
      writeFileSync(BASELINE, `${JSON.stringify(out, null, 2)}\n`);
      return;
    }

    const errors: string[] = [];
    for (const [key, failure] of failures) {
      if (!recorded.has(key))
        errors.push(
          `new failure (${failure.owner}): ${key} [CR ${failure.cr.join(", ")}] at ${failure.example}`,
        );
    }
    for (const [key, entry] of recorded) {
      if (!failures.has(key))
        errors.push(
          `${key} (${entry.owner}) no longer happens: remove it (UPDATE_TIMING_WALK=1 npx vitest run tests/playout/timing-walk.test.ts)`,
        );
      if (!entry.reason.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(entry.recorded))
        errors.push(`${key} needs a dated reason`);
    }
    expect(errors).toEqual([]);
    expect(
      unwalked,
      "chart lines no playout enters changed: regenerate the baseline",
    ).toEqual(baseline.unwalked);
    expect(
      jumps,
      "moves off the chart by the end of the run or an ability changed: check each new one against CR 6.1.3-6.1.5, then regenerate the baseline",
    ).toEqual(baseline.jumps);
  }, 300_000);
});

// ---------------------------------------------------------------- the checks

function record(key: string, previousKey: string, inRun = false): StepRecord {
  return { token: 1, key, previousKey, inRun, endedTheRun: false };
}

/** Walks `keys` in order, with a stop at each key in `stops`. */
function walk(keys: string[], stops: string[] = keys): string[] {
  const walker = new Walker(model);
  if (!keys[0]!.startsWith("corp.gainClicks")) walker.resumeAt(keys[0]!);
  let previous = keys[0]!;
  for (const key of keys) {
    walker.enter(
      record(
        key,
        previous,
        key.startsWith("run.") || key.startsWith("breach."),
      ),
      { type: "pass_window" },
    );
    if (stops.includes(key)) {
      // A stop with a priority window open on the step.
      walker.stop({
        timingKey: key,
        pendingChoice: null,
        priorityStack: [{ stepKey: key }],
      } as unknown as GameState);
    }
    previous = key;
  }
  walker.finish();
  return [...walker.failures.keys()];
}

/** A Corp turn parked on `key` with its priority window open. */
function parked(key: string, arrange: (state: GameState) => void): GameState {
  const state = createInitialState();
  state.activeSide = "corp";
  state.corp.clicks = 0;
  state.priorityStack = [];
  arrange(state);
  enterStep(state, key);
  return state;
}

function installRoot(state: GameState, id: string): void {
  state.corp.deck = state.corp.deck.filter((other) => other !== id);
  state.servers.hq.root.push(id);
  state.cards[id]!.zone = "server:hq:root";
}

describe("what the timing walk catches", () => {
  it("maps each chart line to the rule in chapters 5 to 7 it restates", () => {
    expect(bodyRule("11.2_2_b_ii")).toBe("5.6.2b");
    expect(bodyRule("11.3_1_e")).toBe("5.7.1e");
    expect(bodyRule("11.4_4_g")).toBe("6.9.4g");
    expect(bodyRule("11.5_4_a")).toBe("7.3.4");
    expect(bodyRule("11.6_3")).toBe("7.2.3");
  });

  it("passes the Corp's draw phase in chart order (CR 5.6.1)", () => {
    expect(
      walk([
        "corp.gainClicks",
        "corp.drawPaw",
        "corp.recurring",
        "corp.turnBegins",
        "corp.mandatoryDraw",
        "corp.actionPaw",
      ]),
    ).toEqual([]);
  });

  it("fails a skipped paid ability window (CR 5.6.1b)", () => {
    expect(
      walk(["corp.gainClicks", "corp.recurring", "corp.turnBegins"]),
    ).toEqual([
      "11.2_1_c entered from 11.2_1_a by pass_window; the chart goes to 11.2_1_b",
    ]);
  });

  it("fails a paid ability window the engine leaves without giving a player priority (CR 9.2.7a)", () => {
    expect(
      walk(
        ["corp.gainClicks", "corp.drawPaw", "corp.recurring"],
        ["corp.gainClicks"],
      ),
    ).toEqual(["11.2_1_b left corp.drawPaw with no player given priority"]);
  });

  it("lets a run with no ice go from the Initiation Phase to the Movement Phase's paid ability window (CR 6.9.1f, 6.9.4a)", () => {
    expect(
      walk([
        "runner.takeAction",
        "run.announce",
        "run.fillBpFund",
        "run.begin",
        "run.initiatePaw",
        "run.checkIce",
        "run.passIcePaw",
        "run.jackOutWindow",
      ]),
    ).toEqual([]);
  });

  it("fails a breach that begins outside the Success Phase (CR 6.9.5b)", () => {
    expect(
      walk([
        "runner.takeAction",
        "run.announce",
        "run.fillBpFund",
        "run.begin",
        "run.initiatePaw",
        "run.checkIce",
        "run.passIcePaw",
        "breach.begin",
      ]),
    ).toEqual(["11.5_1 11.5 began at 11.4_4_b, not at 11.4_5_b"]);
  });

  it("fails a run that starts its Run Ends Phase again after the run is complete (CR 6.9.6d)", () => {
    expect(
      walk([
        "runner.takeAction",
        "run.announce",
        "run.fillBpFund",
        "run.begin",
        "run.initiatePaw",
        "run.checkIce",
        "run.passIcePaw",
        "run.jackOutWindow",
        "run.moveInward",
        "run.afterMovePaw",
        "run.afterMove",
        "run.approachServer",
        "run.success",
        "run.breachLink",
        "breach.begin",
        "breach.choose",
        "breach.complete",
        "run.closePriorityWindows",
        "run.emptyBpFund",
        "run.declareUnsuccessful",
        "run.ends",
        "run.closePriorityWindows",
      ]),
    ).toEqual([
      "11.4_6_a entered from 11.4_6_d by pass_window; the chart goes to END",
    ]);
  });

  it("fails an asset the Corp can pay for but is not offered to rez at (R) (CR 9.2.7c)", () => {
    const state = parked("corp.actionPaw", (s) => {
      installRoot(s, "corp-asset-1");
      const card = s.cards["corp-asset-1"]!;
      card.type = "asset";
      card.rezzed = false;
      card.rezCost = 1;
      s.corp.credits = 5;
    });
    const walker = new Walker(model);
    walker.observe(state, []);
    expect([...walker.failures.keys()]).toEqual([
      `11.2_2_a rez of ${state.cards["corp-asset-1"]!.defId} not offered`,
    ]);
    const fine = new Walker(model);
    fine.observe(state, [
      { action: { type: "rez_asset", cardId: "corp-asset-1" } },
    ]);
    expect([...fine.failures.keys()]).toEqual([]);
  });

  it("fails an agenda with enough advancement counters that is not offered to score at (S), and a score offered without (S) (CR 9.2.7d)", () => {
    const arrange = (s: GameState) => {
      installRoot(s, "corp-fill-1");
      const card = s.cards["corp-fill-1"]!;
      card.type = "agenda";
      card.advancementRequirement = 3;
      card.advancementCounters = 3;
    };
    const atS = parked("corp.actionPaw", arrange);
    const walker = new Walker(model);
    walker.observe(atS, []);
    expect([...walker.failures.keys()]).toEqual([
      `11.2_2_a score of ${atS.cards["corp-fill-1"]!.defId} not offered`,
    ]);
    const notS = parked("corp.discardPaw", arrange);
    const other = new Walker(model);
    other.observe(notS, [
      { action: { type: "score_agenda", cardId: "corp-fill-1" } },
    ]);
    expect([...other.failures.keys()]).toEqual(["11.2_3_b score offered"]);
  });
});

describe("the timing walk on a played run", () => {
  /** Plays `s` with the recorder on, passing and continuing, until the run is over. */
  function playRun(s: GameState): string[] {
    const walker = new Walker(model);
    walker.resumeAt(s.timingKey);
    const recorder = new WalkRecorder(walker);
    recorder.start(s);
    try {
      for (let i = 0; i < 100 && (s.run || i === 0); i++) {
        const legal = queryLegality(s).legal;
        recorder.observe(s, legal);
        const next =
          s.timingKey === "runner.takeAction" && !s.run
            ? ({ type: "basic_run", serverId: "hq" } as Action)
            : ([
                "pass_window",
                "continue_run",
                "access_card",
                "finish_access",
                "finish_breach",
                "choose_option",
              ]
                .map(
                  (type) => legal.find((l) => l.action.type === type)?.action,
                )
                .find(Boolean) ?? legal[0]!.action);
        const result = applyAction(s, next);
        if (!result.ok) throw new Error(`${next.type}: ${result.error}`);
        recorder.applied(result.state, next);
        s = result.state;
      }
    } finally {
      recorder.finish();
    }
    return [...walker.failures.keys()];
  }

  it("offers Mamba's power counter ability in every paid ability window of the run, as 'Use this ability only during a run' prints (CR 9.2.7b; fixed in PF-S3c)", () => {
    let s = runnerTurn(fresh());
    installIce(s, "mamba", "mamba-1", "hq").powerCounters = 2;
    s.corp.credits = 5;
    for (const n of [1, 2, 3, 4, 5])
      toHand(s, "runner", "sure-gamble", `g-${n}`);
    s = drive(s, (x) => x.timingKey === "runner.takeAction");
    // Every paid ability window of the run (CR 6.9.1e, 6.9.2b, 6.9.3b,
    // 6.9.4b, 6.9.4e).
    expect(playRun(s)).toEqual([]);
  });
});
