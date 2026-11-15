/**
 * Kind names name the procedure (CLAUDE.md "Effect IR names"). Existing names
 * that break the rule are grandfathered in effect-ir-legacy-names.json; the
 * list may only shrink.
 *
 * Two rules, both over every kind in KNOWN_PRIMITIVE_KINDS:
 *   - the procedure-verb rule (primitiveNameFollowsStandard);
 *   - for engine-built kinds (no card JSON names them: continuations, flag
 *     readers, `_resolve`/`_pick`/`_continue` follow-ups), no card title in
 *     the name. The title goes in the comment on the primitive. Card JSON
 *     kinds are renamed in the paired cards releases instead (CR audit
 *     Phase 2, guard 3).
 * A kind the engine builds has to be registered, so it can't escape these
 * rules through a cast.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import { beforeAll, describe, expect, it } from "vitest";
import {
  assertCardsPinnedTag,
  assertPinnedTag,
  cardsDataPresent,
  crDataPresent,
} from "../src/index.js";
import { KNOWN_PRIMITIVE_KINDS, validateEffectTree } from "../src/effects/ir.js";
import { primitiveNameFollowsStandard } from "../src/effects/primitiveNames.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.147.24");
});

const ROOT = process.cwd();

const legacy = JSON.parse(
  readFileSync(new URL("./effect-ir-legacy-names.json", import.meta.url), "utf8"),
) as string[];

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

/** Kinds card JSON names, and the multi-word card titles as snake_case. */
function catalog(): { cardKinds: Set<string>; titles: string[] } {
  const cardKinds = new Set<string>();
  const titles = new Set<string>();
  for (const side of ["corp", "runner"]) {
    for (const file of walk(join(ROOT, "vendor/cards-data", side), ".json")) {
      const card = JSON.parse(readFileSync(file, "utf8")) as { title?: unknown };
      collectKinds(card, cardKinds);
      if (typeof card.title !== "string") continue;
      const slug = card.title
        .split(":")[0]!
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_|_$/g, "");
      // One-word titles (Hush, Inject, Trace…) are ordinary words; skip them.
      if (slug.includes("_")) titles.add(slug);
    }
  }
  return { cardKinds, titles: [...titles] };
}

let titledCache: string[] | undefined;

/** Engine-built kinds that contain a multi-word card title. Memoized: the scan is kinds × titles. */
function titledEngineKinds(): string[] {
  if (titledCache) return titledCache;
  const { cardKinds, titles } = catalog();
  const needles = titles.map((t) => `_${t}_`);
  titledCache = [...KNOWN_PRIMITIVE_KINDS]
    .filter((k) => !cardKinds.has(k))
    .filter((k) => {
      const hay = `_${k}_`;
      return needles.some((n) => hay.includes(n));
    })
    .sort();
  return titledCache;
}

/** String kinds src/ builds as an effect action: `fx.do({ kind })`, `action: { kind }`. */
function engineBuiltKinds(): Map<string, string> {
  const out = new Map<string, string>();
  const strip = (e: ts.Expression): ts.Expression => {
    while (ts.isAsExpression(e) || ts.isParenthesizedExpression(e) || ts.isSatisfiesExpression(e)) {
      e = e.expression;
    }
    return e;
  };
  const kindsOf = (lit: ts.Expression, file: string): void => {
    const o = strip(lit);
    if (!ts.isObjectLiteralExpression(o)) return;
    for (const p of o.properties) {
      if (!ts.isPropertyAssignment(p) || p.name.getText() !== "kind") continue;
      const v = strip(p.initializer);
      const values = ts.isConditionalExpression(v) ? [v.whenTrue, v.whenFalse].map(strip) : [v];
      for (const x of values) if (ts.isStringLiteralLike(x)) out.set(x.text, file);
    }
  };
  for (const path of walk(join(ROOT, "src"), ".ts")) {
    const file = path.slice(ROOT.length + 1);
    const sf = ts.createSourceFile(path, readFileSync(path, "utf8"), ts.ScriptTarget.Latest, true);
    const visit = (n: ts.Node): void => {
      if (
        ts.isCallExpression(n) &&
        ts.isPropertyAccessExpression(n.expression) &&
        n.expression.name.text === "do" &&
        ts.isIdentifier(n.expression.expression) &&
        n.expression.expression.text === "fx" &&
        n.arguments[0]
      ) {
        kindsOf(n.arguments[0], file);
      }
      if (ts.isPropertyAssignment(n) && n.name.getText() === "action") kindsOf(n.initializer, file);
      ts.forEachChild(n, visit);
    };
    visit(sf);
  }
  return out;
}

describe("effect IR names", () => {
  it("keeps every kind snake_case", () => {
    for (const kind of KNOWN_PRIMITIVE_KINDS) {
      expect(kind, kind).toMatch(/^[a-z][a-z0-9]*(_[a-z0-9]+)*$/);
    }
  });

  it("every kind src/ builds as an action is registered (so the name rules see it)", () => {
    const built = engineBuiltKinds();
    expect(built.size).toBeGreaterThan(500);
    expect(
      [...built].filter(([k]) => !KNOWN_PRIMITIVE_KINDS.has(k)).map(([k, f]) => `${f}: ${k}`),
    ).toEqual([]);
  });

  it("sees engine-built kinds that carry a card title", () => {
    const titled = titledEngineKinds();
    // Raman Rai's follow-up passes the verb rule but names the card.
    expect(titled).toContain("swap_raman_rai_resolve");
    expect(primitiveNameFollowsStandard("swap_raman_rai_resolve")).toBe(true);
    // A card kind is not an engine-built one.
    expect(titled.every((k) => !catalog().cardKinds.has(k))).toBe(true);
  }, 60_000);

  it("grandfathers only the recorded names that skip the verb rule or name a card", () => {
    expect(legacy, "legacy list must stay sorted").toEqual([...legacy].sort());
    const actual = [
      ...new Set([
        ...[...KNOWN_PRIMITIVE_KINDS].filter((kind) => !primitiveNameFollowsStandard(kind)),
        ...titledEngineKinds(),
      ]),
    ].sort();
    const added = actual.filter((k) => !legacy.includes(k));
    const gone = legacy.filter((k) => !actual.includes(k));
    expect(
      added,
      "new kind name(s) that skip the procedure verb or carry a card title: rename " +
        "(verb then object; the card title goes in the comment)",
    ).toEqual([]);
    expect(gone, "renamed or removed: drop from tests/effect-ir-legacy-names.json").toEqual([]);
  });

  it("rejects a pack-code kind that is no longer in the catalog", () => {
    expect(primitiveNameFollowsStandard("break_first_subroutine")).toBe(true);
    expect(
      validateEffectTree({
        op: "do",
        action: { kind: "dtwn_break_first_subroutine" },
      }),
    ).not.toBeNull();
  });

  it("rejects a new pack-code prefix", () => {
    expect(primitiveNameFollowsStandard("dtwn_new_procedure")).toBe(false);
    expect(legacy).not.toContain("dtwn_new_procedure");
  });
});
