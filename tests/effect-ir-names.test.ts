/**
 * Kind names name the procedure. Existing card-titled kinds are grandfathered
 * in effect-ir-legacy-names.json. A new kind has to pass
 * primitiveNameFollowsStandard.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { KNOWN_PRIMITIVE_KINDS, validateEffectTree } from "../src/effects/ir.js";
import { primitiveNameFollowsStandard } from "../src/effects/primitiveNames.js";

const legacy = JSON.parse(
  readFileSync(new URL("./effect-ir-legacy-names.json", import.meta.url), "utf8"),
) as string[];

describe("effect IR names", () => {
  it("keeps every kind snake_case", () => {
    for (const kind of KNOWN_PRIMITIVE_KINDS) {
      expect(kind, kind).toMatch(/^[a-z][a-z0-9]*(_[a-z0-9]+)*$/);
    }
  });

  it("grandfathers only the recorded names that skip the procedure-verb rule", () => {
    const actual = [...KNOWN_PRIMITIVE_KINDS]
      .filter((kind) => !primitiveNameFollowsStandard(kind))
      .sort();
    expect(actual).toEqual(legacy);
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
