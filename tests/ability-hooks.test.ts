/**
 * Every ability hook the catalog writes must be read by a procedure.
 * A field that exists only on the card JSON and in the loader never fires.
 *
 * Only engine code counts as a reader: not tests (a test can set a field
 * nothing reads), not comments, and not a top-level declaration tagged
 * `@public`. That tag keeps an unused export past knip, so a field read only
 * there is still dead.
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
  triggerToHook,
} from "../src/index.js";
import { RESTRICTION_FIELDS } from "../src/effects/abilityRecord.js";
import type { AbilityRecord } from "../src/effects/abilityRecord.js";

const WRITERS = new Set(["abilityRecord.ts", "load.ts", "types.ts"]);

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.147.26");
});

function walk(dir: string, out: string[]): void {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      walk(path, out);
      continue;
    }
    if (!name.endsWith(".ts") && !name.endsWith(".tsx")) continue;
    if (WRITERS.has(name)) continue;
    out.push(path);
  }
}

/** A JSDoc block tagged `@public` and the top-level declaration after it. */
const PUBLIC_DECLARATION =
  /\/\*\*(?:(?!\*\/)[\s\S])*?@public[\s\S]*?\*\/\s*export [\s\S]*?\n\}\n/g;
const COMMENT = /\/\*[\s\S]*?\*\/|\/\/[^\n]*/g;

/** Engine source with `@public` declarations and comments removed. */
function readerCode(source: string): string {
  return source.replace(PUBLIC_DECLARATION, "").replace(COMMENT, "");
}

function readerText(): string {
  const files: string[] = [];
  walk(join(process.cwd(), "src"), files);
  return files.map((path) => readerCode(readFileSync(path, "utf8"))).join("\n");
}

function note(
  hooks: Map<string, string[]>,
  hook: string,
  cardId: string,
): void {
  const ids = hooks.get(hook) ?? [];
  if (ids.length < 3) ids.push(cardId);
  hooks.set(hook, ids);
}

describe("ability hooks are read by a procedure", () => {
  it("does not count a @public declaration or a comment as a reader", () => {
    const source = [
      "/**",
      " * Kept for knip.",
      " *",
      " * @public",
      " */",
      "export function deadReader(state: GameState): boolean {",
      "  return Boolean(state.cards.x?.deadFlag);",
      "}",
      "// liveFlag is mentioned only here",
      "export function liveReader(state: GameState): boolean {",
      "  return Boolean(state.cards.x?.otherFlag);",
      "}",
      "",
    ].join("\n");
    const code = readerCode(source);
    expect(code).not.toMatch(/\bdeadFlag\b/);
    expect(code).not.toMatch(/\bliveFlag\b/);
    expect(code).toMatch(/\botherFlag\b/);
  });

  it("every catalog hook appears outside the loader", () => {
    const catalog = loadCardCatalog(true);
    const hooks = new Map<string, string[]>();
    for (const def of catalog.values()) {
      const abilities = def.abilities as AbilityRecord[] | undefined;
      if (!abilities) continue;
      for (const record of abilities) {
        if (record.class === "play") note(hooks, "onPlay", def.id);
        if (
          record.class === "conditional" &&
          record.trigger &&
          record.trigger !== "first_net_damage_this_run_on_server"
        ) {
          note(hooks, triggerToHook(record.trigger), def.id);
        }
        if (record.class === "static" && record.declaration) {
          note(hooks, record.declaration.field, def.id);
        }
        for (const restriction of record.restrictions ?? []) {
          note(hooks, RESTRICTION_FIELDS[restriction.appliesTo], def.id);
        }
      }
    }

    const readers = readerText();
    const dead: string[] = [];
    for (const [hook, ids] of [...hooks.entries()].sort(([a], [b]) =>
      a.localeCompare(b),
    )) {
      const pattern = new RegExp(`\\b${hook}\\b`);
      if (pattern.test(readers)) continue;
      dead.push(`${hook} (${ids.join(", ")})`);
    }
    expect(dead).toEqual([]);
  });
});
