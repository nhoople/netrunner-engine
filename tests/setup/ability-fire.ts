/**
 * Ability fire coverage (CR audit tool 1.18): wraps `evalEffect`,
 * `applyChooseCard` and `collectCandidateActions` in every test file so
 * `tests/ability-fire/recorder.ts` can see which ability records resolve. `src/` is unchanged; outside a
 * recording the wrappers only pass the call on.
 *
 * The seeded playouts open their own recording (tests/playout/suite.ts).
 * When `ABILITY_FIRE_OUT` names a folder (scripts/update-ability-fire.ts),
 * this file also records, for each test file, which tests resolve each
 * ability, and writes that there when the file ends.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, expect, vi } from "vitest";
import type { Effect, Primitive } from "../../src/effects/ir.js";
import type { GameState } from "../../src/state/types.js";

type Ctx = { state: GameState; sourceId: string };

const hooks = vi.hoisted(() => ({
  tree: null as null | ((ctx: Ctx, effect: Effect) => void),
  primitive: null as null | ((ctx: Ctx, action: Primitive) => void),
  paused: <T>(fn: () => T): T => fn(),
}));

vi.mock(import("../../src/effects/eval.js"), async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    evalEffect: (ctx, effect) => {
      hooks.tree?.(ctx, effect);
      return actual.evalEffect(ctx, effect);
    },
  };
});

vi.mock(
  import("../../src/effects/triggers/chooseCard.js"),
  async (importOriginal) => {
    const actual = await importOriginal();
    return {
      ...actual,
      applyChooseCard: (ctx, action) => {
        hooks.primitive?.(ctx, action);
        return actual.applyChooseCard(ctx, action);
      },
    };
  },
);

vi.mock(import("../../src/legality/candidates.js"), async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    collectCandidateActions: (state) =>
      hooks.paused(() => actual.collectCandidateActions(state)),
  };
});

const { notePrimitive, noteTree, paused, setSink } =
  await import("../ability-fire/recorder.js");
hooks.tree = noteTree;
hooks.primitive = notePrimitive;
hooks.paused = paused;

const outDir = process.env.ABILITY_FIRE_OUT;
if (outDir) {
  const ROOT = fileURLToPath(new URL("../..", import.meta.url));
  /** Ability key → names of the tests in this file that resolved it. */
  const fired = new Map<string, Set<string>>();
  setSink((key) => {
    const name = expect.getState().currentTestName ?? "(outside a test)";
    let names = fired.get(key);
    if (!names) fired.set(key, (names = new Set()));
    names.add(name);
  });
  afterAll(() => {
    const file = relative(ROOT, expect.getState().testPath ?? "")
      .split("\\")
      .join("/");
    mkdirSync(outDir, { recursive: true });
    const tests = Object.fromEntries(
      [...fired].map(([key, names]) => [key, [...names].sort()]),
    );
    writeFileSync(
      join(outDir, `tests-${file.replace(/[^A-Za-z0-9._-]/g, "_")}.json`),
      JSON.stringify({ file, tests }),
    );
  });
}
