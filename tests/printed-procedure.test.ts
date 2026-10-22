/**
 * Printed instruction text uses the shared procedure.
 * "Sabotage", "Charge", and "identify the mark" require those primitives.
 * A draw instruction requires `draw` or `draw_up_to`, including a primitive
 * whose implementation calls that shared draw. "Cannot draw" is not a draw.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import {
  assertCardsPinnedTag,
  assertPinnedTag,
  cardsDataPresent,
  crDataPresent,
  loadCardCatalog,
} from "../src/index.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.147.11");
});

function walkSources(dir: string, out: string[]): void {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      if (name === "node_modules" || name.startsWith(".")) continue;
      walkSources(path, out);
      continue;
    }
    if (name.endsWith(".ts")) out.push(path);
  }
}

function caseBodies(): Map<string, string> {
  const files: string[] = [];
  walkSources(join(process.cwd(), "src"), files);
  const bodies = new Map<string, string>();
  for (const path of files) {
    const source = readFileSync(path, "utf8");
    const marks = [...source.matchAll(/case "([^"]+)":/g)];
    for (let i = 0; i < marks.length; i++) {
      const start = marks[i]!.index ?? 0;
      const end = i + 1 < marks.length ? (marks[i + 1]!.index ?? source.length) : source.length;
      const kind = marks[i]![1]!;
      bodies.set(kind, `${bodies.get(kind) ?? ""}\n${source.slice(start, end)}`);
    }
  }
  return bodies;
}

function kindsThatReach(bodies: Map<string, string>, roots: string[]): Set<string> {
  const reached = new Set(roots);
  let grew = true;
  while (grew) {
    grew = false;
    for (const [kind, body] of bodies) {
      if (reached.has(kind)) continue;
      const callsShared = [...reached].some((target) => body.includes(`kind: "${target}"`));
      const callsDrawFn =
        roots.includes("draw") &&
        (body.includes("drawCards(") ||
          body.includes("commitDraw(") ||
          body.includes("fx.draw("));
      if (!callsShared && !callsDrawFn) continue;
      reached.add(kind);
      grew = true;
    }
  }
  return reached;
}

function collectKinds(value: unknown, out: Set<string>): void {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    for (const item of value) collectKinds(item, out);
    return;
  }
  const obj = value as Record<string, unknown>;
  if (typeof obj.kind === "string") out.add(obj.kind);
  for (const child of Object.values(obj)) collectKinds(child, out);
}

function instructsDraw(text: string): boolean {
  if (/\bbottom\b/i.test(text)) return false;
  const stripped = text
    .replace(/cannot draw/gi, "")
    .replace(/decline to draw/gi, "")
    .replace(/decline draw/gi, "");
  return /\bdraw\b/i.test(stripped);
}

describe("printed instructions use the shared procedure", () => {
  it("maps Sabotage, Charge, identify the mark, and draw onto those primitives", () => {
    const bodies = caseBodies();
    const sabotage = kindsThatReach(bodies, ["sabotage"]);
    const charge = kindsThatReach(bodies, ["charge"]);
    const mark = kindsThatReach(bodies, ["identify_mark"]);
    const draw = kindsThatReach(bodies, ["draw", "draw_up_to"]);
    const failures: string[] = [];

    function check(cardId: string, text: string, effect: unknown): void {
      const found = new Set<string>();
      collectKinds(effect, found);
      const needs: Array<[string, Set<string>]> = [];
      if (/\bSabotage\b/.test(text)) needs.push(["Sabotage", sabotage]);
      if (/\bCharge\b/.test(text)) needs.push(["Charge", charge]);
      if (/identify the mark/i.test(text)) needs.push(["identify the mark", mark]);
      if (instructsDraw(text)) needs.push(["draw", draw]);
      for (const [name, allowed] of needs) {
        if ([...found].some((kind) => allowed.has(kind))) continue;
        failures.push(`${cardId}: ${name} in ${JSON.stringify(text)} uses ${[...found].join(", ") || "no primitive"}`);
      }
    }

    function visit(cardId: string, value: unknown): void {
      if (!value || typeof value !== "object") return;
      if (Array.isArray(value)) {
        for (const item of value) visit(cardId, item);
        return;
      }
      const obj = value as Record<string, unknown>;
      const text = [obj.text, obj.label].filter((item) => typeof item === "string").join(" ");
      if (text) check(cardId, text, obj.effect ?? obj.instructions ?? obj);
      for (const child of Object.values(obj)) visit(cardId, child);
    }

    for (const def of loadCardCatalog(true).values()) visit(def.id, def);
    expect(failures).toEqual([]);
  });
});
