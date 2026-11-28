/**
 * Procedure write guard (CR audit Phase 2, guard 1).
 *
 * Moving a card between zones, hosting it, rezzing it, or moving the Runner
 * is a CR procedure (8.2, 8.5, 8.8, 10.3.1g, ch. 6). Each one belongs in a
 * shared helper that runs the whole procedure. This test counts the code in
 * src/** that writes procedure-owned state directly (see tests/state/direct-writes.ts
 * for what counts as a write and which state types own each property).
 *
 * The baseline tests/baselines/direct-writes.json is keyed by file and
 * property, with a count, not by line, so edits elsewhere in a file don't
 * churn it. It may only shrink:
 *   - a count above the baseline fails: route the write through the helper;
 *   - a count below the baseline fails until the baseline is lowered with
 *       UPDATE_DIRECT_WRITES=1 npx vitest run tests/state/procedure-write-guard.test.ts
 *     which refuses to raise any count.
 * Raising a count needs a hand edit of the baseline and a dated reason in
 * its `raised` list.
 *
 * The allowlist names the helper modules. A Phase 3 area adds its helper
 * module here, from its area folder (`src/state/<area>/<procedure>.ts`), and
 * the area's entries leave the baseline.
 * `src/state/uninstallAndPosition/runPosition.ts` is the run-position helper
 * already (CR 6.2.4, 6.2.6); this guard replaces the regex guard that was in
 * tests/state/run/ice-uninstalled-during-run.test.ts.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  countWrites,
  ROOT,
  scanDirectWrites,
  type WriteCounts,
} from "./direct-writes.js";

const BASELINE_PATH = join(ROOT, "tests/baselines/direct-writes.json");
const REGENERATE =
  "UPDATE_DIRECT_WRITES=1 npx vitest run tests/state/procedure-write-guard.test.ts";

/** Helper modules allowed to write the listed properties ("*" = every tracked property). */
const ALLOWLIST: Array<{
  path: string;
  properties: readonly string[] | "*";
  why: string;
}> = [
  {
    path: "src/state/turnAndActions/break.ts",
    properties: "*",
    why: "the break helper (area 11)",
  },
  {
    path: "src/state/uninstallAndPosition/uninstall.ts",
    properties: "*",
    why: "the uninstall helper (area 2)",
  },
  {
    path: "src/state/uninstallAndPosition/rearrange.ts",
    properties: "*",
    why: "the rearrange helper (area 2)",
  },
  {
    path: "src/state/hostingAndTrash/host.ts",
    properties: "*",
    why: "the hosting helper (area 1)",
  },
  {
    path: "src/state/hostingAndTrash/trash.ts",
    properties: "*",
    why: "the trash helper (area 1)",
  },
  {
    path: "src/state/uninstallAndPosition/runPosition.ts",
    properties: ["position", "attackedServerId"],
    why: "setRunnerPosition / noteIceUninstalled / addOutermostIce (CR 6.2.4, 6.2.6)",
  },
];

function allowed(file: string, property: string): boolean {
  return ALLOWLIST.some(
    (a) =>
      (a.path.endsWith("/") ? file.startsWith(a.path) : file === a.path) &&
      (a.properties === "*" || a.properties.includes(property)),
  );
}

type Baseline = {
  _comment: string;
  raised: Array<{
    date: string;
    file: string;
    property: string;
    reason: string;
  }>;
  counts: WriteCounts;
};

function readBaseline(): Baseline {
  return JSON.parse(readFileSync(BASELINE_PATH, "utf8")) as Baseline;
}

const writes = scanDirectWrites();
const SAMPLE = "tests/fixtures/direct-writes-sample.ts";
const outside = writes.filter((w) => !allowed(w.file, w.property));
const found = countWrites(outside);

function flatten(c: WriteCounts): Map<string, number> {
  const m = new Map<string, number>();
  for (const [file, props] of Object.entries(c)) {
    for (const [p, n] of Object.entries(props)) m.set(`${file} ${p}`, n);
  }
  return m;
}

if (process.env.UPDATE_DIRECT_WRITES) {
  const base = readBaseline();
  const before = flatten(base.counts);
  const raised = [...flatten(found)].filter(
    ([k, n]) => n > (before.get(k) ?? 0),
  );
  if (raised.length > 0) {
    throw new Error(
      `refusing to raise direct-write counts: ${raised.map(([k, n]) => `${k} ${before.get(k) ?? 0}→${n}`).join(", ")}`,
    );
  }
  writeFileSync(
    BASELINE_PATH,
    JSON.stringify({ ...base, counts: found }, null, 2) + "\n",
  );
}

describe("procedure write guard (CR audit Phase 2)", () => {
  it("sees assignments through casts, compound assignment, mutators and reassignment", () => {
    const at = (file: string, property: string, text: RegExp): boolean =>
      writes.some(
        (w) => w.file === file && w.property === property && text.test(w.text),
      );
    // No src/ file writes through a cast since area 2 (Mind Game's −1 was
    // the last), so a fixture checks it.
    const sample = scanDirectWrites(SAMPLE);
    const inSample = (property: string, text: RegExp): boolean =>
      sample.some((w) => w.property === property && text.test(w.text));
    expect(inSample("position", /as \{ position/)).toBe(true);
    expect(inSample("position", /-=/)).toBe(true);
    expect(inSample("attackedServerId", /!\.attackedServerId/)).toBe(true);
    expect(sample.every((w) => w.property !== "label")).toBe(true);
    expect(
      at("src/state/uninstallAndPosition/runPosition.ts", "position", /\+= 1/),
    ).toBe(true);
    expect(
      writes.some((w) => w.kind === "mutate" && w.property === "discardPile"),
    ).toBe(true);
    expect(
      writes.some((w) => w.kind === "assign" && /\.filter\(/.test(w.text)),
    ).toBe(true);
  });

  it("does not count a public-view object's fields", () => {
    // src/state/types/publicView.ts PublicView ice/root entries carry `rezzed`; api/library builds them.
    expect(writes.every((w) => !w.file.startsWith("src/state/types/"))).toBe(
      true,
    );
  });

  it("writes outside the helper modules are at most the recorded counts", () => {
    const base = flatten(readBaseline().counts);
    const over = [...flatten(found)]
      .filter(([k, n]) => n > (base.get(k) ?? 0))
      .map(([k, n]) => {
        const [file, property] = k.split(" ");
        const sites = outside
          .filter((w) => w.file === file && w.property === property)
          .map((w) => `    ${w.file}:${w.line} ${w.text}`);
        return `${k}: ${n} > ${base.get(k) ?? 0}\n${sites.join("\n")}`;
      });
    expect(
      over,
      "new direct write(s) to procedure-owned state: call the shared helper instead " +
        "(or, if no helper exists yet, raise the count by hand with a dated reason in `raised`)",
    ).toEqual([]);
  });

  it("the baseline only shrinks: a lowered count is recorded", () => {
    const now = flatten(found);
    const stale = [...flatten(readBaseline().counts)]
      .filter(([k, n]) => (now.get(k) ?? 0) < n)
      .map(([k, n]) => `${k}: ${now.get(k) ?? 0} < ${n}`);
    expect(
      stale,
      `direct writes removed: lower the baseline with ${REGENERATE}`,
    ).toEqual([]);
  });

  it("every raised count has a date and a reason", () => {
    for (const r of readBaseline().raised) {
      expect(r.date, JSON.stringify(r)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(r.reason.length, JSON.stringify(r)).toBeGreaterThan(10);
    }
  });

  it("run position writes outside runPosition.ts are the recorded ones (CR 6.2.4, 6.2.6)", () => {
    // Was the regex guard in tests/state/run/ice-uninstalled-during-run.test.ts, which
    // missed `+=`, `-=` and cast writes.
    // Since area 2 every position and attacked-server write goes through
    // runPosition.ts (CR 6.2.6, 6.2.8).
    const outsideRunPosition = outside
      .filter(
        (w) => w.property === "position" || w.property === "attackedServerId",
      )
      .map((w) => `${w.file}:${w.line} ${w.text}`);
    expect(outsideRunPosition).toEqual([]);
  });
});
