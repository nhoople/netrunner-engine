/**
 * Blanked Baba Yaga does not gain hosted icebreaker paid abilities
 * (CR 9.12.1d).
 */
import { beforeAll, describe, expect, it } from "vitest";
import {
  assertCardsPinnedTag,
  assertPinnedTag,
  cardsDataPresent,
  createInitialState,
  crDataPresent,
  instantiateCard,
} from "../src/index.js";
import { usePaidAbility } from "../src/actions/paidAbility.js";
import { abilitiesSuppressed } from "../src/state/abilities.js";
import { paidAbilitiesIncludingHosted } from "../src/state/cardDeclarations.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.147.14");
});

describe("blanked paid-ability gain (CR 9.12.1d)", () => {
  it("drops Baba Yaga hosted icebreaker grants while blanked", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const baba = instantiateCard("baba-yaga", "baba-1", "runner:installed");
    const blade = instantiateCard("gordian-blade", "gb-1", "runner:installed");
    blade.hostId = "baba-1";
    baba.hostedCardIds = ["gb-1"];
    s.cards["baba-1"] = baba;
    s.cards["gb-1"] = blade;
    s.runner.installed = ["baba-1", "gb-1"];
    s.runner.credits = 10;

    const hostedIds = paidAbilitiesIncludingHosted(s, baba).map((a) => a.id);
    expect(hostedIds).toContain("gordian-pump");

    baba.abilitiesBlanked = true;
    expect(abilitiesSuppressed(s, "baba-1")).toBe(true);
    expect(paidAbilitiesIncludingHosted(s, baba).map((a) => a.id)).not.toContain(
      "gordian-pump",
    );
    const refused = usePaidAbility(s, "baba-1", "gordian-pump");
    expect(refused.ok).toBe(false);
  });
});
