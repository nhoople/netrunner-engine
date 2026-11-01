/**
 * Continuous subtype layer (standardization S1 / fidelity phase 5).
 * Mother Goddess copies layered subtypes of other rezzed ice (CR 9.12.1d/e).
 */
import { beforeAll, describe, expect, it } from "vitest";
import {
  assertCardsPinnedTag,
  assertPinnedTag,
  cardsDataPresent,
  createInitialState,
  crDataPresent,
  effectiveIceSubtypes,
  instantiateCard,
} from "../src/index.js";
import { abilitiesSuppressed } from "../src/state/abilities.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.147.16");
});

describe("continuous subtype layer (CR 9.12)", () => {
  it("Mother Goddess gains Egret-granted subtypes on other ice (gained→further)", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const goddess = instantiateCard("mother-goddess", "mg-1", "server:hq:ice");
    goddess.rezzed = true;
    goddess.faceup = true;
    const wall = instantiateCard("ice-wall", "iw-1", "server:rd:ice");
    wall.rezzed = true;
    wall.faceup = true;
    // Ice Wall is barrier only printed; Egret grants B/CG/S.
    const egret = instantiateCard("egret", "eg-1", "runner:installed");
    egret.hostId = "iw-1";
    s.cards["mg-1"] = goddess;
    s.cards["iw-1"] = wall;
    s.cards["eg-1"] = egret;
    s.servers.hq.ice = ["mg-1"];
    s.servers.rd.ice = ["iw-1"];
    s.runner.installed = ["eg-1"];

    const wallSubs = effectiveIceSubtypes(s, "iw-1");
    expect(wallSubs).toEqual(
      expect.arrayContaining(["barrier", "code gate", "sentry"]),
    );

    const mg = effectiveIceSubtypes(s, "mg-1");
    expect(mg).toEqual(
      expect.arrayContaining(["barrier", "code gate", "sentry"]),
    );
  });

  it("Mother Goddess gains printed bioroid so Fatuma would see bioroid", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const goddess = instantiateCard("mother-goddess", "mg-1", "server:hq:ice");
    goddess.rezzed = true;
    const ansel = instantiateCard("ice-wall", "ansel-1", "server:rd:ice");
    ansel.rezzed = true;
    ansel.subtypes = ["barrier", "bioroid"];
    s.cards["mg-1"] = goddess;
    s.cards["ansel-1"] = ansel;
    s.servers.hq.ice = ["mg-1"];
    s.servers.rd.ice = ["ansel-1"];

    expect(effectiveIceSubtypes(s, "mg-1")).toContain("bioroid");
  });

  it("Hush blanks Mother Goddess before subtype grants apply (CR 9.12.1e)", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const goddess = instantiateCard("mother-goddess", "mg-1", "server:hq:ice");
    goddess.rezzed = true;
    const ansel = instantiateCard("ice-wall", "ansel-1", "server:rd:ice");
    ansel.rezzed = true;
    ansel.subtypes = ["barrier", "bioroid"];
    const hush = instantiateCard("hush", "hush-1", "runner:installed");
    hush.hostId = "mg-1";
    s.cards["mg-1"] = goddess;
    s.cards["ansel-1"] = ansel;
    s.cards["hush-1"] = hush;
    s.servers.hq.ice = ["mg-1"];
    s.servers.rd.ice = ["ansel-1"];
    s.runner.installed = ["hush-1"];

    expect(abilitiesSuppressed(s, "mg-1")).toBe(true);
    expect(effectiveIceSubtypes(s, "mg-1")).not.toContain("bioroid");
  });
});
