/**
 * Runs `checkInvariants` after every successful `applyAction` (and so every
 * `applyIntent`) in every test, and compares what each test finds with
 * `tests/baselines/invariants.json`.
 *
 * The baseline is keyed by test file, then full test name, then problem
 * code. It may only shrink:
 * - a test that finds a code its entry doesn't list fails (a new problem:
 *   fix it, or record a dated human decision and regenerate the baseline);
 * - a test that no longer finds a listed code fails too, so a fixed problem
 *   leaves the baseline in the same change.
 *
 * Regenerate with `node scripts/update-invariants-baseline.mjs`. In that run
 * `INVARIANTS_BASELINE_OUT` names a folder, and each test file writes what it
 * found there instead of comparing.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, afterEach, expect } from "vitest";
import { setApplyHook } from "../../src/debug/applyHook.js";
import { checkInvariants, type Problem } from "../../src/debug/invariants.js";

type Baseline = Record<string, Record<string, string[]>>;

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const BASELINE_PATH = join(ROOT, "tests/baselines/invariants.json");
/** Calls made outside an `it` (beforeAll, describe bodies) go under this name. */
const OUTSIDE_TEST = "(outside a test)";

const outDir = process.env.INVARIANTS_BASELINE_OUT;
const baseline = JSON.parse(readFileSync(BASELINE_PATH, "utf8")) as Baseline;

/** This file's findings: test name → code → first example. */
const seen = new Map<string, Map<string, Problem>>();
const testsRun = new Set<string>();
let file: string | undefined;

function currentTest(): string {
  return expect.getState().currentTestName ?? OUTSIDE_TEST;
}

setApplyHook((state) => {
  const problems = checkInvariants(state);
  if (problems.length === 0) return;
  const name = currentTest();
  let codes = seen.get(name);
  if (!codes) seen.set(name, (codes = new Map()));
  for (const problem of problems) {
    if (!codes.has(problem.code)) codes.set(problem.code, problem);
  }
});

function describeProblem(problem: Problem): string {
  return `${problem.code} (CR ${problem.rules.join(", ")}): ${problem.message}`;
}

/** The differences between what `name` found and its baseline entry. */
function compare(name: string): string[] {
  const found = seen.get(name) ?? new Map<string, Problem>();
  const recorded = new Set(baseline[file!]?.[name] ?? []);
  const errors: string[] = [];
  for (const [code, problem] of found) {
    if (!recorded.has(code)) errors.push(`new invariant problem ${describeProblem(problem)}`);
  }
  for (const code of recorded) {
    if (!found.has(code)) {
      errors.push(
        `${code} is in tests/baselines/invariants.json for this test but no longer happens: ` +
          "remove the entry (node scripts/update-invariants-baseline.mjs)",
      );
    }
  }
  return errors;
}

afterEach(() => {
  const state = expect.getState();
  file ??= relative(ROOT, state.testPath ?? "").split("\\").join("/");
  const name = currentTest();
  testsRun.add(name);
  if (outDir) return;
  const errors = compare(name);
  if (errors.length > 0) {
    throw new Error(`State invariants (tests/setup/invariants.ts):\n- ${errors.join("\n- ")}`);
  }
});

afterAll(() => {
  file ??= relative(ROOT, expect.getState().testPath ?? "").split("\\").join("/");
  if (outDir) {
    const found: Record<string, Record<string, string>> = {};
    for (const [name, codes] of seen) {
      found[name] = Object.fromEntries([...codes].map(([code, p]) => [code, describeProblem(p)]));
    }
    mkdirSync(outDir, { recursive: true });
    const out = join(outDir, `${file.replace(/[^A-Za-z0-9._-]/g, "_")}.json`);
    writeFileSync(out, JSON.stringify({ file, testsRun: [...testsRun, OUTSIDE_TEST], found }));
    return;
  }
  // Findings outside any test are checked once the file is done.
  const errors = compare(OUTSIDE_TEST);
  if (errors.length > 0) {
    throw new Error(`State invariants (tests/setup/invariants.ts):\n- ${errors.join("\n- ")}`);
  }
});
