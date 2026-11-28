/**
 * Kind effect coverage (CR audit Phase 2, guard 2). Replaces the mention rule
 * of the old tests/effects/one-off-kind-outcomes.test.ts, which passed when any test
 * file merely contained the kind's name (Yagi-Uda passed that way).
 *
 * Every kind in KNOWN_PRIMITIVE_KINDS must
 *   (a) be reachable: used by card JSON, built by a card flag's reader, or
 *       built by named engine code. That half is tests/effects/kind-liveness.test.ts
 *       (a) and (c), with its own shrink-only baseline;
 *   (b) be covered by an `it()` that registers it with `coversKind("x")` and
 *       asserts a state change with `expectStateDelta(before, after, {...})`
 *       (tests/effects/kind-coverage.ts). Both calls must sit in the same `it()`.
 *
 * The baseline tests/baselines/kind-effect-coverage.json lists the kinds
 * without such a test. It may only shrink: a new kind must arrive with a
 * covering test, and a covered kind leaves the baseline in the same change
 *   UPDATE_KIND_COVERAGE=1 npx vitest run tests/effects/kind-effect-coverage.test.ts
 * (which refuses to add a kind).
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { KNOWN_PRIMITIVE_KINDS } from "../../src/effects/ir/knownKinds.js";

const ROOT = process.cwd();
const BASELINE_PATH = join(ROOT, "tests/baselines/kind-effect-coverage.json");
const REGENERATE =
  "UPDATE_KIND_COVERAGE=1 npx vitest run tests/effects/kind-effect-coverage.test.ts";

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    // jnet ports do not run in CI (vitest.config.ts excludes them).
    if (entry.isDirectory()) {
      if (entry.name !== "jnet" && entry.name !== "baselines") walk(path, out);
    } else if (entry.name.endsWith(".ts")) out.push(path);
  }
  return out.sort();
}

function calleeName(call: ts.CallExpression): string {
  let e: ts.Expression = call.expression;
  // it.each(...)(...), it.only, test.skip, …
  while (ts.isCallExpression(e) || ts.isPropertyAccessExpression(e))
    e = e.expression;
  return ts.isIdentifier(e) ? e.text : "";
}

function contains(node: ts.Node, name: string): boolean {
  let hit = false;
  const visit = (n: ts.Node): void => {
    if (hit) return;
    if (
      ts.isCallExpression(n) &&
      ts.isIdentifier(n.expression) &&
      n.expression.text === name
    ) {
      hit = true;
      return;
    }
    ts.forEachChild(n, visit);
  };
  visit(node);
  return hit;
}

type Registration = {
  file: string;
  line: number;
  kind: string;
  ok: boolean;
  why?: string;
};

function registrations(): Registration[] {
  const out: Registration[] = [];
  for (const path of walk(join(ROOT, "tests"))) {
    const text = readFileSync(path, "utf8");
    if (!text.includes("coversKind(")) continue;
    const sf = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true);
    const file = relative(ROOT, path);
    const visit = (node: ts.Node): void => {
      if (
        ts.isCallExpression(node) &&
        ts.isIdentifier(node.expression) &&
        node.expression.text === "coversKind" &&
        !ts.isFunctionDeclaration(node.parent)
      ) {
        const line =
          sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
        const arg = node.arguments[0];
        if (!arg || !ts.isStringLiteralLike(arg)) {
          out.push({
            file,
            line,
            kind: "?",
            ok: false,
            why: "argument is not a string literal",
          });
        } else {
          let p: ts.Node | undefined = node.parent;
          while (
            p &&
            !(ts.isCallExpression(p) && ["it", "test"].includes(calleeName(p)))
          ) {
            p = p.parent;
          }
          if (!p) {
            out.push({
              file,
              line,
              kind: arg.text,
              ok: false,
              why: "not inside an it()",
            });
          } else if (!contains(p, "expectStateDelta")) {
            out.push({
              file,
              line,
              kind: arg.text,
              ok: false,
              why: "its it() never calls expectStateDelta",
            });
          } else {
            out.push({ file, line, kind: arg.text, ok: true });
          }
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
  }
  return out;
}

const regs = registrations().filter(
  (r) => r.file !== "tests/effects/kind-coverage.ts",
);
const covered = new Set(regs.filter((r) => r.ok).map((r) => r.kind));
const uncovered = [...KNOWN_PRIMITIVE_KINDS]
  .filter((k) => !covered.has(k))
  .sort();

type Baseline = { _comment: string; uncovered: string[] };
const readBaseline = (): Baseline =>
  JSON.parse(readFileSync(BASELINE_PATH, "utf8")) as Baseline;

if (process.env.UPDATE_KIND_COVERAGE) {
  const base = readBaseline();
  const added = uncovered.filter((k) => !base.uncovered.includes(k));
  if (added.length > 0) {
    throw new Error(`refusing to add uncovered kind(s): ${added.join(", ")}`);
  }
  writeFileSync(
    BASELINE_PATH,
    JSON.stringify({ ...base, uncovered }, null, 2) + "\n",
  );
}

describe("kind effect coverage (CR audit Phase 2)", () => {
  it("every coversKind() names a known kind and sits in an it() that asserts a state change", () => {
    expect(regs.length, "no coversKind() registrations found").toBeGreaterThan(
      0,
    );
    const bad = regs
      .filter((r) => !r.ok || !KNOWN_PRIMITIVE_KINDS.has(r.kind))
      .map((r) => `${r.file}:${r.line} ${r.kind}: ${r.why ?? "unknown kind"}`);
    expect(bad).toEqual([]);
  });

  it("a kind with no state-change test is recorded (new kinds need one)", () => {
    const recorded = readBaseline().uncovered;
    expect(recorded, "baseline must stay sorted").toEqual([...recorded].sort());
    expect(
      uncovered.filter((k) => !recorded.includes(k)),
      "kind(s) with no it() that calls coversKind(kind) and expectStateDelta(...): " +
        "add one (tests/effects/kind-coverage.ts)",
    ).toEqual([]);
  });

  it("the baseline only shrinks: covered or removed kinds leave it", () => {
    expect(
      readBaseline().uncovered.filter((k) => !uncovered.includes(k)),
      `kind(s) now covered or no longer known: shrink the baseline with ${REGENERATE}`,
    ).toEqual([]);
  });
});
