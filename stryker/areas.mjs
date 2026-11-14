/**
 * Phase 3 areas for mutation testing (CR audit tool 1.9).
 *
 * Each area lists the helper files Stryker mutates and how to pick the tests
 * that should kill those mutants. The scope follows the Areas table in the
 * meta repo's docs/plans/cr-audit-standardization-program.md. When an area's
 * session moves a procedure into src/state/procedures/, add that module here.
 *
 * Tests are picked two ways, and the union is used:
 *   - `tests`: globs of test files named for the area;
 *   - `grep`:  a pattern matched against each test file's text (CR cites,
 *              helper names, card titles), so card tests in other files that
 *              exercise the area are included too.
 *
 * Mutation runs are local only: `npm run mutate:<area>`. Scores go in
 * docs/mutation-scores.md.
 */
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

export const areas = {
  "hosting-trash": {
    title: "1. Hosting and trash",
    mutate: [
      "src/state/trashHooks.ts",
      "src/state/trashPrevent.ts",
      "src/effects/corpTrash.ts",
      "src/effects/kinds/trashKinds.ts",
      "src/state/hostDuration.ts",
    ],
    tests: ["tests/*trash*.test.ts", "tests/*host*.test.ts"],
    grep: /releaseHostedCardsOnTrash|moveRunnerCardToHeap|trashCorpCardToArchives|\b10\.3\.1g\b|Off-Campus Apartment|Personal Workshop|Street Peddler/,
  },
  uninstall: {
    title: "2. Uninstall, ice removal, run position, rearrange",
    mutate: ["src/state/runPosition.ts", "src/effects/kinds/moveKinds.ts"],
    tests: [
      "tests/*uninstall*.test.ts",
      "tests/run-movement-phase.test.ts",
      "tests/ice-installed-outermost.test.ts",
    ],
    grep: /noteIceUninstalled|removeCardFromCurrentZone|\b(8\.5\.10|6\.2\.4|6\.2\.6|6\.2\.7[ace]?|8\.3\.1|8\.8\.2)\b|Mandatory Seed Replacement|Sunset|Escher|Mind Game|Formicary/,
  },
  swap: {
    title: "3. Swap",
    mutate: ["src/effects/kinds/swapKinds.ts", "src/effects/primitives/swapNetBreach.ts"],
    tests: ["tests/*swap*.test.ts"],
    grep: /\b8\.8\.[1-4]|Yagi-Uda|Daruma|Sakai|Surfer|Inversificator|Allele|Nihongai|Turntable|Midori|Mitra Aman|Tāo Salonga|\bswap_/,
  },
  visibility: {
    title: "4. Visibility",
    mutate: ["src/state/seatVisibility.ts", "src/api/library.ts"],
    tests: ["tests/*public-view*.test.ts", "tests/*visib*.test.ts", "tests/*seat*.test.ts"],
    grep: /getPublicView|seatVisibility|\b(1\.21\.[1-6]|10\.2\.[1-3])/,
  },
  "corp-install": {
    title: "5. Corp install",
    mutate: [
      "src/actions/installCorp.ts",
      "src/effects/corpInstall.ts",
      "src/effects/corpAbilityInstall.ts",
    ],
    tests: ["tests/corp-install*.test.ts", "tests/*corp-install*.test.ts"],
    grep: /applyCorpInstallPrimitive|\b(8\.5\.(1|2|3|4|5|7|8|9|11)|4\.6\.8)\b|Architect|Jinja City Grid|Casting Call|Mushin/,
  },
  "runner-install": {
    title: "6. Runner install",
    mutate: [
      "src/actions/installRunner.ts",
      "src/effects/runnerInstall.ts",
      "src/state/programHardwareInstall.ts",
      "src/state/virusInstall.ts",
    ],
    tests: ["tests/program-install-memory.test.ts", "tests/*runner-install*.test.ts"],
    grep: /installRunner|\b8\.5\.6|Street Peddler|Hayley|Compile|DaVinci|Rosetta/,
  },
  rez: {
    title: "7. Rez and derez",
    mutate: ["src/actions/rez.ts", "src/state/iceRezHooks.ts"],
    tests: ["tests/*rez*.test.ts"],
    grep: /\brez_card\b|\bderez_card\b|Surat|Sensor Net|Worlds Plaza|Keros|Brasília/,
  },
  access: {
    title: "8. Access",
    mutate: ["src/actions/access.ts", "src/state/access.ts", "src/state/accessFilter.ts"],
    tests: ["tests/*access*.test.ts"],
    grep: /\baccess_card\b|\b7\.[1-5]\.|Khusyuk|Deep Dive|Detente/,
  },
  damage: {
    title: "9. Damage",
    mutate: ["src/state/damage.ts", "src/effects/damagePrimitives.ts"],
    tests: ["tests/*damage*.test.ts", "tests/cr-examples-ch10.test.ts"],
    grep: /dealDamage|resolveDamage|\bdeal_(net|meat|core|brain)_damage\b|\b10\.4\.|Titanium Ribs|Chronos Protocol/,
  },
  "card-flags": {
    title: "10. Card flags and declarations",
    mutate: ["src/state/cardDeclarations.ts"],
    tests: ["tests/card-declarations.test.ts", "tests/static-flags.test.ts"],
    grep: /\b9\.12\b|continuousSubtypeGrants/,
  },
};

/**
 * Tests that scan source text rather than run the engine. Stryker rewrites
 * the mutated files (mutation switching), so these fail in its dry run and
 * can never kill a behavioural mutant. They stay out of every area.
 */
export const sourceScanTests = new Set([
  "tests/ability-hooks.test.ts",
  "tests/card-flag-inventory.test.ts",
  "tests/cr-example-coverage.test.ts",
  "tests/effect-ir-names.test.ts",
  "tests/invariants-baseline.test.ts",
  "tests/kind-liveness.test.ts",
  "tests/kind-reference.test.ts",
  "tests/one-off-kind-coverage.test.ts",
  "tests/printed-procedure.test.ts",
  "tests/rng-determinism.test.ts",
  "tests/rule-cite-map.test.ts",
  "tests/term-denylist.test.ts",
]);

function globToRegExp(glob) {
  const escaped = glob.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, "[^/]*");
  return new RegExp(`^${escaped}$`);
}

/** Test files for an area, relative to the repo root, sorted. */
export function testFilesFor(name) {
  const area = areas[name];
  if (!area) throw new Error(`Unknown mutation area "${name}"`);
  const globs = area.tests.map(globToRegExp);
  const picked = new Set();
  for (const file of readdirSync(join(root, "tests"))) {
    if (!file.endsWith(".test.ts")) continue;
    const rel = `tests/${file}`;
    if (sourceScanTests.has(rel)) continue;
    if (globs.some((g) => g.test(rel))) {
      picked.add(rel);
      continue;
    }
    if (area.grep && area.grep.test(readFileSync(join(root, rel), "utf8"))) {
      picked.add(rel);
    }
  }
  return [...picked].sort();
}
