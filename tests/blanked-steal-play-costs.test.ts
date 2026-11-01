/**
 * Blanked sources do not apply continuous steal-cost or event/operation
 * play-cost modifiers (CR 9.12.1d).
 */
import { beforeAll, describe, expect, it } from "vitest";
import {
  assertCardsPinnedTag,
  assertPinnedTag,
  cardsDataPresent,
  createInitialState,
  crDataPresent,
  effectiveEventPlayCost,
  instantiateCard,
  operationAndEventPlayCostIncreaseTotal,
} from "../src/index.js";
import { stealAdditionalCreditsForAgenda } from "../src/actions/access.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.147.16");
});

describe("blanked steal and play costs (CR 9.12.1d)", () => {
  it("drops Red Herrings protecting-server steal tax while blanked", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const agenda = instantiateCard(
      "priority-requisition",
      "ag-1",
      "server:remote-1:root",
    );
    s.cards["ag-1"] = agenda;
    const rh = instantiateCard("red-herrings", "rh-1", "server:remote-1:root");
    rh.rezzed = true;
    s.cards["rh-1"] = rh;
    s.servers["remote-1"] = {
      id: "remote-1",
      kind: "remote",
      ice: [],
      root: ["ag-1", "rh-1"],
    };

    expect(stealAdditionalCreditsForAgenda(s, "ag-1", "remote-1")).toBeGreaterThan(
      0,
    );
    rh.abilitiesBlanked = true;
    expect(stealAdditionalCreditsForAgenda(s, "ag-1", "remote-1")).toBe(0);
  });

  it("drops The Source steal tax while blanked", () => {
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

    expect(stealAdditionalCreditsForAgenda(s, "ag-1", "remote-1")).toBe(3);
    source.abilitiesBlanked = true;
    expect(stealAdditionalCreditsForAgenda(s, "ag-1", "remote-1")).toBe(0);
  });

  it("drops Predictive Algorithm steal tax while blanked", () => {
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
    const pred = instantiateCard(
      "predictive-algorithm",
      "pa-1",
      "corp:play-area",
    );
    s.cards["pa-1"] = pred;

    expect(stealAdditionalCreditsForAgenda(s, "ag-1", "remote-1")).toBeGreaterThan(
      0,
    );
    pred.abilitiesBlanked = true;
    expect(stealAdditionalCreditsForAgenda(s, "ag-1", "remote-1")).toBe(0);
  });

  it("drops Ghosttongue event play discount while blanked", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const ghost = instantiateCard("ghosttongue", "gt-1", "runner:installed");
    s.cards["gt-1"] = ghost;
    s.runner.installed = ["gt-1"];
    const event = instantiateCard("sure-gamble", "sg-1", "runner:hand");
    s.cards["sg-1"] = event;

    const printed = event.playCost ?? 0;
    expect(effectiveEventPlayCost(s, printed, event)).toBeLessThan(printed);
    ghost.abilitiesBlanked = true;
    expect(effectiveEventPlayCost(s, printed, event)).toBe(printed);
  });

  it("drops Rolling Brownout play-cost increase while blanked", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const rb = instantiateCard("rolling-brownout", "rb-1", "corp:play-area");
    s.cards["rb-1"] = rb;

    expect(operationAndEventPlayCostIncreaseTotal(s)).toBeGreaterThan(0);
    rb.abilitiesBlanked = true;
    expect(operationAndEventPlayCostIncreaseTotal(s)).toBe(0);
  });
});
