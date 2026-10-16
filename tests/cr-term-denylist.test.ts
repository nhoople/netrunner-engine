/**
 * Fail if banned non-CR synonyms return after the terminology pass.
 * Banned strings come from data/cr-term-map.json aliasesBanned plus a seed list.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const root = join(import.meta.dirname, "..");
const map = JSON.parse(readFileSync(join(root, "data/cr-term-map.json"), "utf8")) as {
  terms: Array<{ term: string; status: string; aliasesBanned?: string[] }>;
};

/** Intentional engine gaps. Expand only with a tracked follow-up. */
const ALLOWED_UNMODELED = new Set<string>([]);

/** True CR synonyms of another aligned name — not encoding backlog. */
const ALLOWED_ALIAS = new Set<string>([]);

const SEED_BANNED = [
  "runner:rig",
  "advancementTokens",
  "accessRemaining",
  "damage_interrupt_paw",
  "tag_interrupt_paw",
  "trace_interrupt_paw",
  "expose_interrupt_paw",
  "trash_interrupt_paw",
  "end_the_run_interrupt_paw",
  "break_interrupt_paw",
  "when_encountered_interrupt_paw",
];

const banned = new Set<string>(SEED_BANNED);
for (const t of map.terms) {
  for (const a of t.aliasesBanned ?? []) {
    // Skip overly broad / comment-only patterns.
    if (a.startsWith(".") && a.length <= 8) continue;
    if (a.startsWith("PlayerState.")) continue;
    if (a.includes("CORP_STEPS.") || a.includes("RUNNER_STEPS.")) continue;
    banned.add(a);
  }
}

const ALLOW_PATH_PARTS = [
  "cr-term-map.json",
  "cr-glossary.md",
  "cr-term-denylist.test.ts",
  "build-cr-term-map.mjs",
];

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === "dist" || name === "vendor") continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx|mjs|js)$/.test(name)) out.push(p);
  }
  return out;
}

function isAllowed(path: string): boolean {
  const rel = relative(root, path);
  return ALLOW_PATH_PARTS.some((part) => rel.includes(part));
}

describe("CR term denylist", () => {
  it("cr-term-map covers a full inventory", () => {
    expect(map.terms.length).toBeGreaterThan(200);
  });

  it("only allowlisted CR terms remain unmodeled", () => {
    const unmodeled = map.terms
      .filter((t) => t.status === "unmodeled")
      .map((t) => t.term);
    expect(unmodeled.sort()).toEqual([...ALLOWED_UNMODELED].sort());
  });

  it("only allowlisted CR terms remain alias", () => {
    const aliases = map.terms
      .filter((t) => t.status === "alias")
      .map((t) => t.term);
    expect(aliases.sort()).toEqual([...ALLOWED_ALIAS].sort());
  });

  it("source tree does not reintroduce banned synonyms", () => {
    const files = walk(join(root, "src")).concat(walk(join(root, "tests")));
    const hits: string[] = [];
    for (const file of files) {
      if (isAllowed(file)) continue;
      const text = readFileSync(file, "utf8");
      for (const ban of banned) {
        if (!ban || ban.length < 3) continue;
        if (text.includes(ban)) {
          hits.push(`${relative(root, file)}: ${ban}`);
        }
      }
    }
    expect(hits, hits.slice(0, 20).join("\n")).toEqual([]);
  });

  it("play-area helper treats runner:installed as play area", async () => {
    const { isPlayAreaZone } = await import("../src/state/zones.js");
    expect(isPlayAreaZone("runner:installed")).toBe(true);
    expect(isPlayAreaZone("corp:hq")).toBe(false);
  });

  it("PlayerState uses coreDamage / discardPile / scoreArea / installed", () => {
    const types = readFileSync(join(root, "src/state/types.ts"), "utf8");
    expect(types).toMatch(/coreDamage:\s*number/);
    expect(types).toMatch(/discardPile:\s*string\[\]/);
    expect(types).toMatch(/scoreArea:\s*string\[\]/);
    expect(types).toMatch(/installed:\s*string\[\]/);
    expect(types).not.toMatch(/^\s*brainDamage:/m);
    expect(types).not.toMatch(/^\s*discard:\s*string\[\]/m);
    expect(types).not.toMatch(/"runner:rig"/);
  });
});
