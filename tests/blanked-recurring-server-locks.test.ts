/**
 * Blanked sources do not refill recurring credits or apply server locks /
 * grip-reveal / Kessleroid trash locks (CR 9.12.1d).
 */
import { beforeAll, describe, expect, it } from "vitest";
import {
  assertCardsPinnedTag,
  assertPinnedTag,
  cardsDataPresent,
  createInitialState,
  crDataPresent,
  instantiateCard,
  refillRecurringCredits,
} from "../src/index.js";
import {
  consideredAdvancement,
  gripRevealed,
  runnerCannotTrashWhileRezzed,
  virusCountersAvailable,
} from "../src/state/cardDeclarations.js";
import { offTheGridBlocksServer } from "../src/state/runLegality.js";
import type { ServerId } from "../src/index.js";
import { suppressAbilities } from "../src/state/lingeringEffects.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.147.18");
});

describe("blanked recurring / server locks (CR 9.12.1d)", () => {
  it("skips recurring refill while blanked", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const cf = instantiateCard("cyberfeeder", "cf-1", "runner:installed");
    s.cards["cf-1"] = cf;
    s.runner.installed = ["cf-1"];
    cf.recurringCredits = 0;

    refillRecurringCredits(s, "runner");
    expect(cf.recurringCredits).toBeGreaterThan(0);

    cf.recurringCredits = 0;
    suppressAbilities(s, cf.id);
    refillRecurringCredits(s, "runner");
    expect(cf.recurringCredits).toBe(0);
  });

  it("drops Satellite Grid considered advancement while blanked", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const ice = instantiateCard("ice-wall", "iw-1", "server:hq:ice");
    ice.rezzed = true;
    ice.advancementCounters = 1;
    s.cards["iw-1"] = ice;
    s.servers.hq.ice = ["iw-1"];
    const sat = instantiateCard("satellite-grid", "sg-1", "server:hq:root");
    sat.rezzed = true;
    s.cards["sg-1"] = sat;
    s.servers.hq.root = ["sg-1"];

    expect(consideredAdvancement(s, ice)).toBeGreaterThan(1);
    suppressAbilities(s, sat.id);
    expect(consideredAdvancement(s, ice)).toBe(1);
  });

  it("drops Off the Grid run block while blanked", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const otg = instantiateCard("off-the-grid", "otg-1", "server:remote-1:root");
    otg.rezzed = true;
    s.cards["otg-1"] = otg;
    s.servers["remote-1"] = {
      id: "remote-1" as ServerId,
      kind: "remote",
      root: ["otg-1"],
      ice: [],
    };

    expect(offTheGridBlocksServer(s, "remote-1" as ServerId)).toBe(true);
    suppressAbilities(s, otg.id);
    expect(offTheGridBlocksServer(s, "remote-1" as ServerId)).toBe(false);
  });

  it("drops Harishchandra grip reveal while blanked", () => {
    let s = createInitialState();
    s = structuredClone(s);
    s.runner.tags = 1;
    const id = s.cards[s.corp.identityId];
    // Fixture the continuous field on the Corp identity.
    id.revealGripWhileRunnerTagged = true;

    expect(gripRevealed(s)).toBe(true);
    // abilitiesBlanked on identity is enough for the suppress check.
    suppressAbilities(s, id.id);
    expect(gripRevealed(s)).toBe(false);
  });

  it("drops Kessleroid trash lock while blanked", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const k = instantiateCard("kessleroid", "k-1", "server:hq:root");
    k.rezzed = true;
    s.cards["k-1"] = k;
    s.servers.hq.root = ["k-1"];

    expect(runnerCannotTrashWhileRezzed(s, "k-1")).toBe(true);
    suppressAbilities(s, k.id);
    expect(runnerCannotTrashWhileRezzed(s, "k-1")).toBe(false);
  });

  it("drops Hivemind virus sharing while blanked", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const virus = instantiateCard("datasucker", "ds-1", "runner:installed");
    virus.virusCounters = 1;
    const hive = instantiateCard("hivemind", "hm-1", "runner:installed");
    hive.virusCounters = 3;
    s.cards["ds-1"] = virus;
    s.cards["hm-1"] = hive;
    s.runner.installed = ["ds-1", "hm-1"];

    expect(virusCountersAvailable(s, virus)).toBe(4);
    suppressAbilities(s, hive.id);
    expect(virusCountersAvailable(s, virus)).toBe(1);
  });
});
