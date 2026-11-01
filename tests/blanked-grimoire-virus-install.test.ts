/**
 * Blanked sources drop Grimoire virus placement on virus-program install
 * (CR 9.12.1d).
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
import { noteVirusProgramInstalled } from "../src/state/virusInstall.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.147.14");
});

describe("blanked Grimoire virus install (CR 9.12.1d)", () => {
  it("drops Grimoire virus placement while blanked", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const grim = instantiateCard("grimoire", "gr-1", "runner:installed");
    const virus = instantiateCard("datasucker", "ds-1", "runner:installed");
    s.cards["gr-1"] = grim;
    s.cards["ds-1"] = virus;
    s.runner.installed = ["gr-1", "ds-1"];
    s.runner.identityId = "gr-1";

    noteVirusProgramInstalled(s, "ds-1");
    expect(virus.virusCounters ?? 0).toBeGreaterThan(0);

    virus.virusCounters = 0;
    s.turn.virusProgramsInstalledThisTurn = 0;
    s.turn.programsWithVirusPlacedThisTurn = [];
    grim.abilitiesBlanked = true;
    expect(abilitiesSuppressed(s, "gr-1")).toBe(true);
    noteVirusProgramInstalled(s, "ds-1");
    expect(virus.virusCounters ?? 0).toBe(0);
  });
});
