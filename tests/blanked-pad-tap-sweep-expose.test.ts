/**
 * Blanked sources drop Pad Tap, Tech Trader, Surveillance Sweep,
 * Overseer Matrix, Net Analytics, and expose-path Zamba (CR 9.12.1d).
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
import {
  onCorpAbilityGainedCredits,
  onTagsRemoved,
  onTrashAbility,
  prepareTraceSpendOrder,
} from "../src/state/cardDeclarations.js";
import { abilitiesSuppressed } from "../src/state/abilities.js";
import { completeExpose } from "../src/state/expose.js";
import { suppressAbilities } from "../src/state/lingeringEffects.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.147.16");
});

describe("blanked Pad Tap / Sweep / expose Zamba (CR 9.12.1d)", () => {
  it("drops Pad Tap while blanked", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const pad = instantiateCard("pad-tap", "pad-1", "runner:installed");
    s.cards["pad-1"] = pad;
    s.runner.installed = ["pad-1"];
    expect(
      pad.mayGainCreditOnFirstCorpCardAbilityCreditGainEachTurn,
    ).toBe(true);

    onCorpAbilityGainedCredits(s);
    expect(s.pendingChoice?.sourceId).toBe("pad-1");

    s.pendingChoice = null;
    s.turn.padTapFiredThisTurn = false;
    suppressAbilities(s, pad.id);
    expect(abilitiesSuppressed(s, "pad-1")).toBe(true);
    onCorpAbilityGainedCredits(s);
    expect(s.pendingChoice).toBeNull();
  });

  it("drops Tech Trader trash-ability credits while blanked", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const tt = instantiateCard("tech-trader", "tt-1", "runner:installed");
    s.cards["tt-1"] = tt;
    s.runner.installed = ["tt-1"];
    s.runner.credits = 5;
    expect(tt.gainCreditOnTrashAbilityUse).toBe(true);

    onTrashAbility(s, "runner");
    expect(s.runner.credits).toBe(6);

    s.runner.credits = 5;
    suppressAbilities(s, tt.id);
    onTrashAbility(s, "runner");
    expect(s.runner.credits).toBe(5);
  });

  it("drops Surveillance Sweep runner-first while blanked", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const sweep = instantiateCard(
      "surveillance-sweep",
      "sw-1",
      "corp:play-area",
    );
    s.cards["sw-1"] = sweep;
    s.corp.playArea = ["sw-1"];
    s.run = {
      id: "run-1",
      attackedServerId: "hq",
      phase: "approach_ice",
      position: 0,
      icePassed: 0,
      successful: false,
      breached: false,
    } as typeof s.run;
    s.trace = {
      sourceId: "sw-1",
      strength: 1,
      base: 1,
      corpSpent: 0,
      runnerSpent: 0,
      link: 0,
    } as typeof s.trace;

    prepareTraceSpendOrder(s);
    expect(s.trace?.runnerSpendsFirst).toBe(true);

    s.trace!.runnerSpendsFirst = false;
    suppressAbilities(s, sweep.id);
    prepareTraceSpendOrder(s);
    expect(s.trace?.runnerSpendsFirst).toBeFalsy();
  });

  it("drops Net Analytics draw offer while blanked", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const na = instantiateCard("net-analytics", "na-1", "server:hq:root");
    na.rezzed = true;
    s.cards["na-1"] = na;
    s.servers.hq.root = ["na-1"];

    onTagsRemoved(s);
    expect(s.pendingChoice?.sourceId).toBe("na-1");

    s.pendingChoice = null;
    suppressAbilities(s, na.id);
    onTagsRemoved(s);
    expect(s.pendingChoice).toBeNull();
  });

  it("drops expose-path Zamba offer while blanked", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const z = instantiateCard("zamba", "z-1", "runner:installed");
    s.cards["z-1"] = z;
    s.runner.installed = ["z-1"];
    const ice = instantiateCard("ice-wall", "ice-1", "server:hq:ice");
    ice.rezzed = false;
    s.cards["ice-1"] = ice;
    s.servers.hq.ice = ["ice-1"];

    completeExpose(s, "ice-1");
    expect(s.pendingChoice?.sourceId).toBe("z-1");

    s.pendingChoice = null;
    suppressAbilities(s, z.id);
    completeExpose(s, "ice-1");
    expect(s.pendingChoice).toBeNull();
  });
});
