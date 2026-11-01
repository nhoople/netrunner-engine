/**
 * Blanked icebreakers lose their own static strength abilities (CR 9.12.1d).
 * Printed strength remains; blanked aura/host grants do not apply.
 */
import { beforeAll, describe, expect, it } from "vitest";
import {
  abilitiesSuppressed,
  assertCardsPinnedTag,
  assertPinnedTag,
  cardsDataPresent,
  createInitialState,
  crDataPresent,
  effectiveBreakerStrength,
  instantiateCard,
} from "../src/index.js";
import { breakerStrength } from "../src/effects/iceStrength.js";
import { suppressAbilities } from "../src/state/lingeringEffects.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.147.16");
});

describe("blanked breaker static strength (CR 9.12.1d)", () => {
  it("blanked Hyperbaric keeps printed strength and loses power-counter strength", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const hyp = instantiateCard("hyperbaric", "hyp-1", "runner:installed");
    hyp.powerCounters = 3;
    s.cards["hyp-1"] = hyp;
    s.runner.installed = ["hyp-1"];
    const printed = hyp.breaker?.strength ?? hyp.strength ?? 0;
    expect(effectiveBreakerStrength(s, "hyp-1")).toBe(printed + 3);

    suppressAbilities(s, hyp.id);
    expect(abilitiesSuppressed(s, "hyp-1")).toBe(true);
    expect(effectiveBreakerStrength(s, "hyp-1")).toBe(printed);
    expect(breakerStrength(s, "hyp-1")).toBe(printed);
  });

  it("blanked K2CP Turbine stops granting aura strength", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const corr = instantiateCard("corroder", "corr-1", "runner:installed");
    const k2 = instantiateCard("k2cp-turbine", "k2-1", "runner:installed");
    s.cards["corr-1"] = corr;
    s.cards["k2-1"] = k2;
    s.runner.installed = ["corr-1", "k2-1"];
    const withoutAura = corr.breaker?.strength ?? corr.strength ?? 0;
    const withAura = effectiveBreakerStrength(s, "corr-1");
    expect(withAura).toBeGreaterThan(withoutAura);

    suppressAbilities(s, k2.id);
    expect(abilitiesSuppressed(s, "k2-1")).toBe(true);
    expect(effectiveBreakerStrength(s, "corr-1")).toBe(withoutAura);
  });

  it("blanked Personal Touch stops granting host strength", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const corr = instantiateCard("corroder", "corr-1", "runner:installed");
    const touch = instantiateCard(
      "the-personal-touch",
      "tpt-1",
      "runner:installed",
    );
    touch.hostId = "corr-1";
    s.cards["corr-1"] = corr;
    s.cards["tpt-1"] = touch;
    s.runner.installed = ["corr-1", "tpt-1"];
    const printed = corr.breaker?.strength ?? corr.strength ?? 0;
    expect(effectiveBreakerStrength(s, "corr-1")).toBe(
      printed + (touch.hostIcebreakerStrengthBonus ?? 0),
    );

    suppressAbilities(s, touch.id);
    expect(abilitiesSuppressed(s, "tpt-1")).toBe(true);
    expect(effectiveBreakerStrength(s, "corr-1")).toBe(printed);
  });
});
