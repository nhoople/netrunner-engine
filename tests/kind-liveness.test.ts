/**
 * Kind liveness and no-op sweep (CR audit tool 1.2).
 *
 * (a) Dead kinds: a kind in KNOWN_PRIMITIVE_KINDS that no card JSON uses and
 *     that no code in src/ builds. Its dispatch `case`, its member of the
 *     `Primitive` union, its entry in the set, and an `fx` helper nobody
 *     calls do not count as building it.
 * (b) No-op choices: a choice builder whose every option effect is the
 *     placeholder `gain_credits 0` or an empty `seq`. The printed ability then
 *     does nothing through the IR. Some of these are resolved by option id in
 *     `src/actions/apply.ts` instead (Tāo Salonga's `swap-a-b` ids); that is
 *     still a procedure hidden from the IR, so they are reported too, with
 *     the dispatch literal in the failure message.
 * (c) Card flags whose consumer builds a no-op kind. Needs the flag-to-kind
 *     map from tool 1.10 (tests/baselines/card-flags.json).
 *
 * The baseline tests/baselines/kind-liveness.json may only shrink: a new
 * entry fails, and an entry that is no longer found fails until it is
 * removed from the baseline.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import {
  assertCardsPinnedTag,
  assertPinnedTag,
  cardsDataPresent,
  crDataPresent,
} from "../src/index.js";
import { KNOWN_PRIMITIVE_KINDS } from "../src/effects/ir.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.147.23");
});

const ROOT = process.cwd();
const BASELINE_PATH = join(ROOT, "tests/baselines/kind-liveness.json");

type Baseline = {
  deadKinds: string[];
  noOpChoices: string[];
};

function walk(dir: string, ext: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) walk(path, ext, out);
    else if (entry.name.endsWith(ext)) out.push(path);
  }
  return out.sort();
}

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

function cardFiles(): string[] {
  return ["corp", "runner"].flatMap((side) =>
    walk(join(ROOT, "vendor/cards-data", side), ".json"),
  );
}

const srcFiles = walk(join(ROOT, "src"), ".ts");
const srcText = new Map(
  srcFiles.map((f) => [relative(ROOT, f), readFileSync(f, "utf8")]),
);

// ---------------------------------------------------------------- (a)

/**
 * String literals that build a value rather than name a type or match one.
 * Skips `case "x":`, `=== "x"`, `!== "x"`, `as "x"`, and union members
 * (`"x" |`, `| "x"`, `kind: "x";`).
 */
function builtLiterals(line: string): string[] {
  const out: string[] = [];
  for (const m of line.matchAll(/"([a-z0-9_]+)"/g)) {
    const at = m.index;
    const before = line.slice(Math.max(0, at - 12), at);
    const after = line.slice(at + m[0].length, at + m[0].length + 4);
    if (/case\s+$|[!=]==\s*$|\|\s*$|\bas\s+$/.test(before)) continue;
    if (/^\s*[|;]/.test(after)) continue;
    out.push(m[1]!);
  }
  return out;
}

function deadKinds(): string[] {
  const usedByCards = new Set<string>();
  for (const file of cardFiles()) {
    collectKinds(JSON.parse(readFileSync(file, "utf8")), usedByCards);
  }

  const allSrc = [...srcText.values()].join("\n");
  const built = new Set<string>();
  // kind -> fx helper names whose body builds it (ir.ts `export const fx`).
  const fxBuilders = new Map<string, Set<string>>();

  for (const [file, text] of srcText) {
    const lines = text.split("\n");
    let fxStart = -1;
    let fxEnd = -1;
    if (file === "src/effects/ir.ts") {
      const typeStart = lines.findIndex((l) =>
        l.startsWith("export type Primitive ="),
      );
      const typeEnd = lines.findIndex(
        (l, i) => i > typeStart && l.startsWith("export type Cond ="),
      );
      const setStart = lines.findIndex((l) =>
        l.startsWith("export const KNOWN_PRIMITIVE_KINDS"),
      );
      const setEnd = lines.findIndex(
        (l, i) => i > setStart && l.startsWith("]);"),
      );
      expect(typeStart, "ir.ts layout: Primitive union").toBeGreaterThan(0);
      expect(typeEnd, "ir.ts layout: Cond union").toBeGreaterThan(typeStart);
      expect(setStart, "ir.ts layout: KNOWN_PRIMITIVE_KINDS").toBeGreaterThan(0);
      expect(setEnd, "ir.ts layout: end of set").toBeGreaterThan(setStart);
      for (let i = 0; i < lines.length; i++) {
        if ((i >= typeStart && i < typeEnd) || (i >= setStart && i <= setEnd)) {
          lines[i] = "";
        }
      }
      fxStart = lines.findIndex((l) => l.startsWith("export const fx = {"));
      fxEnd = lines.findIndex((l, i) => i > fxStart && l.startsWith("};"));
      expect(fxStart, "ir.ts layout: fx helpers").toBeGreaterThan(0);
    }
    let helper = "";
    lines.forEach((line, i) => {
      const inFx = i > fxStart && i < fxEnd;
      if (inFx) {
        const h = /^ {2}([A-Za-z0-9_]+)\s*[:(]/.exec(line);
        if (h) helper = h[1]!;
      }
      for (const lit of builtLiterals(line)) {
        if (inFx) {
          if (!fxBuilders.has(lit)) fxBuilders.set(lit, new Set());
          fxBuilders.get(lit)!.add(helper);
        } else {
          built.add(lit);
        }
      }
    });
  }
  // A kind built only by an fx helper is live when that helper is called.
  for (const [kind, helpers] of fxBuilders) {
    if (built.has(kind)) continue;
    for (const h of helpers) {
      if (new RegExp(`\\.${h}\\b`).test(allSrc)) built.add(kind);
    }
  }

  return [...KNOWN_PRIMITIVE_KINDS]
    .filter((k) => !usedByCards.has(k) && !built.has(k))
    .sort();
}

// ---------------------------------------------------------------- (b)

/** Option effects that do nothing. */
const NOOP_EFFECT_SRC = [
  /^effect:\s*\{\s*op:\s*"do",\s*action:\s*\{\s*kind:\s*"gain_credits",\s*side:\s*[^,{}]+,\s*amount:\s*0\s*,?\s*\}\s*,?\s*\}/,
  /^effect:\s*fx\.do\(\s*\{\s*kind:\s*"gain_credits",\s*side:\s*[^,{}]+,\s*amount:\s*0\s*,?\s*\}\s*\)/,
  /^effect:\s*fx\.seq\(\s*\)/,
  /^effect:\s*\{\s*op:\s*"seq",\s*effects:\s*\[\s*\]\s*,?\s*\}/,
  /^effect:\s*noop\b/i,
];

const SCOPE_START =
  /^\s*case\s+"([a-z0-9_]+)"\s*:|^(?:export\s+)?(?:async\s+)?function\s+([A-Za-z0-9_]+)/;
const OPENS_CHOICE = /openPendingChoose\(|fx\.choose\(|op:\s*"choose"/;

/** Literals that src/ compares an option id against (id dispatch). */
function dispatchLiterals(): Set<string> {
  const out = new Set<string>();
  const re = /(?:startsWith\(\s*|[!=]==\s*|case\s+)["'`]([^"'`$]{3,})/g;
  for (const text of srcText.values()) {
    for (const m of text.matchAll(re)) out.add(m[1]!);
  }
  return out;
}

/**
 * Each `case "kind":` block or top-level function in src/ that opens a
 * choice whose option effects are all no-ops. Value: the id-dispatch
 * literals that match its option ids, if any.
 */
function noOpChoiceBuilders(): Map<string, string[]> {
  const dispatch = dispatchLiterals();
  const out = new Map<string, string[]>();
  for (const [file, text] of srcText) {
    const lines = text.split("\n");
    const starts: Array<[number, string]> = [];
    lines.forEach((l, i) => {
      const m = SCOPE_START.exec(l);
      if (m) starts.push([i, m[1] ? `case ${m[1]}` : `function ${m[2]}`]);
    });
    for (let s = 0; s < starts.length; s++) {
      const [from, name] = starts[s]!;
      const to = s + 1 < starts.length ? starts[s + 1]![0] : lines.length;
      const body = lines.slice(from, to).join("\n");
      if (!OPENS_CHOICE.test(body)) continue;
      const effects = [...body.matchAll(/\beffect:/g)]
        .map((m) => body.slice(m.index))
        // `effect: Effect;` is a type annotation, not an option.
        .filter((e) => !/^effect:\s*[A-Z][A-Za-z.]*\s*[;,\n]/.test(e));
      if (effects.length < 2) continue;
      if (!effects.every((e) => NOOP_EFFECT_SRC.some((r) => r.test(e)))) {
        continue;
      }
      const ids = [...body.matchAll(/\bid:\s*["'`]([^"'`$]*)/g)]
        .map((m) => m[1]!)
        .filter((id) => id.length >= 3 && id !== "decline");
      const via = [...dispatch].filter((lit) =>
        ids.some((id) => id.startsWith(lit) || lit.startsWith(id)),
      );
      out.set(`${file}#${name}`, via.sort());
    }
  }
  return out;
}

function isNoOpEffect(effect: unknown): boolean {
  if (effect === null || typeof effect !== "object") return false;
  const e = effect as Record<string, unknown>;
  if (e.op === "seq") {
    return Array.isArray(e.effects) && e.effects.length === 0;
  }
  if (e.op === "do") {
    const a = e.action as Record<string, unknown> | undefined;
    return a?.kind === "gain_credits" && a.amount === 0;
  }
  return false;
}

/** Card JSON `choose` effects whose every option is a no-op. */
function noOpCardChoices(): string[] {
  const out = new Set<string>();
  const visit = (node: unknown, cardId: string): void => {
    if (Array.isArray(node)) {
      for (const v of node) visit(v, cardId);
      return;
    }
    if (node === null || typeof node !== "object") return;
    const rec = node as Record<string, unknown>;
    if (rec.op === "choose" && Array.isArray(rec.options)) {
      const options = rec.options as Array<{ effect?: unknown }>;
      if (options.length > 0 && options.every((o) => isNoOpEffect(o.effect))) {
        out.add(`card:${cardId}`);
      }
    }
    for (const v of Object.values(rec)) visit(v, cardId);
  };
  for (const file of cardFiles()) {
    const card = JSON.parse(readFileSync(file, "utf8")) as { id?: string };
    if (typeof card.id === "string") visit(card, card.id);
  }
  return [...out];
}

// ---------------------------------------------------------------- test

function readBaseline(): Baseline {
  return JSON.parse(readFileSync(BASELINE_PATH, "utf8")) as Baseline;
}

function shrinkOnly(found: string[], recorded: string[], what: string): void {
  const added = found.filter((k) => !recorded.includes(k));
  const gone = recorded.filter((k) => !found.includes(k));
  expect(
    added,
    `new ${what}: fix it, or record it in tests/baselines/kind-liveness.json ` +
      "with a dated reason in the PR",
  ).toEqual([]);
  expect(
    gone,
    `${what} no longer found: remove from tests/baselines/kind-liveness.json`,
  ).toEqual([]);
}

describe("kind liveness (CR audit 1.2)", () => {
  it("(a) every KNOWN_PRIMITIVE_KINDS entry is used by a card or built in src/", () => {
    shrinkOnly(deadKinds(), readBaseline().deadKinds, "dead kind(s)");
  });

  it("(b) no choice has only no-op options", () => {
    const builders = noOpChoiceBuilders();
    // Tāo Salonga's flag maySwapIceOnAgendaScoredOrStolen builds this kind
    // from src/actions/score.ts; no card JSON names it. Keep the sweep honest.
    expect(
      builders.has("src/effects/kinds/swapKinds.ts#case swap_two_ice"),
      "sweep no longer sees swap_two_ice; check the matcher before trusting it",
    ).toBe(
      readBaseline().noOpChoices.includes(
        "src/effects/kinds/swapKinds.ts#case swap_two_ice",
      ),
    );
    const found = [...builders.keys(), ...noOpCardChoices()].sort();
    const detail = [...builders]
      .map(([k, via]) => `${k} -> ${via.length ? `id dispatch ${via.join(", ")}` : "no id dispatch"}`)
      .join("\n");
    shrinkOnly(found, readBaseline().noOpChoices, `no-op choice(s)\n${detail}\n`);
  });

  it.todo(
    "(c) no card flag's consumer builds a no-op kind: needs the flag-to-kind " +
      "map in tests/baselines/card-flags.json (tool 1.10, P1-h)",
  );
});
