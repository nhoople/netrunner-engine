/**
 * Jeitinho heap install-on-bypass notes at 10.3.1a (CR 9.6.2), not mid-hook.
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
import { fireOnBypassTriggers } from "../src/state/iceRezHooks.js";
import { CR } from "../src/timing/labels.js";
import { suppressAbilities } from "../src/state/lingeringEffects.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.147.17");
});

describe("Jeitinho heap install on bypass (CR 9.6.2)", () => {
  it("notes and marks pending at the bypass checkpoint when Threat is met", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const jei = instantiateCard("jeitinho", "jei-1", "runner:heap");
    s.cards["jei-1"] = jei;
    s.runner.discardPile = ["jei-1"];
    s.runner.clicks = 2;
    s.runner.credits = 5;
    // Threat 3 via Corp score.
    const agenda = instantiateCard(
      "priority-requisition",
      "ag-1",
      "corp:score-area",
    );
    agenda.agendaPoints = 3;
    s.cards["ag-1"] = agenda;
    s.corp.scoreArea = ["ag-1"];

    const ice = instantiateCard("ice-wall", "ice-1", "server:hq:ice");
    ice.rezzed = true;
    s.cards["ice-1"] = ice;
    s.servers.hq.ice = ["ice-1"];

    fireOnBypassTriggers(s, "ice-1");

    // Noted → marked at 10.3.1a → mandatory choose opens pendingChoice.
    // Not a mid-hook offer: the log must show the pending mark first.
    expect(s.turn.inlineConditionalPending).toEqual([]);
    const pendingIdx = s.log.findIndex(
      (line) =>
        line.includes("Jeitinho") &&
        line.includes("becomes pending") &&
        line.includes("bypass"),
    );
    expect(pendingIdx).toBeGreaterThanOrEqual(0);
    expect(s.log.join("\n")).toContain(CR.checkpointConditionalAbilities.number);
    expect(s.pendingChoice?.sourceId).toBe("jei-1");
    expect(s.pendingChoice?.options.map((o) => o.id)).toEqual([
      "install-from-heap",
      "decline",
    ]);
  });

  it("does not note when Threat is unmet", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const jei = instantiateCard("jeitinho", "jei-1", "runner:heap");
    s.cards["jei-1"] = jei;
    s.runner.discardPile = ["jei-1"];
    s.runner.clicks = 2;
    s.runner.credits = 5;
    const ice = instantiateCard("ice-wall", "ice-1", "server:hq:ice");
    ice.rezzed = true;
    s.cards["ice-1"] = ice;

    fireOnBypassTriggers(s, "ice-1");

    expect(
      s.log.some(
        (line) => line.includes("Jeitinho") && line.includes("becomes pending"),
      ),
    ).toBe(false);
    expect(s.pendingChoice).toBeNull();
  });

  it("does not note when blanked (CR 9.12.1d)", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const jei = instantiateCard("jeitinho", "jei-1", "runner:heap");
    suppressAbilities(s, jei.id);
    s.cards["jei-1"] = jei;
    s.runner.discardPile = ["jei-1"];
    s.runner.clicks = 2;
    s.runner.credits = 5;
    const agenda = instantiateCard(
      "priority-requisition",
      "ag-1",
      "corp:score-area",
    );
    agenda.agendaPoints = 3;
    s.cards["ag-1"] = agenda;
    s.corp.scoreArea = ["ag-1"];
    expect(abilitiesSuppressed(s, "jei-1")).toBe(true);

    fireOnBypassTriggers(s, "ice-missing");

    expect(
      s.log.some(
        (line) => line.includes("Jeitinho") && line.includes("becomes pending"),
      ),
    ).toBe(false);
  });
});
