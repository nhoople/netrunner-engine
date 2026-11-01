/**
 * Blanked ice loses its own static strength abilities (CR 9.12.1d).
 * Printed strength remains; Wraparound's +7 does not.
 */
import { beforeAll, describe, expect, it } from "vitest";
import {
  abilitiesSuppressed,
  assertCardsPinnedTag,
  assertPinnedTag,
  cardsDataPresent,
  createInitialState,
  crDataPresent,
  effectiveIceStrength,
  instantiateCard,
} from "../src/index.js";
import { iceStrength } from "../src/effects/iceStrength.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.147.14");
});

describe("blanked ice static strength (CR 9.12.1d)", () => {
  it("Hush on Wraparound drops strength from 7 to printed 0", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const wrap = instantiateCard("wraparound", "wrap-1", "server:hq:ice");
    wrap.rezzed = true;
    s.cards["wrap-1"] = wrap;
    s.servers.hq.ice = ["wrap-1"];
    expect(effectiveIceStrength(s, "wrap-1")).toBe(7);

    const hush = instantiateCard("hush", "hush-1", "runner:installed");
    hush.hostId = "wrap-1";
    s.cards["hush-1"] = hush;
    s.runner.installed = ["hush-1"];

    expect(abilitiesSuppressed(s, "wrap-1")).toBe(true);
    expect(effectiveIceStrength(s, "wrap-1")).toBe(0);
    expect(iceStrength(s, "wrap-1")).toBe(0);
  });

  it("Hush on Ice Wall drops advancement strength but keeps printed", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const wall = instantiateCard("ice-wall", "wall-1", "server:hq:ice");
    wall.rezzed = true;
    wall.advancementCounters = 2;
    s.cards["wall-1"] = wall;
    s.servers.hq.ice = ["wall-1"];
    expect(effectiveIceStrength(s, "wall-1")).toBe(3);

    const hush = instantiateCard("hush", "hush-1", "runner:installed");
    hush.hostId = "wall-1";
    s.cards["hush-1"] = hush;
    s.runner.installed = ["hush-1"];

    expect(abilitiesSuppressed(s, "wall-1")).toBe(true);
    expect(effectiveIceStrength(s, "wall-1")).toBe(1);
  });

  it("removing Hush restores Wraparound's +7", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const wrap = instantiateCard("wraparound", "wrap-1", "server:hq:ice");
    wrap.rezzed = true;
    s.cards["wrap-1"] = wrap;
    s.servers.hq.ice = ["wrap-1"];
    const hush = instantiateCard("hush", "hush-1", "runner:installed");
    hush.hostId = "wrap-1";
    s.cards["hush-1"] = hush;
    s.runner.installed = ["hush-1"];
    expect(effectiveIceStrength(s, "wrap-1")).toBe(0);

    s.runner.installed = [];
    delete s.cards["hush-1"];
    expect(abilitiesSuppressed(s, "wrap-1")).toBe(false);
    expect(effectiveIceStrength(s, "wrap-1")).toBe(7);
  });
});
