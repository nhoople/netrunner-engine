/**
 * Blanked sources do not apply continuous static locks / taxes (CR 9.12.1d).
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
import { midwayStationBreakTax } from "../src/actions/breakSubroutine.js";
import {
  naviMumbaiBlocksPaidAbilities,
  runnerHeapLocked,
} from "../src/state/cardDeclarations.js";
import { wirelessNetPavilionExtra } from "../src/state/costs.js";
import { checkWinConditions } from "../src/state/scoring.js";
import type { ServerId } from "../src/index.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.147.15");
});

describe("blanked static locks / taxes (CR 9.12.1d)", () => {
  it("drops Midway Station break tax while blanked", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const mid = instantiateCard(
      "midway-station-grid",
      "ms-1",
      "server:hq:root",
    );
    mid.rezzed = true;
    s.cards["ms-1"] = mid;
    s.servers.hq.root = ["ms-1"];
    s.run = {
      attackedServerId: "hq" as ServerId,
      phase: "encounter",
      position: 0,
      successful: false,
      accessedCardIds: [],
      accessCandidates: [],
      randomAccessLimit: null,
      encounter: null,
      endedTheRun: false,
      cannotJackOut: false,
      accessingCardId: null,
    };

    expect(midwayStationBreakTax(s)).toBeGreaterThan(0);
    mid.abilitiesBlanked = true;
    expect(midwayStationBreakTax(s)).toBe(0);
  });

  it("drops Navi Mumbai paid-ability block while blanked", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const navi = instantiateCard(
      "navi-mumbai-city-grid",
      "nm-1",
      "server:hq:root",
    );
    navi.rezzed = true;
    s.cards["nm-1"] = navi;
    s.servers.hq.root = ["nm-1"];
    s.run = {
      attackedServerId: "hq" as ServerId,
      phase: "encounter",
      position: 0,
      successful: false,
      accessedCardIds: [],
      accessCandidates: [],
      randomAccessLimit: null,
      encounter: null,
      endedTheRun: false,
      cannotJackOut: false,
      accessingCardId: null,
    };

    expect(naviMumbaiBlocksPaidAbilities(s)).toBe(true);
    navi.abilitiesBlanked = true;
    expect(naviMumbaiBlocksPaidAbilities(s)).toBe(false);
  });

  it("drops Wireless Net Pavilion trash tax while blanked", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const pav = instantiateCard(
      "wireless-net-pavilion",
      "wnp-1",
      "runner:installed",
    );
    s.cards["wnp-1"] = pav;
    s.runner.installed = ["wnp-1"];

    expect(wirelessNetPavilionExtra(s)).toBeGreaterThan(0);
    pav.abilitiesBlanked = true;
    expect(wirelessNetPavilionExtra(s)).toBe(0);
  });

  it("drops Blacklist heap lock while blanked", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const bl = instantiateCard("blacklist", "bl-1", "server:hq:root");
    bl.rezzed = true;
    s.cards["bl-1"] = bl;
    s.servers.hq.root = ["bl-1"];

    expect(runnerHeapLocked(s)).toBe(true);
    bl.abilitiesBlanked = true;
    expect(runnerHeapLocked(s)).toBe(false);
  });

  it("drops The Black File Corp win block while blanked", () => {
    let s = createInitialState();
    s = structuredClone(s);
    s.config.agendaPointsToWin = 7;
    const bf = instantiateCard("the-black-file", "tbf-1", "runner:installed");
    s.cards["tbf-1"] = bf;
    s.runner.installed = ["tbf-1"];
    for (const id of ["a1", "a2", "a3"] as const) {
      const ag = instantiateCard("priority-requisition", id, "corp:score-area");
      ag.agendaPoints = 3;
      s.cards[id] = ag;
    }
    s.corp.scoreArea = ["a1", "a2", "a3"];

    checkWinConditions(s);
    expect(s.winner).toBeNull();
    expect(s.done).toBeFalsy();

    bf.abilitiesBlanked = true;
    checkWinConditions(s);
    expect(s.winner).toBe("corp");
  });
});
