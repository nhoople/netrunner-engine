/**
 * Regression goldens: freeze full-run transcripts (setup → access/score or
 * clear failure → end). Diff game state + window IDs.
 *
 * Refresh fixtures:
 *   REFRESH_GOLDENS=1 npx vitest run tests/confidence-regression-goldens.test.ts
 *
 * See tests/fixtures/goldens/README.md.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, beforeAll } from "vitest";
import {
  applyAction,
  assertPinnedTag,
  createInitialState,
  CR,
  crDataPresent,
  getStep,
  instantiateCard,
  runIceBreakSlice,
  runIceEtrSlice,
  runVerticalSlice,
} from "../src/index.js";
import type { Action, GameState } from "../src/state/types.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  assertPinnedTag("v26.03");
});

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "fixtures/goldens");
const REFRESH = process.env.REFRESH_GOLDENS === "1";

type GoldenSnapshot = {
  name: string;
  timingKey: string;
  stepId: string;
  stepNumber: string;
  done: boolean;
  run: null | {
    phase: string;
    successful: boolean | null;
    endedTheRun: boolean;
  };
  corp: { credits: number; clicks: number; scoreLen: number };
  runner: { credits: number; clicks: number; tags: number; rigLen: number };
  /** Ordered unique appendix / rule numbers seen in the log. */
  windowAndCiteNumbers: string[];
  logMarkers: string[];
};

function windowAndCiteNumbers(log: string[]): string[] {
  const found = new Set<string>();
  for (const line of log) {
    for (const m of line.matchAll(/\b(\d+\.\d+(?:\.\d+[a-z]?)?(?:_\d+[a-z_]*)*)\b/g)) {
      found.add(m[1]!);
    }
  }
  return [...found].sort();
}

function snapshot(name: string, s: GameState, markers: string[]): GoldenSnapshot {
  const step = getStep(s);
  return {
    name,
    timingKey: s.timingKey,
    stepId: step.stepId,
    stepNumber: step.number,
    done: s.done,
    run: s.run
      ? {
          phase: s.run.phase,
          successful: s.run.successful,
          endedTheRun: s.run.endedTheRun,
        }
      : null,
    corp: {
      credits: s.corp.credits,
      clicks: s.corp.clicks,
      scoreLen: s.corp.score.length,
    },
    runner: {
      credits: s.runner.credits,
      clicks: s.runner.clicks,
      tags: s.runner.tags,
      rigLen: s.runner.rig.length,
    },
    windowAndCiteNumbers: windowAndCiteNumbers(s.log),
    logMarkers: markers.filter((m) => s.log.some((l) => l.includes(m))),
  };
}

function assertGolden(name: string, actual: GoldenSnapshot): void {
  const path = join(ROOT, `${name}.json`);
  if (REFRESH || !existsSync(path)) {
    mkdirSync(ROOT, { recursive: true });
    writeFileSync(path, `${JSON.stringify(actual, null, 2)}\n`);
  }
  const expected = JSON.parse(readFileSync(path, "utf8")) as GoldenSnapshot;
  expect(actual).toEqual(expected);
}

function must(state: GameState, action: Action): GameState {
  const r = applyAction(state, action);
  if (!r.ok) throw new Error(`${r.error} ${JSON.stringify(r.cites)}`);
  return r.state;
}

describe("regression goldens — full-run transcripts", () => {
  it("vertical slice (decline rez → empty breach → end)", () => {
    const s = runVerticalSlice();
    assertGolden(
      "vertical-slice-decline-rez",
      snapshot("vertical-slice-decline-rez", s, [
        CR.corpBasicInstall.number,
        "11.4_2_b",
        "11.4_2_c_ii",
        "11.4_4_c",
        CR.successfulRun.number,
        "No access candidates",
      ]),
    );
  });

  it("ice break slice (rez → break → success)", () => {
    const s = runIceBreakSlice();
    assertGolden(
      "ice-break-success",
      snapshot("ice-break-success", s, [
        CR.rezInPaw.number,
        CR.encounterBreakPaw.number,
        CR.successfulRun.number,
      ]),
    );
  });

  it("ice ETR slice (clear failure → run ends)", () => {
    const s = runIceEtrSlice();
    assertGolden(
      "ice-etr-failure",
      snapshot("ice-etr-failure", s, [
        CR.endTheRun.number,
        CR.unsuccessfulRun.number,
      ]),
    );
  });

  it("Crisium archives run (ternary end — neither successful nor unsuccessful)", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const up = instantiateCard("crisium-grid", "up-1", "server:archives:root");
    up.rezzed = true;
    up.faceup = true;
    s.cards["up-1"] = up;
    s.servers.archives.root = ["up-1"];
    s.servers.archives.ice = [];
    s.activeSide = "runner";
    s.timingKey = "runner.takeAction";
    s.runner.clicks = 4;
    s = must(s, { type: "basic_run", serverId: "archives" });
    assertGolden(
      "crisium-archives-ternary",
      snapshot("crisium-archives-ternary", s, [
        CR.notUnsuccessfulWhenReachedSuccessPhase.number,
        "neither successful nor unsuccessful",
      ]),
    );
  });
});
