import { beforeAll, describe, expect, it } from "vitest";
import {
  assertCardsPinnedTag,
  assertPinnedTag,
  cardsDataPresent,
  createInitialState,
  crDataPresent,
  evalEffect,
  fx,
  instantiateCard,
} from "../src/index.js";
import { memoryLimit } from "../src/state/turn.js";
import { recomputeRunnerMaxHandSize } from "../src/state/handSize.js";
import {
  deckbuildingReport,
  installBlockReason,
  onCardRezzed,
} from "../src/state/staticFlags.js";

describe("static declarations", () => {
  beforeAll(() => {
    assertCardsPinnedTag("v1.147.9");
    assertPinnedTag("v26.03");
  });

  it("takes bad publicity when a card with that rez declaration is rezzed", () => {
    expect(cardsDataPresent() && crDataPresent()).toBe(true);
    const s = createInitialState();
    const ice = instantiateCard("bulwark", "bw-1", "server:hq:ice");
    s.cards["bw-1"] = ice;
    s.servers.hq.ice = ["bw-1"];
    ice.rezzed = true;
    onCardRezzed(s, ice);
    expect(s.corp.badPublicity).toBeGreaterThan(0);
  });

  it("empties the credit pool through lose_credits and Order of Sol gains 1", () => {
    const s = createInitialState();
    const sol = instantiateCard("order-of-sol", "sol-1", "runner:installed");
    s.cards["sol-1"] = sol;
    s.runner.installed = ["sol-1"];
    s.runner.credits = 2;
    const lost = evalEffect(
      { state: s, sourceId: "sol-1" },
      fx.do({ kind: "lose_credits", side: "runner", amount: 2 }),
    );
    expect(lost.ok).toBe(true);
    expect(s.runner.credits).toBe(1);
  });

  it("refuses a resource that needs more link than the Runner has", () => {
    const s = createInitialState();
    const card = instantiateCard("sure-gamble", "st-1", "runner:grip");
    card.installRequiresLinkGte = 2;
    s.cards["st-1"] = card;
    s.runner.link = 0;
    expect(installBlockReason(s, card)).toMatch(/link/);
  });

  it("counts agenda points toward memory and hand size when those declarations are set", () => {
    const s = createInitialState();
    const chip = instantiateCard("sure-gamble", "chip-1", "runner:installed");
    chip.type = "hardware";
    chip.muEqualsAgendaPoints = true;
    chip.handSizeEqualsAgendaPoints = true;
    s.cards["chip-1"] = chip;
    s.runner.installed = ["chip-1"];
    s.runner.scoreArea = [];
    const agenda = instantiateCard("priority-requisition", "ag-1", "runner:score");
    s.cards["ag-1"] = agenda;
    s.runner.scoreArea = ["ag-1"];
    expect(memoryLimit(s)).toBe(s.runner.memoryLimit + 3);
    recomputeRunnerMaxHandSize(s);
    expect(s.runner.maxHandSize).toBe(5 + 3);
  });

  it("reports a deck over its printed copy limit and zeroes influence when the condition holds", () => {
    const report = deckbuildingReport([
      { defId: "fifteen-minutes", deckLimit: 1, influence: 2 },
      { defId: "fifteen-minutes", deckLimit: 1, influence: 2 },
      {
        defId: "mumbad-construction-co",
        influence: 3,
        type: "asset",
        zeroInfluenceIfAssetsInDeckGte: 2,
      },
      { defId: "pad", type: "asset", influence: 0 },
    ]);
    expect(report.overLimit).toContain("fifteen-minutes");
    expect(report.influence).toBe(4);
  });
});
