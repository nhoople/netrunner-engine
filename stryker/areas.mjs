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
    mutate: ["src/state/procedures/host.ts", "src/state/procedures/trash.ts"],
    tests: ["tests/*trash*.test.ts", "tests/*host*.test.ts"],
    grep: /\btrashCard\(|\bhostCard\(|\bunhostCard\(|\b10\.3\.1g\b|\b1\.13\.1[23]\b|\b4\.4\.6b\b|Off-Campus Apartment|Personal Workshop|Street Peddler|Sacrificial Construct|Skorpios|Marilyn Campaign|Director Haas/,
  },
  uninstall: {
    title: "2. Uninstall, ice removal, run position, rearrange",
    mutate: [
      "src/state/runPosition.ts",
      "src/state/procedures/uninstall.ts",
      "src/state/procedures/rearrange.ts",
    ],
    tests: [
      "tests/*uninstall*.test.ts",
      "tests/run-movement-phase.test.ts",
      "tests/ice-installed-outermost.test.ts",
    ],
    grep: /noteIceUninstalled|removeCardFromCurrentZone|uninstallCard|rearrangeIce|moveIce|\b(8\.5\.1b|8\.5\.10|6\.2\.4|6\.2\.6|6\.2\.7[a-e]?|6\.2\.8[a-c]?|8\.3\.[12]a?|8\.8\.2|4\.9\.2)\b|Mandatory Seed Replacement|Sunset|Escher|Mind Game|Formicary|Nanuq|Muertos Gang Member/,
  },
  swap: {
    title: "3. Swap",
    mutate: [
      "src/effects/kinds/swapKinds.ts",
      "src/effects/primitives/swapNetBreach.ts",
    ],
    tests: ["tests/*swap*.test.ts"],
    grep: /\b8\.8\.[1-4]|Yagi-Uda|Daruma|Sakai|Surfer|Inversificator|Allele|Nihongai|Turntable|Midori|Mitra Aman|Tāo Salonga|\bswap_/,
  },
  visibility: {
    title: "4. Visibility",
    mutate: ["src/state/visibility/seatVisibility.ts", "src/api/library.ts"],
    tests: [
      "tests/*public-view*.test.ts",
      "tests/*visib*.test.ts",
      "tests/*seat*.test.ts",
    ],
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
      "src/state/install/programHardwareInstall.ts",
      "src/state/install/virusInstall.ts",
    ],
    tests: [
      "tests/program-install-memory.test.ts",
      "tests/*runner-install*.test.ts",
    ],
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
    mutate: [
      "src/actions/access.ts",
      "src/state/access/access.ts",
      "src/state/access/accessFilter.ts",
    ],
    tests: ["tests/*access*.test.ts"],
    grep: /\baccess_card\b|\b7\.[1-5]\.|Khusyuk|Deep Dive|Detente/,
  },
  damage: {
    title: "9. Damage",
    mutate: ["src/state/damage.ts", "src/effects/damagePrimitives.ts"],
    tests: ["tests/*damage*.test.ts", "tests/cr-examples-ch10.test.ts"],
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
      "tests/timing-reaudit.test.ts",
      "tests/pending-abilities.test.ts",
      "tests/reaction-window-order.test.ts",
      "tests/replacement-layer-9.9.9.test.ts",
      "tests/stored-triggers.test.ts",
      "tests/instruction-checkpoints.test.ts",
      "tests/choice-timing.test.ts",
    ],
    grep: /\b(9\.2\.[89]|9\.6\.\d|9\.9\.\d|9\.11\.\d|10\.3\.\d)|noteInlineConditional|noteStoredConditional|tryApplyReplacement/,
  },
  "card-flags": {
    title: "10. Card flags and declarations",
    mutate: ["src/state/cardFlags/cardDeclarations.ts"],
    tests: ["tests/card-declarations.test.ts", "tests/static-flags.test.ts"],
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
      "tests/blank*.test.ts",
      "tests/continuous-*.test.ts",
      "tests/cr-examples-ch9.test.ts",
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
  "tests/ability-hooks.test.ts",
  "tests/card-flag-inventory.test.ts",
  "tests/cr-citation-topics.test.ts",
  "tests/cr-cited-text.test.ts",
  "tests/cr-example-coverage.test.ts",
  "tests/cr-section-owners.test.ts",
  "tests/cr-subrule-coverage.test.ts",
  "tests/effect-ir-names.test.ts",
  "tests/format-counts.test.ts",
  "tests/invariants-baseline.test.ts",
  "tests/kind-effect-coverage.test.ts",
  "tests/kind-liveness.test.ts",
  "tests/kind-reference.test.ts",
  "tests/printed-procedure.test.ts",
  "tests/procedure-write-guard.test.ts",
  "tests/rng-determinism.test.ts",
  "tests/rule-cite-map.test.ts",
  "tests/term-denylist.test.ts",
]);

function globToRegExp(glob) {
  const escaped = glob
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, "[^/]*");
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
