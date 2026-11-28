/**
 * Seeded random playouts at nightly scale (CR audit tool 1.3c).
 *
 *   npm run playouts -- [--seeds N] [--from S] [--steps 200] [--formats a,b] [--write | --write-weekly] [--json FILE]
 *
 * Plays seeds S .. S+N-1 (default 1 .. 50) in every format and prints the
 * failures by format and problem code. `--write` records them in
 * `tests/fixtures/playout-seeds.json`: for each (format, seed) it played, it
 * replaces that seed's entries with what it found, keeping the date an entry
 * was first recorded. Entries for seeds it did not play are left alone.
 * `npm test` replays every entry (tests/playout/playouts-*.test.ts).
 *
 * Without a write flag, it exits 1 when a playout hits a (format, seed, code)
 * that neither that file nor `tests/fixtures/playout-seeds-weekly.json`
 * lists, or when a weekly entry's seed played all 200 steps without its code
 * (that list only shrinks). The weekly workflow (.github/workflows/playouts.yml)
 * runs `npm run playouts:nightly`. `--write-weekly` rewrites the weekly list
 * from the seeds it played that CI does not play; CI never reads it. It
 * reads the list just before writing it, so run one writer at a time, or
 * check each format's entries after parallel runs.
 */
import { writeFileSync } from "node:fs";
import { setApplyHook } from "../src/debug/applyHook.js";
import {
  FORMATS,
  PLAYOUT_STEPS,
  SEEDS_PATH,
  WEEKLY_SEEDS_PATH,
  failureKey,
  playout,
  playoutSeedList,
  readSeeds,
  readWeeklySeeds,
  weeklyCheck,
  type Format,
  type PlayoutResult,
  type SeedEntry,
} from "../tests/playout/harness.js";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const seeds = Number(arg("seeds") ?? 50);
const from = Number(arg("from") ?? 1);
const steps = Number(arg("steps") ?? PLAYOUT_STEPS);
const formats = (arg("formats")?.split(",") ?? [...FORMATS]) as Format[];
for (const format of formats) {
  if (!FORMATS.includes(format))
    throw new Error(`unknown format ${format}; one of ${FORMATS.join(", ")}`);
}
const write = process.argv.includes("--write");
const writeWeekly = process.argv.includes("--write-weekly");
if (write && writeWeekly)
  throw new Error("--write and --write-weekly write different files; pick one");
if (writeWeekly && steps !== PLAYOUT_STEPS)
  throw new Error(`--write-weekly records ${PLAYOUT_STEPS}-step playouts only`);
const jsonOut = arg("json");
if (write && steps !== PLAYOUT_STEPS)
  throw new Error(`--write records ${PLAYOUT_STEPS}-step playouts only`);

setApplyHook(null);
const started = Date.now();
const results: PlayoutResult[] = [];
for (const format of formats) {
  const t0 = Date.now();
  let finished = 0;
  for (let seed = from; seed < from + seeds; seed++) {
    const result = playout(format, seed, steps);
    results.push(result);
    if (result.finished) finished += 1;
  }
  console.error(
    `${format}: ${seeds} playouts, ${finished} finished, ${Date.now() - t0} ms`,
  );
}

// Summary: format × code → seeds that hit it.
const table = new Map<string, Map<string, number[]>>();
for (const result of results) {
  for (const failure of result.failures) {
    const byCode = table.get(result.format) ?? new Map<string, number[]>();
    table.set(result.format, byCode);
    const list = byCode.get(failure.code) ?? [];
    byCode.set(failure.code, list);
    list.push(result.seed);
  }
}
console.log(
  `\n${results.length} playouts × ${steps} steps in ${((Date.now() - started) / 1000).toFixed(1)} s`,
);
console.log("| Format | Code | Seeds failing | Example seeds |");
console.log("|---|---|---|---|");
for (const format of formats) {
  const byCode = table.get(format);
  if (!byCode) {
    console.log(`| ${format} | (none) | 0 / ${seeds} | |`);
    continue;
  }
  for (const [code, list] of [...byCode].sort()) {
    console.log(
      `| ${format} | ${code} | ${list.length} / ${seeds} | ${list.slice(0, 5).join(", ")} |`,
    );
  }
}

if (jsonOut) writeFileSync(jsonOut, JSON.stringify(results, null, 2));

if (!write && !writeWeekly) {
  const { unlisted, gone } = weeklyCheck(
    results,
    readSeeds().entries,
    readWeeklySeeds().entries,
    steps,
  );
  for (const [list, what] of [
    [
      unlisted,
      "not in tests/fixtures/playout-seeds.json or playout-seeds-weekly.json",
    ],
    [
      gone,
      "in playout-seeds-weekly.json but no longer happen: remove them (npm run playouts:nightly -- --write-weekly)",
    ],
  ] as const) {
    if (list.length === 0) continue;
    console.log(`\n${list.length} failure(s) ${what}:`);
    for (const line of list) console.log(`- ${line}`);
    process.exitCode = 1;
  }
  if (!process.exitCode) console.log("\nEvery failure is a known one.");
}

if (writeWeekly) {
  const file = readWeeklySeeds();
  const ci = readSeeds();
  const ciSeeds = new Map(
    FORMATS.map((f) => [f, new Set(playoutSeedList(f, ci))] as const),
  );
  const played = new Set(results.map((r) => `${r.format}#${r.seed}`));
  const firstRecorded = new Map(
    file.entries.map((e) => [
      `${e.format}#${e.deckSeed}#${e.code}`,
      e.recorded,
    ]),
  );
  const today = new Date().toISOString().slice(0, 10);
  // A seed CI plays (pinned in playout-seeds.json since) leaves this list.
  const kept = file.entries.filter(
    (e) =>
      !played.has(`${e.format}#${e.deckSeed}`) &&
      !ciSeeds.get(e.format)!.has(e.deckSeed),
  );
  const fresh: SeedEntry[] = [];
  for (const r of results) {
    if (ciSeeds.get(r.format)!.has(r.seed)) continue;
    const seen = new Set<string>();
    for (const f of r.failures) {
      if (seen.has(f.code)) continue;
      seen.add(f.code);
      fresh.push({
        format: r.format,
        deckSeed: r.seed,
        step: f.step,
        code: f.code,
        recorded: firstRecorded.get(`${r.format}#${r.seed}#${f.code}`) ?? today,
        detail: f.detail,
      });
    }
  }
  const order = (e: SeedEntry) => FORMATS.indexOf(e.format);
  const entries = [...kept, ...fresh].sort(
    (a, b) =>
      order(a) - order(b) ||
      a.deckSeed - b.deckSeed ||
      a.code.localeCompare(b.code),
  );
  writeFileSync(
    WEEKLY_SEEDS_PATH,
    `${JSON.stringify({ steps: PLAYOUT_STEPS, entries }, null, 2)}\n`,
  );
  console.error(
    `wrote ${entries.length} entries to tests/fixtures/playout-seeds-weekly.json`,
  );
}

if (write) {
  const file = readSeeds();
  const played = new Set(results.map((r) => `${r.format}#${r.seed}`));
  const firstRecorded = new Map(
    file.entries.map((e) => [
      `${e.format}#${e.deckSeed}#${failureKey(e)}`,
      e.recorded,
    ]),
  );
  const today = new Date().toISOString().slice(0, 10);
  const kept = file.entries.filter(
    (e) => !played.has(`${e.format}#${e.deckSeed}`),
  );
  const fresh: SeedEntry[] = results.flatMap((r) =>
    r.failures.map((f) => ({
      format: r.format,
      deckSeed: r.seed,
      step: f.step,
      code: f.code,
      recorded:
        firstRecorded.get(`${r.format}#${r.seed}#${failureKey(f)}`) ?? today,
      detail: f.detail,
    })),
  );
  const order = (e: SeedEntry) => FORMATS.indexOf(e.format);
  const entries = [...kept, ...fresh].sort(
    (a, b) =>
      order(a) - order(b) ||
      a.deckSeed - b.deckSeed ||
      a.step - b.step ||
      a.code.localeCompare(b.code),
  );
  writeFileSync(
    SEEDS_PATH,
    `${JSON.stringify({ steps: PLAYOUT_STEPS, entries }, null, 2)}\n`,
  );
  console.error(
    `wrote ${entries.length} entries to tests/fixtures/playout-seeds.json`,
  );
}
