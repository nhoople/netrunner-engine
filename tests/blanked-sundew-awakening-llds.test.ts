/**
 * Blanked sources do not fire Sundew click/refund helpers, Awakening Center
 * host installs, or LLDS / Cybertrooper install strength bonuses (CR 9.12.1d).
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
import { abilitiesSuppressed } from "../src/state/abilities.js";
import { noteRunnerClickSpend } from "../src/state/clickHooks.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.147.15");
});

describe("blanked Sundew / Awakening / LLDS (CR 9.12.1d)", () => {
  it("drops Sundew first-click gain while blanked", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const sundew = instantiateCard("sundew", "sd-1", "server:hq:root");
    sundew.rezzed = true;
    s.cards["sd-1"] = sundew;
    s.servers.hq.root = ["sd-1"];
    s.corp.credits = 5;
    s.turn.sundewFirstClickSpendFiredThisTurn = false;

    noteRunnerClickSpend(s);
    expect(s.corp.credits).toBeGreaterThan(5);

    // Reset for blanked pass.
    s.corp.credits = 5;
    s.turn.sundewFirstClickSpendFiredThisTurn = false;
    sundew.abilitiesBlanked = true;
    noteRunnerClickSpend(s);
    expect(s.corp.credits).toBe(5);
  });

  it("treats Awakening Center host ability as suppressed while blanked", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const ac = instantiateCard("awakening-center", "ac-1", "server:hq:root");
    ac.rezzed = true;
    s.cards["ac-1"] = ac;
    s.servers.hq.root = ["ac-1"];
    expect(ac.hostsBioroidIceIgnoreInstallCost).toBe(true);
    expect(abilitiesSuppressed(s, "ac-1")).toBe(false);
    ac.abilitiesBlanked = true;
    expect(abilitiesSuppressed(s, "ac-1")).toBe(true);
  });

  it("treats LLDS Processor install strength as suppressed while blanked", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const llds = instantiateCard("llds-processor", "llds-1", "runner:installed");
    s.cards["llds-1"] = llds;
    s.runner.installed = ["llds-1"];
    expect(llds.nonAiIcebreakerInstallStrengthBonusThisTurn ?? 0).toBeGreaterThan(
      0,
    );
    expect(abilitiesSuppressed(s, "llds-1")).toBe(false);
    llds.abilitiesBlanked = true;
    expect(abilitiesSuppressed(s, "llds-1")).toBe(true);
  });

  it("treats Cybertrooper Talut install strength as suppressed while blanked", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const talut = instantiateCard(
      "cybertrooper-talut",
      "ct-1",
      "runner:installed",
    );
    s.cards["ct-1"] = talut;
    s.runner.installed = ["ct-1"];
    expect(
      talut.nonAiIcebreakerInstallStrengthBonusThisTurn ?? 0,
    ).toBeGreaterThan(0);
    talut.abilitiesBlanked = true;
    expect(abilitiesSuppressed(s, "ct-1")).toBe(true);
  });
});
