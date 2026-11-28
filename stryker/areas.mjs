/**
 * Phase 3 areas for mutation testing (CR audit tool 1.9).
 *
 * Each area lists the helper files Stryker mutates and how to pick the tests
 * that should kill those mutants. The scope follows the Areas table in the
 * meta repo's docs/plans/cr-audit-standardization-program.md. When an area's
 * session moves a procedure into its area folder (src/state/<area>/), add
 * that module here.
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
      "src/state/hostingAndTrash/host.ts",
      "src/state/hostingAndTrash/trash.ts",
    ],
    tests: ["tests/**/*trash*.test.ts", "tests/**/*host*.test.ts"],
    grep: /\btrashCard\(|\bhostCard\(|\bunhostCard\(|\b10\.3\.1g\b|\b1\.13\.1[23]\b|\b4\.4\.6b\b|Off-Campus Apartment|Personal Workshop|Street Peddler|Sacrificial Construct|Skorpios|Marilyn Campaign|Director Haas/,
  },
  uninstall: {
    title: "2. Uninstall, ice removal, run position, rearrange",
    mutate: [
      "src/state/uninstallAndPosition/runPosition.ts",
      "src/state/uninstallAndPosition/uninstall.ts",
      "src/state/uninstallAndPosition/rearrange.ts",
    ],
    tests: [
      "tests/**/*uninstall*.test.ts",
      "tests/state/run/run-movement-phase.test.ts",
      "tests/state/install/ice-installed-outermost.test.ts",
    ],
    grep: /noteIceUninstalled|removeCardFromCurrentZone|uninstallCard|rearrangeIce|moveIce|\b(8\.5\.1b|8\.5\.10|6\.2\.4|6\.2\.6|6\.2\.7[a-e]?|6\.2\.8[a-c]?|8\.3\.[12]a?|8\.8\.2|4\.9\.2)\b|Mandatory Seed Replacement|Sunset|Escher|Mind Game|Formicary|Nanuq|Muertos Gang Member/,
  },
  swap: {
    title: "3. Swap",
    mutate: ["src/effects/swap/swapKinds.ts"],
    tests: ["tests/**/*swap*.test.ts"],
    grep: /\b8\.8\.[1-4]|Yagi-Uda|Daruma|Sakai|Surfer|Inversificator|Allele|Nihongai|Turntable|Midori|Mitra Aman|Tāo Salonga|\bswap_/,
  },
  visibility: {
    title: "4. Visibility",
    mutate: ["src/state/visibility/seatVisibility.ts", "src/api/library.ts"],
    tests: [
      "tests/**/*public-view*.test.ts",
      "tests/**/*visib*.test.ts",
      "tests/**/*seat*.test.ts",
    ],
    grep: /getPublicView|seatVisibility|\b(1\.21\.[1-6]|10\.2\.[1-3])/,
  },
  "corp-install": {
    title: "5. Corp install",
    mutate: [
      "src/actions/installCorp.ts",
      "src/effects/install/corpInstall.ts",
      "src/effects/install/corpAbilityInstall.ts",
    ],
    tests: [
      "tests/**/corp-install*.test.ts",
      "tests/**/*corp-install*.test.ts",
    ],
    grep: /applyCorpInstallPrimitive|\b(8\.5\.(1|2|3|4|5|7|8|9|11)|4\.6\.8)\b|Architect|Jinja City Grid|Casting Call|Mushin/,
  },
  "runner-install": {
    title: "6. Runner install",
    mutate: [
      "src/actions/installRunner.ts",
      "src/effects/install/runnerInstall.ts",
      "src/state/install/programHardwareInstall.ts",
      "src/state/install/virusInstall.ts",
    ],
    tests: [
      "tests/state/install/program-install-memory.test.ts",
      "tests/**/*runner-install*.test.ts",
    ],
    grep: /installRunner|\b8\.5\.6|Street Peddler|Hayley|Compile|DaVinci|Rosetta/,
  },
  rez: {
    title: "7. Rez and derez",
    mutate: ["src/actions/rez.ts", "src/state/rez/iceRezHooks.ts"],
    tests: ["tests/**/*rez*.test.ts"],
    grep: /\brez_card\b|\bderez_card\b|Surat|Sensor Net|Worlds Plaza|Keros|Brasília/,
  },
  access: {
    title: "8. Access",
    mutate: [
      "src/actions/access.ts",
      "src/state/access/access.ts",
      "src/state/access/accessFilter.ts",
    ],
    tests: ["tests/**/*access*.test.ts"],
    grep: /\baccess_card\b|\b7\.[1-5]\.|Khusyuk|Deep Dive|Detente/,
  },
  damage: {
    title: "9. Damage",
    mutate: [
      "src/state/damageAndPrevention/damage.ts",
      "src/effects/damageAndPrevention/damagePrimitives.ts",
    ],
    tests: [
      "tests/**/*damage*.test.ts",
      "tests/cr-examples/cr-examples-ch10.test.ts",
    ],
    grep: /dealDamage|resolveDamage|\bdeal_(net|meat|core|brain)_damage\b|\b10\.4\.|Titanium Ribs|Chronos Protocol/,
  },
  timing: {
    title: "RA-1. Timing re-audit (9.1–9.3, 9.6, 9.9, 9.11, 10.3)",
    mutate: [
      "src/state/triggers/pendingAbilities.ts",
      "src/state/triggers/replacements.ts",
      "src/state/triggers/checkpointSnapshot.ts",
      "src/state/triggers/storedConditionalHooks.ts",
      "src/state/triggers/inlineConditionalHooks.ts",
    ],
    tests: [
      "tests/timing/timing-reaudit.test.ts",
      "tests/state/triggers/pending-abilities.test.ts",
      "tests/state/triggers/reaction-window-order.test.ts",
      "tests/state/triggers/replacement-layer-9.9.9.test.ts",
      "tests/state/triggers/stored-triggers.test.ts",
      "tests/legality/instruction-checkpoints.test.ts",
      "tests/timing/choice-timing.test.ts",
    ],
    grep: /\b(9\.2\.[89]|9\.6\.\d|9\.9\.\d|9\.11\.\d|10\.3\.\d)|noteInlineConditional|noteStoredConditional|tryApplyReplacement/,
  },
  "card-flags": {
    title: "10. Card flags and declarations",
    mutate: ["src/state/cardFlags/cardDeclarations.ts"],
    tests: [
      "tests/state/cardFlags/card-declarations.test.ts",
      "tests/state/cardFlags/static-flags.test.ts",
    ],
    grep: /\b9\.12\b|continuousSubtypeGrants/,
  },
  continuous: {
    title: "RA-2. Continuous effects (re-audit of CR 9.4, 9.10, 9.12)",
    mutate: [
      "src/state/continuous/continuousEffects.ts",
      "src/state/continuous/lingeringEffects.ts",
      "src/state/continuous/abilities.ts",
      "src/state/triggers/pendingChoice.ts",
    ],
    tests: [
      "tests/**/blank*.test.ts",
      "tests/**/continuous-*.test.ts",
      "tests/cr-examples/cr-examples-ch9.test.ts",
    ],
    grep: /\b(9\.4\.\d|9\.10\.\d|9\.12\.1[a-e]?|9\.12\.5[a-d]?)\b|lingering|addLingeringEffect|resolveIceSubtypes|openPendingChoose|Mother Goddess|Klevetnik/,
  },
};

/**
 * Tests that scan source text rather than run the engine. Stryker rewrites
 * the mutated files (mutation switching), so these fail in its dry run and
 * can never kill a behavioural mutant. They stay out of every area.
 */
export const sourceScanTests = new Set([
  "tests/effects/ability-hooks.test.ts",
  "tests/state/cardFlags/card-flag-inventory.test.ts",
  "tests/cr-citations/cr-citation-topics.test.ts",
  "tests/cr-citations/cr-cited-text.test.ts",
  "tests/cr-examples/cr-example-coverage.test.ts",
  "tests/cr-citations/cr-section-owners.test.ts",
  "tests/cr-citations/cr-subrule-coverage.test.ts",
  "tests/effects/effect-ir-names.test.ts",
  "tests/cards/format-counts.test.ts",
  "tests/debug/invariants-baseline.test.ts",
  "tests/effects/kind-effect-coverage.test.ts",
  "tests/effects/kind-liveness.test.ts",
  "tests/effects/kind-reference.test.ts",
  "tests/printed/printed-procedure.test.ts",
  "tests/state/procedure-write-guard.test.ts",
  "tests/state/rng-determinism.test.ts",
  "tests/cr-citations/rule-cite-map.test.ts",
  "tests/repo/term-denylist.test.ts",
]);

// A single star matches within one folder; a double star and slash match any
// number of folders.
function globToRegExp(glob) {
  const escaped = glob
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*\//g, "\0")
    .replace(/\*/g, "[^/]*")
    .replace(/\0/g, "(?:[^/]+/)*");
  return new RegExp(`^${escaped}$`);
}

/** Every test file under tests/ that `npm test` runs (not tests/jnet), relative to the repo root. */
function testFiles() {
  return readdirSync(join(root, "tests"), { recursive: true })
    .map((file) => `tests/${file.split("\\").join("/")}`)
    .filter(
      (rel) => rel.endsWith(".test.ts") && !rel.startsWith("tests/jnet/"),
    );
}

/** Test files for an area, relative to the repo root, sorted. */
export function testFilesFor(name) {
  const area = areas[name];
  if (!area) throw new Error(`Unknown mutation area "${name}"`);
  const globs = area.tests.map(globToRegExp);
  const picked = new Set();
  for (const rel of testFiles()) {
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
