#!/usr/bin/env node
/**
 * Regenerate tests/baselines/invariants.json from a full test run.
 *
 *   node scripts/update-invariants-baseline.mjs              # shrink only
 *   node scripts/update-invariants-baseline.mjs --allow-new  # also add entries
 *
 * The baseline may only shrink. Without --allow-new the script refuses to
 * add an entry and lists the new ones; add them only after a dated human
 * decision (see docs/plans/cr-audit-standardization-program.md, Phase 1).
 * Extra arguments after `--` go to vitest (for example a test file).
 * --details <file> writes each entry's first example message there.
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const baselinePath = join(root, "tests/baselines/invariants.json");
const args = process.argv.slice(2);
const allowNew = args.includes("--allow-new");
const detailsAt = args.indexOf("--details");
const detailsPath = detailsAt >= 0 ? args[detailsAt + 1] : undefined;
const dash = args.indexOf("--");
const vitestArgs = dash >= 0 ? args.slice(dash + 1) : [];

const out = mkdtempSync(join(tmpdir(), "invariants-"));
try {
  const run = spawnSync("npx", ["vitest", "run", ...vitestArgs], {
    cwd: root,
    stdio: "inherit",
    env: { ...process.env, INVARIANTS_BASELINE_OUT: out },
  });
  if (run.status !== 0) console.warn("vitest exited non-zero; merging what it recorded.");

  const old = JSON.parse(readFileSync(baselinePath, "utf8"));
  const next = structuredClone(old);
  const details = {};
  const added = [];
  for (const name of readdirSync(out)) {
    const { file, testsRun, found } = JSON.parse(readFileSync(join(out, name), "utf8"));
    const entry = { ...(next[file] ?? {}) };
    for (const test of testsRun) delete entry[test];
    for (const [test, codes] of Object.entries(found)) {
      entry[test] = Object.keys(codes).sort();
      for (const [code, message] of Object.entries(codes)) {
        details[`${file} > ${test} :: ${code}`] = message;
        if (!(old[file]?.[test] ?? []).includes(code)) added.push(`${file} > ${test}: ${code}`);
      }
    }
    if (Object.keys(entry).length > 0) next[file] = entry;
    else delete next[file];
  }
  if (added.length > 0 && !allowNew) {
    console.error(`Refusing to add ${added.length} baseline entries (pass --allow-new):`);
    for (const line of added) console.error(`  ${line}`);
    process.exit(1);
  }
  const sorted = {};
  for (const file of Object.keys(next).sort()) {
    sorted[file] = {};
    for (const test of Object.keys(next[file]).sort()) sorted[file][test] = next[file][test];
  }
  writeFileSync(baselinePath, `${JSON.stringify(sorted, null, 2)}\n`);
  if (detailsPath) writeFileSync(detailsPath, `${JSON.stringify(details, null, 2)}\n`);
  console.log(`Wrote ${baselinePath} (${added.length} added).`);
} finally {
  rmSync(out, { recursive: true, force: true });
}
