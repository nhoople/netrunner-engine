/**
 * Blanked sources do not apply continuous draw, trace, access-cap, or
 * memory-cost modifiers (CR 9.12.1d).
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
  basicDrawBonus,
  traceBaseBonus,
} from "../src/state/staticFlags.js";
import { applyMaxAccessOtherThanSelf } from "../src/state/accessFilter.js";
import { effectiveMemoryCost } from "../src/state/turn.js";
import type { GameState, ServerId } from "../src/index.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.147.15");
});

describe("blanked draw / trace / access / MU cost (CR 9.12.1d)", () => {
  it("drops Laguna Velasco basic-draw bonus while blanked", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const laguna = instantiateCard(
      "laguna-velasco-district",
      "lv-1",
      "runner:installed",
    );
    s.cards["lv-1"] = laguna;
    s.runner.installed = ["lv-1"];

    expect(basicDrawBonus(s)).toBeGreaterThan(0);
    laguna.abilitiesBlanked = true;
    expect(basicDrawBonus(s)).toBe(0);
  });

  it("drops Rutherford Grid trace bonus while blanked", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const grid = instantiateCard("rutherford-grid", "rg-1", "server:hq:root");
    grid.rezzed = true;
    s.cards["rg-1"] = grid;
    s.servers.hq.root = ["rg-1"];
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
      strengthBoosts: {},
      encounterStrengthBoosts: {},
      iceStrengthBoosts: {},
      accessingCardId: null,
    };

    expect(traceBaseBonus(s)).toBeGreaterThan(0);
    grid.abilitiesBlanked = true;
    expect(traceBaseBonus(s)).toBe(0);
  });

  it("drops Flagship max-access-other-than-self while blanked", () => {
    function flagshipState(blanked: boolean): GameState {
      let s = createInitialState();
      s = structuredClone(s);
      const flag = instantiateCard("flagship", "fl-1", "server:remote-1:root");
      flag.rezzed = true;
      flag.abilitiesBlanked = blanked;
      s.cards["fl-1"] = flag;
      const agenda = instantiateCard(
        "priority-requisition",
        "ag-1",
        "server:remote-1:root",
      );
      s.cards["ag-1"] = agenda;
      s.servers["remote-1"] = {
        id: "remote-1",
        kind: "remote",
        ice: [],
        root: ["ag-1", "fl-1"],
      };
      s.run = {
        attackedServerId: "remote-1" as ServerId,
        phase: "breach",
        position: 0,
        successful: true,
        accessedCardIds: ["ag-1"],
        accessCandidates: ["ag-1", "fl-1"],
        randomAccessLimit: null,
        encounter: null,
        endedTheRun: false,
        cannotJackOut: false,
        strengthBoosts: {},
        encounterStrengthBoosts: {},
        iceStrengthBoosts: {},
        accessingCardId: null,
      };
      return s;
    }

    const active = flagshipState(false);
    applyMaxAccessOtherThanSelf(active);
    expect(active.run!.accessCandidates).toEqual(["fl-1"]);

    const blanked = flagshipState(true);
    applyMaxAccessOtherThanSelf(blanked);
    expect(blanked.run!.accessCandidates).toEqual(["ag-1", "fl-1"]);
  });

  it("drops self memoryCostZeroIfLinkGte while blanked", () => {
    let s = createInitialState();
    s = structuredClone(s);
    s.runner.link = 2;
    const prog = instantiateCard("corroder", "cor-1", "runner:installed");
    prog.memoryCost = 1;
    prog.memoryCostZeroIfLinkGte = 2;
    s.cards["cor-1"] = prog;
    s.runner.installed = ["cor-1"];

    expect(effectiveMemoryCost(s, "cor-1")).toBe(0);
    prog.abilitiesBlanked = true;
    expect(effectiveMemoryCost(s, "cor-1")).toBe(1);
  });
});
