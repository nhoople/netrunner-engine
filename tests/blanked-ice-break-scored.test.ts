/**
 * Blanked sources do not apply ice break locks, scored continuous
 * modifiers, or Genetics Pavilion draw caps (CR 9.12.1d).
 */
import { beforeAll, describe, expect, it } from "vitest";
import {
  assertCardsPinnedTag,
  assertPinnedTag,
  cardsDataPresent,
  createInitialState,
  crDataPresent,
  iceBlocksAiBreak,
  iceBreakExceptSubtype,
  instantiateCard,
} from "../src/index.js";
import { scoredAgendaMeatDamageIncrease } from "../src/state/breakerMods.js";
import { geneticsPavilionDrawLimit } from "../src/state/staticFlags.js";
import { startTrace, spendLink } from "../src/state/trace.js";
import { fx } from "../src/effects/ir.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.147.15");
});

describe("blanked ice break / scored / pavilion (CR 9.12.1d)", () => {
  it("drops Turing AI break lock while blanked", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const ice = instantiateCard("turing", "tu-1", "server:hq:ice");
    ice.rezzed = true;
    s.cards["tu-1"] = ice;
    s.servers.hq.ice = ["tu-1"];

    expect(iceBlocksAiBreak(s, "tu-1")).toBe(true);
    ice.abilitiesBlanked = true;
    expect(iceBlocksAiBreak(s, "tu-1")).toBe(false);
  });

  it("drops Hortum AI-at-advancements lock while blanked", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const ice = instantiateCard("hortum", "ho-1", "server:hq:ice");
    ice.rezzed = true;
    ice.advancementCounters = 3;
    s.cards["ho-1"] = ice;
    s.servers.hq.ice = ["ho-1"];

    expect(iceBlocksAiBreak(s, "ho-1")).toBe(true);
    ice.abilitiesBlanked = true;
    expect(iceBlocksAiBreak(s, "ho-1")).toBe(false);
  });

  it("drops Semak subtype-only break restriction while blanked", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const ice = instantiateCard("semak-samun", "ss-1", "server:hq:ice");
    ice.rezzed = true;
    s.cards["ss-1"] = ice;
    s.servers.hq.ice = ["ss-1"];

    expect(iceBreakExceptSubtype(s, "ss-1")).toBeTruthy();
    ice.abilitiesBlanked = true;
    expect(iceBreakExceptSubtype(s, "ss-1")).toBeUndefined();
  });

  it("drops The Cleaners meat-damage increase while blanked", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const cleaners = instantiateCard(
      "the-cleaners",
      "tc-1",
      "corp:score-area",
    );
    s.cards["tc-1"] = cleaners;
    s.corp.scoreArea = ["tc-1"];

    expect(scoredAgendaMeatDamageIncrease(s)).toBeGreaterThan(0);
    cleaners.abilitiesBlanked = true;
    expect(scoredAgendaMeatDamageIncrease(s)).toBe(0);
  });

  it("drops Net Quarantine link-as-0 and link-spend credits while blanked", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const nq = instantiateCard("net-quarantine", "nq-1", "corp:score-area");
    s.cards["nq-1"] = nq;
    s.corp.scoreArea = ["nq-1"];
    s.runner.link = 2;
    s.runner.credits = 10;
    s.corp.credits = 0;

    startTrace(s, "nq-1", 0, fx.do({ kind: "gain_credits", side: "corp", amount: 0 }));
    expect(s.trace?.netQuarantineLinkZero).toBe(true);

    const blanked = structuredClone(createInitialState());
    const nq2 = instantiateCard("net-quarantine", "nq-1", "corp:score-area");
    nq2.abilitiesBlanked = true;
    blanked.cards["nq-1"] = nq2;
    blanked.corp.scoreArea = ["nq-1"];
    blanked.runner.link = 2;
    blanked.runner.credits = 10;
    blanked.corp.credits = 0;
    blanked.turn.netQuarantineFirstTraceUsedThisTurn = false;
    startTrace(
      blanked,
      "nq-1",
      0,
      fx.do({ kind: "gain_credits", side: "corp", amount: 0 }),
    );
    expect(blanked.trace?.netQuarantineLinkZero).toBeFalsy();

    // Link-spend Corp gain.
    s.trace = {
      id: "t1",
      sourceId: "nq-1",
      baseStrength: 0,
      corpSpent: 0,
      runnerLinkSpent: 0,
      onSuccess: fx.do({ kind: "gain_credits", side: "corp", amount: 0 }),
    };
    nq.abilitiesBlanked = false;
    const before = s.corp.credits;
    spendLink(s, 4);
    expect(s.corp.credits).toBe(before + 2);

    nq.abilitiesBlanked = true;
    s.corp.credits = before;
    s.runner.credits = 10;
    s.trace.runnerLinkSpent = 0;
    spendLink(s, 4);
    expect(s.corp.credits).toBe(before);
  });

  it("drops Genetics Pavilion draw cap while blanked", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const gp = instantiateCard(
      "genetics-pavilion",
      "gp-1",
      "server:remote-1:root",
    );
    gp.rezzed = true;
    s.cards["gp-1"] = gp;
    s.servers["remote-1"] = {
      id: "remote-1",
      kind: "remote",
      root: ["gp-1"],
      ice: [],
    };

    expect(geneticsPavilionDrawLimit(s)).toBeGreaterThan(0);
    gp.abilitiesBlanked = true;
    expect(geneticsPavilionDrawLimit(s)).toBeUndefined();
  });

  it("drops Power Tap trace-init credits while blanked", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const tap = instantiateCard("power-tap", "pt-1", "runner:installed");
    s.cards["pt-1"] = tap;
    s.runner.installed = ["pt-1"];
    const before = s.runner.credits;
    startTrace(s, "corp", 0, fx.do({ kind: "gain_credits", side: "corp", amount: 0 }));
    expect(s.runner.credits).toBeGreaterThan(before);

    const blanked = structuredClone(createInitialState());
    const tap2 = instantiateCard("power-tap", "pt-1", "runner:installed");
    tap2.abilitiesBlanked = true;
    blanked.cards["pt-1"] = tap2;
    blanked.runner.installed = ["pt-1"];
    const beforeBlank = blanked.runner.credits;
    startTrace(
      blanked,
      "corp",
      0,
      fx.do({ kind: "gain_credits", side: "corp", amount: 0 }),
    );
    expect(blanked.runner.credits).toBe(beforeBlank);
  });
});
