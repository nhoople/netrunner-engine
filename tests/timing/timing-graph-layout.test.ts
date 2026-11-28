/**
 * The timing step table, STEPS in src/timing/graph.ts, is built from one file
 * per part of the CR's timing structures in src/timing/graph/ (repository
 * layout plan, slice E5). graph.ts spreads them in order:
 *   - each step file holds only the steps of its own part of CR 11;
 *   - no step id is in two files, since a later spread would silently
 *     replace an earlier step;
 *   - only graph.ts imports the step files. graph.ts reads their constants
 *     when it loads, and the engine's modules import each other in a cycle,
 *     so a step file loaded before graph.ts would make graph.ts read a
 *     constant that is not set yet. Import STEPS from graph.ts.
 */
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { describe, expect, it } from "vitest";
// graph.ts first: it must load before the step files (see above).
import { STEPS } from "../../src/timing/graph.js";
import { APPROACH_ICE_STEP_DEFS } from "../../src/timing/graph/approachIceSteps.js";
import { BREACH_STEP_DEFS } from "../../src/timing/graph/breachSteps.js";
import { CORP_TURN_STEP_DEFS } from "../../src/timing/graph/corpTurnSteps.js";
import { ENCOUNTER_ICE_STEP_DEFS } from "../../src/timing/graph/encounterIceSteps.js";
import { MOVEMENT_STEP_DEFS } from "../../src/timing/graph/movementSteps.js";
import { OPENING_STEP_DEFS } from "../../src/timing/graph/openingSteps.js";
import { RUN_ENDS_STEP_DEFS } from "../../src/timing/graph/runEndsSteps.js";
import { RUN_INITIATION_STEP_DEFS } from "../../src/timing/graph/runInitiationSteps.js";
import { RUNNER_TURN_STEP_DEFS } from "../../src/timing/graph/runnerTurnSteps.js";
import { SUCCESS_STEP_DEFS } from "../../src/timing/graph/successSteps.js";

const ROOT = process.cwd();

/** Each step file, in the order graph.ts spreads it, and the CR step numbers it may hold. */
const PARTS = [
  {
    file: "openingSteps.ts",
    steps: OPENING_STEP_DEFS,
    numbers: /^1\.6\.(6|7)/,
  },
  { file: "corpTurnSteps.ts", steps: CORP_TURN_STEP_DEFS, numbers: /^11\.2_/ },
  {
    file: "runnerTurnSteps.ts",
    steps: RUNNER_TURN_STEP_DEFS,
    numbers: /^11\.3_/,
  },
  {
    file: "runInitiationSteps.ts",
    steps: RUN_INITIATION_STEP_DEFS,
    numbers: /^11\.4_1_/,
  },
  {
    file: "approachIceSteps.ts",
    steps: APPROACH_ICE_STEP_DEFS,
    numbers: /^11\.4_2_/,
  },
  {
    file: "encounterIceSteps.ts",
    steps: ENCOUNTER_ICE_STEP_DEFS,
    numbers: /^11\.4_3_/,
  },
  { file: "movementSteps.ts", steps: MOVEMENT_STEP_DEFS, numbers: /^11\.4_4_/ },
  { file: "successSteps.ts", steps: SUCCESS_STEP_DEFS, numbers: /^11\.4_5_/ },
  { file: "runEndsSteps.ts", steps: RUN_ENDS_STEP_DEFS, numbers: /^11\.4_6_/ },
  { file: "breachSteps.ts", steps: BREACH_STEP_DEFS, numbers: /^11\.(5|6)_/ },
];

function srcFiles(dir = join(ROOT, "src"), out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) srcFiles(path, out);
    else if (entry.name.endsWith(".ts")) out.push(path);
  }
  return out;
}

describe("timing step table layout (CR 11)", () => {
  it("STEPS is the step files' steps, each once, in order", () => {
    const joined = PARTS.flatMap((p) => Object.keys(p.steps));
    expect(new Set(joined).size).toBe(joined.length);
    expect(Object.keys(STEPS)).toEqual(joined);
    for (const p of PARTS) {
      for (const [key, step] of Object.entries(p.steps)) {
        expect(STEPS[key]).toBe(step);
      }
    }
  });

  it("each step file holds only the steps of its part of the timing structures", () => {
    for (const p of PARTS) {
      const wrong = Object.values(p.steps)
        .filter((step) => !p.numbers.test(step.stepNumber))
        .map((step) => `${step.key} (${step.stepNumber})`);
      expect(wrong, p.file).toEqual([]);
    }
  });

  it("every file in src/timing/graph/ is a listed step file or stepHelpers.ts", () => {
    const files = readdirSync(join(ROOT, "src/timing/graph")).sort();
    expect(files).toEqual(
      [...PARTS.map((p) => p.file), "stepHelpers.ts"].sort(),
    );
  });

  it("only src/timing/graph.ts imports the step files", () => {
    const stepPaths = new Set(
      PARTS.map((p) => join(ROOT, "src/timing/graph", p.file)),
    );
    // Every relative module path: import, export … from, and import().
    const spec = /(?:\bfrom\s*|\bimport\s*\(\s*)["'](\.{1,2}\/[^"']+)["']/g;
    const importers: string[] = [];
    for (const path of srcFiles()) {
      const text = readFileSync(path, "utf8");
      for (const m of text.matchAll(spec)) {
        const target = join(dirname(path), m[1]!).replace(/\.js$/, ".ts");
        if (stepPaths.has(target)) {
          importers.push(relative(ROOT, path).split("\\").join("/"));
        }
      }
    }
    expect([...new Set(importers)]).toEqual(["src/timing/graph.ts"]);
  });
});
