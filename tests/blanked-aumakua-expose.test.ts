/**
 * Blanked sources drop Aumakua virus placement on expose (CR 9.12.1d).
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
import { completeExpose } from "../src/state/expose.js";
import { suppressAbilities } from "../src/state/lingeringEffects.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.147.16");
});

describe("blanked Aumakua expose (CR 9.12.1d)", () => {
  it("drops Aumakua virus while blanked", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const aum = instantiateCard("aumakua", "au-1", "runner:installed");
    s.cards["au-1"] = aum;
    s.runner.installed = ["au-1"];
    const ice = instantiateCard("ice-wall", "ice-1", "server:hq:ice");
    ice.rezzed = false;
    s.cards["ice-1"] = ice;
    s.servers.hq.ice = ["ice-1"];

    completeExpose(s, "ice-1");
    expect(aum.virusCounters ?? 0).toBeGreaterThan(0);

    aum.virusCounters = 0;
    suppressAbilities(s, aum.id);
    expect(abilitiesSuppressed(s, "au-1")).toBe(true);
    completeExpose(s, "ice-1");
    expect(aum.virusCounters ?? 0).toBe(0);
  });
});
