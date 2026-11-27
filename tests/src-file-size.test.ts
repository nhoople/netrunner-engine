/**
 * No engine src/ file passes 2,000 lines (repository layout plan, decision 4).
 * About 2,000 lines is what an agent reads at once, so a longer file is never
 * seen whole.
 *
 * The files that were already over the limit when this check was added sit on
 * a shrink-only baseline, tests/baselines/src-file-size.json:
 *   - a file on it may shrink, not grow;
 *   - a smaller count is recorded with
 *       UPDATE_SRC_FILE_SIZE=1 npx vitest run tests/src-file-size.test.ts
 *     which also takes off every file at or under the limit, and refuses to
 *     raise a count;
 *   - no file is ever added: a new file over the limit is split instead.
 * The layout plan's slices E1–E5 split these files until the list is empty.
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const BASELINE_PATH = join(ROOT, "tests/baselines/src-file-size.json");
const LIMIT = 2000;
const SPLIT_HINT =
  "split it by what its parts do (see the engine README's Layout section); do not add it to tests/baselines/src-file-size.json";

/**
 * The baseline when it was made (2026-11-27). The baseline may lose files,
 * never gain one, and never records a file above its size here, so a file that
 * came off the list cannot be put back at a larger size.
 */
const STARTING_SIZES: Readonly<Record<string, number>> = {
  "src/effects/ir.ts": 8786,
  "src/state/types.ts": 6331,
  "src/timing/graph.ts": 6092,
  "src/effects/kinds/otherKinds.ts": 4794,
  "src/legality/checkpoints.ts": 4770,
  "src/cards/load.ts": 4484,
  "src/effects/kinds/installKinds.ts": 4170,
  "src/actions/apply.ts": 3928,
  "src/effects/kinds/trashKinds.ts": 2690,
  "src/state/keywordsAndCredits/costs.ts": 2231,
  "src/effects/eval.ts": 2166,
};

type Baseline = { _comment: string; files: Record<string, number> };

/** Lines as an editor numbers them: a final newline does not start a line. */
function countLines(text: string): number {
  if (text.length === 0) return 0;
  const newlines = text.split("\n").length - 1;
  return text.endsWith("\n") ? newlines : newlines + 1;
}

function srcFiles(dir = join(ROOT, "src"), out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) srcFiles(path, out);
    else if (entry.isFile()) out.push(path);
  }
  return out;
}

/** Line count of every file under src/, keyed by its repo-relative path. */
function currentSizes(): Map<string, number> {
  const sizes = new Map<string, number>();
  for (const path of srcFiles()) {
    const rel = relative(ROOT, path).split("\\").join("/");
    sizes.set(rel, countLines(readFileSync(path, "utf8")));
  }
  return sizes;
}

const readBaseline = (): Baseline =>
  JSON.parse(readFileSync(BASELINE_PATH, "utf8")) as Baseline;

if (process.env.UPDATE_SRC_FILE_SIZE) {
  const base = readBaseline();
  const sizes = currentSizes();
  const raised = Object.entries(base.files).filter(
    ([file, lines]) => (sizes.get(file) ?? 0) > lines,
  );
  if (raised.length > 0) {
    throw new Error(
      `refusing to raise a count (${raised.map(([f]) => f).join(", ")}): ${SPLIT_HINT}`,
    );
  }
  const files: Record<string, number> = {};
  for (const file of Object.keys(base.files)) {
    const lines = sizes.get(file) ?? 0;
    if (lines > LIMIT) files[file] = lines;
  }
  writeFileSync(
    BASELINE_PATH,
    JSON.stringify({ ...base, files }, null, 2) + "\n",
  );
}

describe(`engine src/ files stay at or under ${LIMIT} lines (layout plan decision 4)`, () => {
  it(`a src/ file over ${LIMIT} lines fails unless the size baseline lists it`, () => {
    const listed = readBaseline().files;
    const over = [...currentSizes()]
      .filter(([file, lines]) => lines > LIMIT && !(file in listed))
      .map(([file, lines]) => `${file}: ${lines} lines`);
    expect(over, `a src/ file passed ${LIMIT} lines: ${SPLIT_HINT}`).toEqual(
      [],
    );
  });

  it("a file on the size baseline does not grow", () => {
    const sizes = currentSizes();
    const grew = Object.entries(readBaseline().files)
      .filter(([file, lines]) => (sizes.get(file) ?? 0) > lines)
      .map(([file, lines]) => `${file}: ${lines} → ${sizes.get(file)} lines`);
    expect(grew, `a file on the size baseline grew: ${SPLIT_HINT}`).toEqual([]);
  });

  it("the size baseline records each file's current size, and drops a file once it is at or under the limit", () => {
    const sizes = currentSizes();
    const stale = Object.entries(readBaseline().files)
      .filter(([file, lines]) => (sizes.get(file) ?? 0) < lines)
      .map(([file, lines]) => {
        const now = sizes.get(file);
        if (now === undefined) return `${file}: gone`;
        return now > LIMIT
          ? `${file}: ${lines} → ${now} lines`
          : `${file}: ${now} lines, at or under the limit`;
      });
    expect(
      stale,
      "a file on the size baseline shrank: record it with UPDATE_SRC_FILE_SIZE=1 npx vitest run tests/src-file-size.test.ts",
    ).toEqual([]);
  });

  it("the size baseline only loses files, and never lists one above its starting size", () => {
    const added = Object.entries(readBaseline().files)
      .filter(([file, lines]) => {
        const start = STARTING_SIZES[file];
        return start === undefined || lines > start;
      })
      .map(([file, lines]) => `${file}: ${lines} lines`);
    expect(
      added,
      `a file was added to the size baseline, or raised above its starting size: ${SPLIT_HINT}`,
    ).toEqual([]);
  });
});
