/**
 * Blanked sources drop Security Nexus encounter offers and Femme Fatale
 * chosen-ice bypass while blanked (CR 9.12.1d).
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
import {
  chosenIceBypassOffered,
  securityNexusTraceOffered,
} from "../src/state/onEncounter.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.147.15");
});

describe("blanked lifecycle / ice rez / encounter (CR 9.12.1d)", () => {
  it("drops Security Nexus offer while blanked", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const nexus = instantiateCard("security-nexus", "sn-1", "runner:installed");
    s.cards["sn-1"] = nexus;
    s.runner.installed = ["sn-1"];
    expect(securityNexusTraceOffered(s)).toBe(true);
    nexus.abilitiesBlanked = true;
    expect(abilitiesSuppressed(s, "sn-1")).toBe(true);
    expect(securityNexusTraceOffered(s)).toBe(false);
  });

  it("drops Femme Fatale chosen-ice bypass while blanked", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const femme = instantiateCard("femme-fatale", "ff-1", "runner:installed");
    femme.chosenIceId = "ice-1";
    s.cards["ff-1"] = femme;
    s.runner.installed = ["ff-1"];
    s.runner.credits = 10;
    const ice = instantiateCard("ice-wall", "ice-1", "server:hq:ice");
    ice.rezzed = true;
    ice.subroutines = [
      { id: "s1", text: "End the run", effects: [] },
    ] as typeof ice.subroutines;
    s.cards["ice-1"] = ice;
    s.servers.hq.ice = ["ice-1"];
    s.run = {
      id: "run-1",
      attackedServerId: "hq",
      phase: "encounter_ice",
      position: 0,
      icePassed: 0,
      successful: false,
      breached: false,
      bypassedIceIds: [],
    } as typeof s.run;

    expect(chosenIceBypassOffered(s, "ice-1")).toBe(true);
    femme.abilitiesBlanked = true;
    expect(chosenIceBypassOffered(s, "ice-1")).toBe(false);
  });
});
