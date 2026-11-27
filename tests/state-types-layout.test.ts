/**
 * Where a `CardInstance` field goes (repository layout plan, slice E2).
 *
 * `CardInstance` (`src/state/types/card.ts`) extends two interfaces, each in its
 * own file, so that no file passes the 2,000-line limit:
 *   - `CardTriggerHooks` (`cardHooks.ts`): every field named `on<Event>`;
 *   - `CardCostsAndRequirements` (`cardCosts.ts`): every other field whose name
 *     says Cost, Discount or Requires.
 * Every other field stays on `CardInstance`. This test fails on a field in the
 * wrong one, so a new field goes where the rule says.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const DIR = join(import.meta.dirname, "..", "src/state/types");

const isHook = (name: string): boolean => /^on[A-Z]/.test(name);
const isCost = (name: string): boolean =>
  !isHook(name) && /Cost|Discount|Requires/.test(name);

function fields(file: string, name: string): string[] {
  const path = join(DIR, file);
  const sf = ts.createSourceFile(
    path,
    readFileSync(path, "utf8"),
    ts.ScriptTarget.Latest,
    true,
  );
  const decl = sf.statements.find(
    (s): s is ts.InterfaceDeclaration =>
      ts.isInterfaceDeclaration(s) && s.name.text === name,
  );
  if (!decl) throw new Error(`interface ${name} not found in ${file}`);
  return decl.members.flatMap((m) =>
    m.name && ts.isIdentifier(m.name) ? [m.name.text] : [],
  );
}

describe("CardInstance fields sit in the part their name says", () => {
  it("every on<Event> field is a trigger hook, in cardHooks.ts", () => {
    const hooks = fields("cardHooks.ts", "CardTriggerHooks");
    expect(hooks.length).toBeGreaterThan(0);
    expect(hooks.filter((n) => !isHook(n))).toEqual([]);
  });

  it("every Cost, Discount or Requires field is in cardCosts.ts", () => {
    const costs = fields("cardCosts.ts", "CardCostsAndRequirements");
    expect(costs.length).toBeGreaterThan(0);
    expect(costs.filter((n) => !isCost(n))).toEqual([]);
  });

  it("CardInstance itself keeps only the other fields", () => {
    const rest = fields("card.ts", "CardInstance");
    expect(rest.filter((n) => isHook(n) || isCost(n))).toEqual([]);
  });
});
