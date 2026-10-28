/**
 * Blanked sources do not apply continuous run-initiate tax, advancement
 * requirement, or Corp hand-size modifiers (CR 9.12.1d).
 */
import { beforeAll, describe, expect, it } from "vitest";
import {
  additionalRunInitiateTax,
  assertCardsPinnedTag,
  assertPinnedTag,
  cardsDataPresent,
  createInitialState,
  crDataPresent,
  effectiveAdvancementRequirement,
  instantiateCard,
} from "../src/index.js";
import { discardPhase } from "../src/actions/phase.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.147.13");
});

describe("blanked run-tax / advancement / Corp hand size (CR 9.12.1d)", () => {
  it("drops Ruhr Valley run-initiate click tax while blanked", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const ruhr = instantiateCard("ruhr-valley", "rv-1", "server:hq:root");
    ruhr.rezzed = true;
    s.cards["rv-1"] = ruhr;
    s.servers.hq.root = ["rv-1"];

    expect(additionalRunInitiateTax(s, "hq").clicks).toBe(1);
    ruhr.abilitiesBlanked = true;
    expect(additionalRunInitiateTax(s, "hq").clicks).toBe(0);
  });

  it("drops Cold Site Server run-initiate tax while blanked", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const cold = instantiateCard("cold-site-server", "cs-1", "server:hq:root");
    cold.rezzed = true;
    cold.powerCounters = 2;
    s.cards["cs-1"] = cold;
    s.servers.hq.root = ["cs-1"];

    const tax = additionalRunInitiateTax(s, "hq");
    expect(tax.credits).toBe(2);
    expect(tax.clicks).toBe(2);
    cold.abilitiesBlanked = true;
    expect(additionalRunInitiateTax(s, "hq")).toEqual({ credits: 0, clicks: 0 });
  });

  it("drops SanSan City Grid advancement reduction while blanked", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const agenda = instantiateCard(
      "priority-requisition",
      "ag-1",
      "server:remote-1:root",
    );
    s.cards["ag-1"] = agenda;
    const sansan = instantiateCard(
      "sansan-city-grid",
      "ss-1",
      "server:remote-1:root",
    );
    sansan.rezzed = true;
    s.cards["ss-1"] = sansan;
    s.servers["remote-1"] = {
      id: "remote-1",
      kind: "remote",
      ice: [],
      root: ["ag-1", "ss-1"],
    };

    const printed = agenda.advancementRequirement ?? 0;
    expect(effectiveAdvancementRequirement(s, agenda)).toBe(printed - 1);
    sansan.abilitiesBlanked = true;
    expect(effectiveAdvancementRequirement(s, agenda)).toBe(printed);
  });

  it("drops The Source agenda advancement bonus while blanked", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const agenda = instantiateCard(
      "priority-requisition",
      "ag-1",
      "server:remote-1:root",
    );
    s.cards["ag-1"] = agenda;
    s.servers["remote-1"] = {
      id: "remote-1",
      kind: "remote",
      ice: [],
      root: ["ag-1"],
    };
    const source = instantiateCard("the-source", "src-1", "runner:installed");
    s.cards["src-1"] = source;
    s.runner.installed = ["src-1"];

    const printed = agenda.advancementRequirement ?? 0;
    expect(effectiveAdvancementRequirement(s, agenda)).toBe(printed + 1);
    source.abilitiesBlanked = true;
    expect(effectiveAdvancementRequirement(s, agenda)).toBe(printed);
  });

  it("drops Lewi Guilherme Corp hand-size penalty while blanked", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const lewi = instantiateCard("lewi-guilherme", "lg-1", "runner:installed");
    s.cards["lg-1"] = lewi;
    s.runner.installed = ["lg-1"];
    s.corp.maxHandSize = 5;
    s.timingKey = "corp.discard";
    const r = discardPhase(s);
    expect(r.ok).toBe(true);
    expect(s.corp.maxHandSize).toBe(4);

    let s2 = createInitialState();
    s2 = structuredClone(s2);
    const lewi2 = instantiateCard("lewi-guilherme", "lg-2", "runner:installed");
    lewi2.abilitiesBlanked = true;
    s2.cards["lg-2"] = lewi2;
    s2.runner.installed = ["lg-2"];
    s2.corp.maxHandSize = 5;
    s2.timingKey = "corp.discard";
    const r2 = discardPhase(s2);
    expect(r2.ok).toBe(true);
    expect(s2.corp.maxHandSize).toBe(5);
  });
});
