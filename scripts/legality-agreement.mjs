#!/usr/bin/env node
/**
 * Runs the legality agreement check (src/debug/legalityAgreement.ts) after
 * every action in the given test files (default: the rulings and sweep
 * tests) and prints each disagreement key once, with the test that found
 * it first. Report-only; the seeded playouts check it in CI.
 *
 *   node scripts/legality-agreement.mjs [vitest file filters...]
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const filters = process.argv.slice(2);
const files = filters.length
  ? filters
  : ["tests/rulings-", "tests/printed-sweep", "tests/sweep-fixes"];
const out = mkdtempSync(join(tmpdir(), "legality-agreement-"));
try {
  spawnSync("npx", ["vitest", "run", ...files], {
    stdio: ["ignore", "ignore", "inherit"],
    env: { ...process.env, LEGALITY_AGREEMENT_OUT: out },
  });
  const all = new Map();
  for (const name of readdirSync(out)) {
    const { file, found } = JSON.parse(readFileSync(join(out, name), "utf8"));
    for (const [key, example] of Object.entries(found)) {
      if (!all.has(key)) all.set(key, `${file} › ${example}`);
    }
  }
  const keys = [...all.keys()].sort();
  console.log(`${keys.length} disagreement key(s) in ${files.join(", ")}`);
  for (const key of keys) console.log(`${key}\n    ${all.get(key)}`);
} finally {
  rmSync(out, { recursive: true, force: true });
}
