/**
 * Regenerate ability fire coverage (CR audit tool 1.18) from a test run.
 *
 *   npx tsx scripts/update-ability-fire.ts                  # whole suite
 *   npx tsx scripts/update-ability-fire.ts --playouts-only  # just the playouts
 *   npx tsx scripts/update-ability-fire.ts --allow-new      # also add baseline entries
 *
 * Runs vitest with `ABILITY_FIRE_OUT` set, so each playout format writes the
 * abilities it fired and every other test file writes which of its tests
 * resolved each ability (tests/setup/ability-fire.ts). Then it rewrites
 * `tests/generated/ability-fire-coverage.json` and shrinks
 * `tests/baselines/ability-fire.json`.
 *
 * `--playouts-only` runs only the seeded playouts and keeps the hand-built
 * test counts from the last whole run.
 *
 * The baseline may only shrink. Without --allow-new the script refuses to
 * add an ability and lists the new ones. An ability can stop firing because
 * it broke (a finding for its area) or because the playouts now take other
 * paths: any change to the legal actions or to how much of the random
 * stream a step uses changes every later pick. Add it only after checking
 * which, and say so in the PR.
 */
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { supportedCardIds } from "../src/index.js";
import { supportedAbilities } from "../tests/ability-fire/abilities.js";
import {
  BASELINE_PATH,
  GENERATED_PATH,
  SWEEP_CARDS,
  readBaseline,
  readGenerated,
  type Baseline,
  type Generated,
  type NeverFired,
} from "../tests/ability-fire/coverage.js";
import { ownerRank } from "../tests/cr-owners.js";
import { FORMATS } from "../tests/playout/harness.js";

const args = process.argv.slice(2);
const allowNew = args.includes("--allow-new");
const playoutsOnly = args.includes("--playouts-only");

/** The test files that call `describePlayouts` (tests/playout/suite.ts). */
const PLAYOUT_FILES = readdirSync("tests")
  .filter((name) => name.endsWith(".test.ts"))
  .map((name) => `tests/${name}`)
  .filter((file) => readFileSync(file, "utf8").includes("describePlayouts("));

const cardsTag = JSON.parse(
  readFileSync("vendor/cards-data/PIN.json", "utf8"),
) as { tag: string };
const crIndex = JSON.parse(
  readFileSync("vendor/cr-data/index.json", "utf8"),
) as { metadata?: { version?: string } };

const out = mkdtempSync(join(tmpdir(), "ability-fire-"));
try {
  const run = spawnSync(
    "npx",
    ["vitest", "run", ...(playoutsOnly ? PLAYOUT_FILES : [])],
    {
      stdio: "inherit",
      env: { ...process.env, ABILITY_FIRE_OUT: out },
    },
  );
  if (run.status !== 0)
    console.warn("vitest exited non-zero; using what it recorded.");

  const playouts: Generated["playouts"] = {};
  const testsByAbility = new Map<string, Set<string>>();
  for (const name of readdirSync(out).sort()) {
    const data = JSON.parse(readFileSync(join(out, name), "utf8"));
    if (name.startsWith("playout-")) {
      playouts[data.format] = { seeds: data.seeds, fired: data.fired };
      continue;
    }
    if (PLAYOUT_FILES.includes(data.file)) continue;
    for (const [key, names] of Object.entries(
      data.tests as Record<string, string[]>,
    )) {
      let set = testsByAbility.get(key);
      if (!set) testsByAbility.set(key, (set = new Set()));
      for (const test of names) set.add(`${data.file} > ${test}`);
    }
  }
  const missing = FORMATS.filter((format) => !playouts[format]);
  if (missing.length > 0)
    throw new Error(
      `no record for playout format(s) ${missing.join(", ")}; nothing written`,
    );

  const previous = existsSync(GENERATED_PATH) ? readGenerated() : undefined;
  // A test that resolves abilities on SWEEP_CARDS cards or more is a sweep.
  const cardsByTest = new Map<string, Set<string>>();
  for (const [key, tests] of testsByAbility) {
    for (const test of tests) {
      let cards = cardsByTest.get(test);
      if (!cards) cardsByTest.set(test, (cards = new Set()));
      cards.add(key.slice(0, key.lastIndexOf("#")));
    }
  }
  const sweeps = new Map(
    [...cardsByTest]
      .filter(([, cards]) => cards.size >= SWEEP_CARDS)
      .map(([test, cards]) => [test, cards.size]),
  );
  const counts = (sweep: boolean): Record<string, number> =>
    Object.fromEntries(
      [...testsByAbility]
        .map(
          ([key, tests]) =>
            [
              key,
              [...tests].filter((t) => sweeps.has(t) === sweep).length,
            ] as const,
        )
        .filter(([, n]) => n > 0)
        .sort(([a], [b]) => (a < b ? -1 : 1)),
    );
  const handBuilt = playoutsOnly
    ? (previous?.handBuiltTests ?? {})
    : counts(false);
  const sweepTests = playoutsOnly ? (previous?.sweepTests ?? {}) : counts(true);
  const sweepList = playoutsOnly
    ? (previous?.sweeps ?? {})
    : Object.fromEntries([...sweeps].sort(([a], [b]) => (a < b ? -1 : 1)));

  const abilities = supportedAbilities();
  const fired = new Set(Object.values(playouts).flatMap((p) => p.fired));
  const neverFired: Record<string, NeverFired[]> = {};
  const byArea: Generated["summary"]["byArea"] = {};
  let noTest = 0;
  let neverRun = 0;
  for (const ability of abilities) {
    if (fired.has(ability.key)) continue;
    const tests = handBuilt[ability.key] ?? 0;
    const sweepCount = sweepTests[ability.key] ?? 0;
    (neverFired[ability.cardId] ??= []).push({
      ability: ability.key,
      class: ability.class,
      ...(ability.name ? { name: ability.name } : {}),
      area: ability.area,
      tests,
      sweeps: sweepCount,
    });
    const area = (byArea[ability.area] ??= {
      neverFired: 0,
      noTest: 0,
      neverRun: 0,
    });
    area.neverFired += 1;
    if (tests === 0) {
      area.noTest += 1;
      noTest += 1;
      if (sweepCount === 0) {
        area.neverRun += 1;
        neverRun += 1;
      }
    }
  }
  const sortedAreas = Object.fromEntries(
    Object.entries(byArea).sort(([a], [b]) => ownerRank(a) - ownerRank(b)),
  );
  const neverFiredCount = Object.values(neverFired).flat().length;

  const generated: Generated = {
    _comment:
      "Generated by scripts/update-ability-fire.ts (CR audit tool 1.18); do not edit. An ability is `card-id#n`, n its index in the card's `abilities`. `playouts`: the CR 9.3 ability records each seeded playout format fired (tests/playout/suite.ts checks them). Tests outside the playouts are targeted tests, or sweeps when one test resolves abilities on `sweepCards` cards or more (listed in `sweeps`; they run every card's instructions and check nothing a given ability does). `handBuiltTests` and `sweepTests`: per ability, how many of each resolve it. `neverFired`: per supported card, its abilities no playout fired, with the area it is filed under (tests/ability-fire/abilities.ts) and those two counts. In `summary`, `neverFiredNoTest` have no targeted test and `neverRun` no test of any kind.",
    cardsTag: cardsTag.tag,
    crTag: `v${crIndex.metadata?.version ?? ""}`,
    summary: {
      supportedCards: supportedCardIds().length,
      cardsWithAbilities: new Set(abilities.map((a) => a.cardId)).size,
      abilities: abilities.length,
      firedInPlayouts: abilities.length - neverFiredCount,
      neverFired: neverFiredCount,
      neverFiredNoTest: noTest,
      neverRun,
      byArea: sortedAreas,
    },
    playouts: Object.fromEntries(
      Object.entries(playouts).sort(([a], [b]) => (a < b ? -1 : 1)),
    ),
    sweepCards: SWEEP_CARDS,
    sweeps: sweepList,
    handBuiltTests: handBuilt,
    sweepTests,
    neverFired,
  };
  writeFileSync(GENERATED_PATH, `${JSON.stringify(generated, null, 2)}\n`);

  // Baseline: shrink, regroup by current area, add only with --allow-new.
  const old: Baseline | undefined = existsSync(BASELINE_PATH)
    ? readBaseline()
    : undefined;
  const listed = new Set(Object.values(old?.neverFired ?? {}).flat());
  const added: string[] = [];
  const next: Record<string, string[]> = {};
  for (const card of Object.values(neverFired)) {
    for (const entry of card) {
      if (old && !listed.has(entry.ability)) {
        added.push(`${entry.area}: ${entry.ability}`);
        if (!allowNew) continue;
      }
      (next[entry.area] ??= []).push(entry.ability);
    }
  }
  const baseline: Baseline = {
    _comment:
      old?._comment ??
      "Shrink-only baseline for tests/ability-fire-coverage.test.ts (CR audit tool 1.18). Recorded 2026-11-20: the CR 9.3 ability records on supported cards that no seeded playout fires, by the area they are filed under (tests/ability-fire/abilities.ts). Each area's evidence step reads its list and adds a hand-built test for each; tests/generated/ability-fire-coverage.json says which already have one. An ability leaves the list when a playout fires it. Regenerate with npx tsx scripts/update-ability-fire.ts.",
    cardsTag: generated.cardsTag,
    neverFired: Object.fromEntries(
      Object.entries(next)
        .sort(([a], [b]) => ownerRank(a) - ownerRank(b))
        .map(([area, keys]) => [area, keys.sort()]),
    ),
  };
  writeFileSync(BASELINE_PATH, `${JSON.stringify(baseline, null, 2)}\n`);
  spawnSync("npx", ["prettier", "--write", GENERATED_PATH, BASELINE_PATH], {
    stdio: "inherit",
  });

  console.log(
    `${abilities.length} abilities on ${generated.summary.cardsWithAbilities} supported cards; ` +
      `${generated.summary.firedInPlayouts} fired in the playouts, ${neverFiredCount} never, ` +
      `${noTest} of them in no targeted test, ${neverRun} in no test at all.`,
  );
  if (added.length > 0) {
    console.log(
      `${added.length} abilities no longer fire in the playouts${allowNew ? " (added)" : " (not added; see --allow-new)"}:`,
    );
    for (const line of added) console.log(`  ${line}`);
    if (!allowNew) process.exitCode = 1;
  }
} finally {
  rmSync(out, { recursive: true, force: true });
}
