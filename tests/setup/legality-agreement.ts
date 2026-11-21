/**
 * Opt-in: with `LEGALITY_AGREEMENT_OUT` set to a folder, runs the legality
 * agreement check (`src/debug/legalityAgreement.ts`) on the state after
 * every successful `applyAction` in every test, and writes what each test
 * file finds there. `node scripts/legality-agreement.mjs` runs it over the
 * rulings and sweep tests and prints a summary. Off by default: each check
 * tries every plausible move, so it is too slow for every CI run. The
 * seeded playouts run the same check in CI (tests/legality-agreement-*).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, expect } from "vitest";
import { setApplyHook } from "../../src/debug/applyHook.js";
import {
  disagreementKey,
  legalityDisagreements,
} from "../../src/debug/legalityAgreement.js";

const outDir = process.env.LEGALITY_AGREEMENT_OUT;

if (outDir) {
  const ROOT = fileURLToPath(new URL("../..", import.meta.url));
  /** key → first example, with the test that found it. */
  const found = new Map<string, string>();
  const previous = setApplyHook(null);
  setApplyHook((state, action) => {
    previous?.(state, action);
    for (const d of legalityDisagreements(state)) {
      const key = disagreementKey(d);
      if (!found.has(key)) {
        const test = expect.getState().currentTestName ?? "(outside a test)";
        found.set(key, `${test}: ${JSON.stringify(d.action)}: ${d.detail}`);
      }
    }
  });
  afterAll(() => {
    const file = relative(ROOT, expect.getState().testPath ?? "")
      .split("\\")
      .join("/");
    mkdirSync(outDir, { recursive: true });
    writeFileSync(
      join(outDir, `${file.replace(/[^A-Za-z0-9._-]/g, "_")}.json`),
      JSON.stringify({ file, found: Object.fromEntries(found) }),
    );
  });
}
