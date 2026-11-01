/**
 * Blanked sources do not contribute psi hosted-credit spend, first-tag
 * prevent, tagged self-trash, or double-event cost ignore (CR 9.12.1d).
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
import { canPayTakeTagsNestedCost } from "../src/effects/tagPrimitives.js";
import { runnerPsiSpendable } from "../src/state/psi.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.147.16");
});

describe("blanked psi / tag / starlight helpers (CR 9.12.1d)", () => {
  it("drops Ghost Runner from psi spendable while blanked", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const ghost = instantiateCard("ghost-runner", "gh-1", "runner:installed");
    ghost.hostedCredits = 3;
    s.cards["gh-1"] = ghost;
    s.runner.installed = ["gh-1"];
    s.runner.credits = 0;
    s.run = {
      id: "run-1",
      attackedServerId: "hq",
      phase: "approach_ice",
      position: 0,
      successful: false,
      ended: false,
    };

    expect(runnerPsiSpendable(s)).toBe(3);
    ghost.abilitiesBlanked = true;
    expect(runnerPsiSpendable(s)).toBe(0);
  });

  it("drops Jesminder first-tag prevent while blanked", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const id = instantiateCard(
      "jesminder-sareen-girl-behind-the-curtain",
      "jes-id",
      "runner:identity",
    );
    s.cards["jes-id"] = id;
    s.runner.identityId = "jes-id";
    s.run = {
      id: "run-1",
      attackedServerId: "hq",
      phase: "encounter_ice",
      position: 0,
      successful: false,
      ended: false,
    };
    s.turn.tagsGivenThisTurn = 0;

    // Prevent makes a nested 1-tag cost unpayable while a run is active.
    expect(canPayTakeTagsNestedCost(s, 1)).toBe(false);
    id.abilitiesBlanked = true;
    expect(canPayTakeTagsNestedCost(s, 1)).toBe(true);
  });

  it("treats Zona Sul trash-when-tagged as suppressed while blanked", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const zona = instantiateCard("zona-sul-shipping", "zs-1", "runner:installed");
    s.cards["zs-1"] = zona;
    s.runner.installed = ["zs-1"];
    expect(zona.trashSelfWhenRunnerTagged).toBe(true);
    expect(abilitiesSuppressed(s, "zs-1")).toBe(false);
    zona.abilitiesBlanked = true;
    expect(abilitiesSuppressed(s, "zs-1")).toBe(true);
  });

  it("treats Starlight Crusade Funding double-event ignore as suppressed while blanked", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const host = instantiateCard(
      "starlight-crusade-funding",
      "sl-1",
      "runner:installed",
    );
    s.cards["sl-1"] = host;
    s.runner.installed = ["sl-1"];
    expect(host.ignoreAdditionalCostFirstDoubleEventEachTurn).toBe(true);
    expect(abilitiesSuppressed(s, "sl-1")).toBe(false);
    host.abilitiesBlanked = true;
    expect(abilitiesSuppressed(s, "sl-1")).toBe(true);
  });
});
