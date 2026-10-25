/**
 * Fail-closed coverage guard for one-off IR kinds.
 *
 * A "one-off kind" is an effect kind used by exactly one card. The audit
 * found these are the least-reviewed semantic surface in the engine, so a
 * NEW one-off kind must arrive with a test that mentions it (normally a
 * printed-outcome test in tests/one-off-kind-outcomes.test.ts). Kinds that
 * predate the guard are grandfathered in one-off-kind-untested.json; the
 * baseline may only shrink. If a grandfathered kind gains a test, remove
 * it from the baseline in the same change.
 */
import { readdirSync, readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import {
  assertCardsPinnedTag,
  assertPinnedTag,
  cardsDataPresent,
  crDataPresent,
} from "../src/index.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.147.13");
});

function collectKinds(node: unknown, out: Set<string>): void {
  if (Array.isArray(node)) {
    for (const v of node) collectKinds(v, out);
    return;
  }
  if (node !== null && typeof node === "object") {
    const rec = node as Record<string, unknown>;
    if (typeof rec.kind === "string") out.add(rec.kind);
    for (const v of Object.values(rec)) collectKinds(v, out);
  }
}

function oneOffKinds(): Set<string> {
  const cardsDir = new URL("../vendor/cards-data/", import.meta.url);
  const byKind = new Map<string, Set<string>>();
  for (const side of ["corp", "runner"]) {
    const sideDir = new URL(`${side}/`, cardsDir);
    const stack = [sideDir];
    while (stack.length > 0) {
      const dir = stack.pop()!;
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const child = new URL(
          `${entry.name}${entry.isDirectory() ? "/" : ""}`,
          dir,
        );
        if (entry.isDirectory()) {
          stack.push(child);
        } else if (entry.name.endsWith(".json")) {
          const card = JSON.parse(readFileSync(child, "utf8")) as {
            id?: string;
          };
          if (typeof card.id !== "string") continue;
          const kinds = new Set<string>();
          collectKinds(card, kinds);
          for (const kind of kinds) {
            if (!byKind.has(kind)) byKind.set(kind, new Set());
            byKind.get(kind)!.add(card.id);
          }
        }
      }
    }
  }
  const oneOff = new Set<string>();
  for (const [kind, cards] of byKind) {
    if (cards.size === 1) oneOff.add(kind);
  }
  return oneOff;
}

function testCorpus(): string {
  const testsDir = new URL("./", import.meta.url);
  let corpus = "";
  for (const entry of readdirSync(testsDir, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith(".ts")) continue;
    if (entry.name === "one-off-kind-coverage.test.ts") continue;
    corpus += readFileSync(new URL(entry.name, testsDir), "utf8");
  }
  return corpus;
}

describe("one-off kind coverage", () => {
  it("every one-off kind is test-mentioned or grandfathered", () => {
    const baseline = JSON.parse(
      readFileSync(
        new URL("./one-off-kind-untested.json", import.meta.url),
        "utf8",
      ),
    ) as string[];
    const corpus = testCorpus();
    const uncovered = [...oneOffKinds()]
      .filter((kind) => !corpus.includes(kind))
      .sort();
    const newUncovered = uncovered.filter((k) => !baseline.includes(k));
    const staleBaseline = baseline.filter((k) => !uncovered.includes(k));
    expect(
      newUncovered,
      "new one-off kind(s) with no test mention — add a printed-outcome " +
        "test (tests/one-off-kind-outcomes.test.ts) or, if the kind is " +
        "genuinely exercised another way, record it in " +
        "tests/one-off-kind-untested.json with the PR explaining why",
    ).toEqual([]);
    expect(
      staleBaseline,
      "baseline entries that are now covered (or no longer one-off) — " +
        "remove them from tests/one-off-kind-untested.json",
    ).toEqual([]);
  });
});
