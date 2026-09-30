/**
 * Midnight Sun Echo: power on harmonic ice rez + ETR per power counter.
 */
import { describe, expect, it, beforeAll } from "vitest";
import {
  assertCardsPinnedTag,
  assertPinnedTag,
  cardsDataPresent,
  createInitialState,
  crDataPresent,
  instantiateCard,
} from "../src/index.js";
import { firePowerOnHarmonicIceRez } from "../src/state/powerCounters.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.116.0");
});

describe("MS Echo powerCounterOnHarmonicIceRez", () => {
  it("places power on Echo when any harmonic ice is rezzed", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const echo = instantiateCard("ice-wall", "echo-1", "server:hq:ice");
    echo.powerCounterOnHarmonicIceRez = true;
    echo.etrSubroutinesPerPowerCounter = true;
    echo.powerCounters = 0;
    echo.subtypes = ["barrier", "harmonic"];
    s.cards["echo-1"] = echo;
    s.servers.hq.ice = ["echo-1"];
    const wave = instantiateCard("ice-wall", "wave-1", "server:rd:ice");
    wave.subtypes = ["code gate", "harmonic"];
    wave.rezzed = true;
    s.cards["wave-1"] = wave;
    s.servers.rd.ice = ["wave-1"];
    firePowerOnHarmonicIceRez(s, "wave-1");
    expect(s.cards["echo-1"].powerCounters).toBe(1);
    expect(s.cards["echo-1"].subroutines![0]!.text).toBe("End the run.");
  });
});
